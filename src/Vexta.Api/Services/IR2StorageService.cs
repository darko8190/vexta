using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IR2StorageService
{
    Task<bool> IsConfiguredAsync(CancellationToken ct = default);

    /// <summary>
    /// A short-lived URL the browser PUTs the file to, straight to R2.
    /// <paramref name="contentEncoding"/> is signed into the URL when the browser compressed the
    /// bytes, so R2 stores the encoding alongside the object and every later read inflates on its
    /// own. The browser must then send exactly that header, or the signature will not match.
    /// </summary>
    Task<string> CreateUploadUrlAsync(
        string objectKey, string contentType, string? contentEncoding = null, CancellationToken ct = default);

    /// <summary>
    /// Where to read the file. A public base URL is used when one is configured, otherwise a
    /// short-lived signed URL, so a private bucket works without one.
    /// </summary>
    Task<string> CreateDownloadUrlAsync(string objectKey, string fileName, CancellationToken ct = default);

    /// <summary>
    /// The bytes themselves, for the rare caller that has to read a file rather than hand out a
    /// link to it — the receipt scanner, which sends the image to a model.
    ///
    /// Gunzipped on the way out when the object was stored compressed, so callers get the file
    /// as the person uploaded it and never have to know how it was kept.
    /// </summary>
    Task<byte[]> ReadAsync(string objectKey, CancellationToken ct = default);

    /// <summary>
    /// Puts bytes this application produced into the bucket.
    ///
    /// Every other file in the system arrives through a presigned URL, straight from the
    /// browser, which is deliberate: the bytes never pass through the API. This exists for the
    /// one file nobody uploads -- the CV document generated when somebody applies with a CV
    /// they typed here rather than one they had on disk.
    /// </summary>
    Task WriteAsync(string objectKey, byte[] content, string contentType, CancellationToken ct = default);

    Task DeleteAsync(string objectKey, CancellationToken ct = default);

    /// <summary>
    /// Copies an object inside the bucket, server side: nothing is downloaded and nothing is
    /// re-uploaded.
    ///
    /// It exists for one case, and the case is the reason it is a copy rather than a shared
    /// reference. When somebody applies for a job, the CV they uploaded under their own prefix
    /// is copied under the company's. The company then owns what it received and can open it
    /// through its own tenant-scoped routes, with no endpoint anywhere reading across tenants --
    /// and the applicant can delete their own copy later without erasing the application the
    /// company already has in its hands.
    /// </summary>
    Task CopyAsync(string sourceObjectKey, string destinationObjectKey, CancellationToken ct = default);

    /// <summary>Throws with a readable reason when the credentials or bucket are wrong.</summary>
    Task CheckConnectionAsync(CancellationToken ct = default);
}

public record R2Configuration(
    string AccountId,
    string AccessKeyId,
    string SecretAccessKey,
    string Bucket,
    string? PublicBaseUrl);

public class R2StorageService(IPlatformSettingsService settings) : IR2StorageService
{
    private static readonly TimeSpan UploadUrlLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan DownloadUrlLifetime = TimeSpan.FromMinutes(15);

    private static readonly string[] ConfigKeys =
    [
        PlatformSettingKeys.R2AccountId,
        PlatformSettingKeys.R2AccessKeyId,
        PlatformSettingKeys.R2SecretAccessKey,
        PlatformSettingKeys.R2Bucket,
        PlatformSettingKeys.R2PublicBaseUrl
    ];

    public async Task<bool> IsConfiguredAsync(CancellationToken ct = default) =>
        await ReadConfigurationAsync(ct) is not null;

    private async Task<R2Configuration?> ReadConfigurationAsync(CancellationToken ct)
    {
        var values = await settings.GetManyAsync(ConfigKeys, ct);

        var accountId = values[PlatformSettingKeys.R2AccountId];
        var accessKeyId = values[PlatformSettingKeys.R2AccessKeyId];
        var secret = values[PlatformSettingKeys.R2SecretAccessKey];
        var bucket = values[PlatformSettingKeys.R2Bucket];

        if (string.IsNullOrWhiteSpace(accountId)
            || string.IsNullOrWhiteSpace(accessKeyId)
            || string.IsNullOrWhiteSpace(secret)
            || string.IsNullOrWhiteSpace(bucket))
        {
            return null;
        }

        return new R2Configuration(
            accountId.Trim(),
            accessKeyId.Trim(),
            secret.Trim(),
            bucket.Trim(),
            string.IsNullOrWhiteSpace(values[PlatformSettingKeys.R2PublicBaseUrl])
                ? null
                : values[PlatformSettingKeys.R2PublicBaseUrl]!.Trim().TrimEnd('/'));
    }

    private async Task<R2Configuration> RequireConfigurationAsync(CancellationToken ct) =>
        await ReadConfigurationAsync(ct)
        ?? throw new InvalidOperationException(
            "Le stockage R2 n'est pas configuré. Un administrateur doit l'ajouter dans Intégrations.");

    private static IAmazonS3 CreateClient(R2Configuration config) =>
        new AmazonS3Client(
            new BasicAWSCredentials(config.AccessKeyId, config.SecretAccessKey),
            new AmazonS3Config
            {
                ServiceURL = $"https://{config.AccountId}.r2.cloudflarestorage.com",
                // R2 ignores the region but the SDK refuses to sign without one.
                AuthenticationRegion = "auto",
                ForcePathStyle = true,
                // R2 rejects the integrity checksums the SDK adds by default, and a browser PUTting
                // to a presigned URL cannot send them anyway.
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
            });

    public async Task<string> CreateUploadUrlAsync(
        string objectKey, string contentType, string? contentEncoding = null, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);

        var request = new GetPreSignedUrlRequest
        {
            BucketName = config.Bucket,
            Key = objectKey,
            Verb = HttpVerb.PUT,
            // Signed in, so the upload cannot claim a different type than the one we recorded.
            ContentType = contentType,
            Expires = DateTime.UtcNow.Add(UploadUrlLifetime)
        };

        if (!string.IsNullOrWhiteSpace(contentEncoding))
        {
            // Stored on the object itself rather than applied per read. That is what makes the
            // decompression work through a public bucket URL too, where there is no signed
            // request to attach response overrides to.
            request.Headers.ContentEncoding = contentEncoding;
        }

        return await client.GetPreSignedURLAsync(request);
    }

    public async Task<string> CreateDownloadUrlAsync(
        string objectKey, string fileName, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);

        if (config.PublicBaseUrl is { } publicBase)
        {
            return $"{publicBase}/{Uri.EscapeDataString(objectKey)}";
        }

        using var client = CreateClient(config);

        return await client.GetPreSignedURLAsync(new GetPreSignedUrlRequest
        {
            BucketName = config.Bucket,
            Key = objectKey,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.Add(DownloadUrlLifetime),
            // Keeps the original name when the browser saves it.
            ResponseHeaderOverrides = new ResponseHeaderOverrides
            {
                ContentDisposition = $"inline; filename=\"{Uri.EscapeDataString(fileName)}\""
            }
        });
    }

    public async Task<byte[]> ReadAsync(string objectKey, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);

        using var response = await client.GetObjectAsync(
            new GetObjectRequest { BucketName = config.Bucket, Key = objectKey }, ct);

        using var buffer = new MemoryStream();
        await response.ResponseStream.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        // The browser compresses some uploads before sending them, and R2 keeps the encoding on
        // the object. A browser inflates that on its own; a caller reading the bytes here does
        // not, so it is done once, in the one place that knows the file was stored that way.
        if (string.Equals(response.Headers.ContentEncoding, "gzip", StringComparison.OrdinalIgnoreCase))
        {
            using var compressed = new MemoryStream(bytes);
            using var gzip = new System.IO.Compression.GZipStream(
                compressed, System.IO.Compression.CompressionMode.Decompress);
            using var inflated = new MemoryStream();
            await gzip.CopyToAsync(inflated, ct);
            return inflated.ToArray();
        }

        return bytes;
    }

    public async Task WriteAsync(
        string objectKey, byte[] content, string contentType, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);
        using var stream = new MemoryStream(content, writable: false);

        await client.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = config.Bucket,
                Key = objectKey,
                InputStream = stream,
                ContentType = contentType
            },
            ct);
    }

    public async Task DeleteAsync(string objectKey, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);

        await client.DeleteObjectAsync(
            new DeleteObjectRequest { BucketName = config.Bucket, Key = objectKey }, ct);
    }

    public async Task CopyAsync(
        string sourceObjectKey, string destinationObjectKey, CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);

        await client.CopyObjectAsync(
            new CopyObjectRequest
            {
                SourceBucket = config.Bucket,
                SourceKey = sourceObjectKey,
                DestinationBucket = config.Bucket,
                DestinationKey = destinationObjectKey
            },
            ct);
    }

    public async Task CheckConnectionAsync(CancellationToken ct = default)
    {
        var config = await RequireConfigurationAsync(ct);
        using var client = CreateClient(config);

        try
        {
            // Listing one key proves the credentials sign correctly and the bucket exists, without
            // writing anything.
            await client.ListObjectsV2Async(
                new ListObjectsV2Request { BucketName = config.Bucket, MaxKeys = 1 }, ct);
        }
        catch (AmazonS3Exception ex)
        {
            throw new InvalidOperationException(
                $"R2 a refusé la connexion : {ex.Message}", ex);
        }
        // Everything short of an answer from R2: an account ID that names no endpoint, a network
        // that cannot reach Cloudflare, a timeout. These used to escape as a bare server error,
        // which told the person at the screen nothing they could act on.
        catch (Exception ex) when (ex is AmazonClientException or HttpRequestException or TaskCanceledException
                                       && !ct.IsCancellationRequested)
        {
            // The useful sentence is at the bottom: "Authentication failed, see inner exception"
            // wraps the certificate error that actually says what went wrong.
            var innermost = ex;
            while (innermost.InnerException is not null) innermost = innermost.InnerException;
            var detail = innermost.Message;
            throw new InvalidOperationException(
                $"R2 est injoignable à {config.AccountId}.r2.cloudflarestorage.com : {detail.TrimEnd('.')}. Vérifiez l'ID de compte.", ex);
        }
    }
}
