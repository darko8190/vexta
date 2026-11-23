using System.Text.Json;
using Anthropic;
using Anthropic.Models.Beta;
using Anthropic.Models.Beta.Messages;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>
/// What a model found on a receipt. Every field is nullable because every field is sometimes
/// missing: a parking stub has no supplier line, a handwritten slip has no invoice number, and
/// a photograph taken in a truck at dusk sometimes has nothing at all.
///
/// Nothing here is saved. It goes back to the form the person is already filling, they look at
/// it, and they decide. A receipt read wrong and filed silently ends up on a client's invoice,
/// and it is the company that answers the telephone about it.
/// </summary>
public record ReceiptReading(
    string? Supplier,
    decimal? Total,
    decimal? Gst,
    decimal? Qst,
    DateOnly? SpentOn,
    string? InvoiceNumber);

/// <param name="Reading">Null when nothing could be read, or when the scan was refused.</param>
/// <param name="Message">Said to the person. Null when the reading speaks for itself.</param>
/// <param name="Remaining">Scans left in the allowance this month, after this one.</param>
public record ReceiptScanResult(ReceiptReading? Reading, string? Message, int Remaining);

/// <param name="Available">The platform has a key, the plan includes scans, and some are left.</param>
public record ReceiptScanAvailability(bool Available, int Remaining, int Allowance);

public interface IReceiptScanner
{
    /// <summary>
    /// Whether the button is worth offering, asked before anything is attached. Three things
    /// can make it no: no key on the platform, no allowance in the plan, none left this month.
    /// </summary>
    Task<ReceiptScanAvailability> AvailabilityAsync(CancellationToken ct = default);

    /// <summary>
    /// Reads one photographed or scanned receipt.
    ///
    /// Never throws for an ordinary failure — an unreadable photograph, a key the API refused, a
    /// month's allowance already spent. Those come back as a message the person can act on,
    /// because the alternative is a red toast saying "erreur" in front of somebody holding a
    /// receipt who now has to guess what to do.
    /// </summary>
    Task<ReceiptScanResult> ReadAsync(Guid mediaAssetId, CancellationToken ct = default);
}

public class ReceiptScanner(
    VextaDbContext db,
    IPlatformSettingsService settings,
    IR2StorageService storage,
    ICurrentUserService currentUser,
    ILogger<ReceiptScanner> logger) : IReceiptScanner
{
    /// <summary>
    /// Opus, because a receipt is a hard read — creased paper, thermal print that has faded, a
    /// photograph taken at an angle in bad light — and a total read wrong is worse than no total
    /// at all.
    ///
    /// Roughly two cents a receipt: a phone photograph is about 2 000 input tokens, and the
    /// answer with its thinking a few hundred output ones. A hundred receipts a month is a
    /// couple of dollars, which is why the allowance on the plan is the thing that matters and
    /// not the model.
    ///
    /// To trade accuracy for price, "claude-haiku-5-5" is the one-line change and costs about a
    /// fortieth as much. It is a real trade: it will read a clean supplier invoice and lose more
    /// of the crumpled ones, and a crumpled one is why this feature exists.
    /// </summary>
    private const string Model = "claude-opus-5-5";

    /// <summary>
    /// Room for the model to think and then answer. The answer itself is six short fields, but
    /// thinking is always on for this model and is billed out of the same ceiling, so a tight
    /// cap here would truncate the reading rather than save anything worth saving.
    /// </summary>
    private const int MaxTokens = 4096;

    /// <summary>
    /// What a plan without a row of its own gets: a tenant created by hand, which is every
    /// tenant on a development machine and the ones made for a trial.
    /// </summary>
    private const int DefaultMonthlyAllowance = 100;

    /// <summary>
    /// Past this, the photograph is refused before it leaves the server. The API accepts more,
    /// but a 20 MB picture of a parking stub is a phone that was not told to compress, and
    /// sending it would be paying to transmit noise.
    /// </summary>
    private const long MaxBytes = 10 * 1024 * 1024;

    private static readonly string[] ReadableImageTypes =
        ["image/jpeg", "image/png", "image/gif", "image/webp"];

    public async Task<ReceiptScanAvailability> AvailabilityAsync(CancellationToken ct = default)
    {
        if (currentUser.TenantId is not { } tenantId) return new ReceiptScanAvailability(false, 0, 0);

        var configured = !string.IsNullOrWhiteSpace(
            await settings.GetAsync(PlatformSettingKeys.AnthropicApiKey, ct));

        var allowance = await AllowanceAsync(tenantId, ct);
        var remaining = Math.Max(0, allowance - await UsedThisMonthAsync(tenantId, ct));

        return new ReceiptScanAvailability(configured && remaining > 0, remaining, allowance);
    }

    public async Task<ReceiptScanResult> ReadAsync(Guid mediaAssetId, CancellationToken ct = default)
    {
        if (currentUser.TenantId is not { } tenantId)
        {
            return new ReceiptScanResult(null, "Aucun espace actif.", 0);
        }

        var apiKey = await settings.GetAsync(PlatformSettingKeys.AnthropicApiKey, ct);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new ReceiptScanResult(
                null, "La lecture de reçus n'est pas configurée sur la plateforme.", 0);
        }

        var allowance = await AllowanceAsync(tenantId, ct);
        var used = await UsedThisMonthAsync(tenantId, ct);

        if (allowance == 0)
        {
            return new ReceiptScanResult(
                null, "La lecture de reçus n'est pas incluse dans votre forfait.", 0);
        }

        if (used >= allowance)
        {
            return new ReceiptScanResult(
                null,
                $"Les {allowance} lectures de reçus du mois sont utilisées. Elles reprennent le 1er du mois prochain.",
                0);
        }

        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == mediaAssetId, ct);
        if (asset is null) return new ReceiptScanResult(null, "Ce fichier n'existe plus.", allowance - used);

        var isPdf = asset.ContentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase);
        if (!isPdf && !ReadableImageTypes.Contains(asset.ContentType.ToLowerInvariant()))
        {
            return new ReceiptScanResult(
                null, "Ce type de fichier ne peut pas être lu. Prenez une photo ou joignez un PDF.",
                allowance - used);
        }

        byte[] bytes;
        try
        {
            bytes = await storage.ReadAsync(asset.ObjectKey, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lecture impossible du fichier {ObjectKey} pour un scan de reçu.", asset.ObjectKey);
            return new ReceiptScanResult(null, "Le fichier n'a pas pu être récupéré.", allowance - used);
        }

        if (bytes.LongLength > MaxBytes)
        {
            return new ReceiptScanResult(
                null, "Cette image est trop lourde pour être lue. Reprenez la photo.", allowance - used);
        }

        var client = new AnthropicClient { ApiKey = apiKey };

        try
        {
            var response = await client.Beta.Messages.Create(new MessageCreateParams
            {
                Model = Model,
                MaxTokens = MaxTokens,

                // Low, because this is a reading and not a problem: the figures are printed on
                // the paper. Thinking cannot be turned off on this model, and effort is the
                // control that matters for what a scan costs.
                OutputConfig = new BetaOutputConfig
                {
                    Effort = Effort.Low,
                    Format = new BetaJsonOutputFormat { Schema = Schema() },
                },

                // A safety classifier declining a photograph of a receipt is not something we
                // expect, but a decline would otherwise end the call with nothing. The fallback
                // is served inside the same request.
                Betas = [AnthropicBeta.ServerSideFallback2026_07_01],
                Fallbacks = new Default(),

                System = Instructions,
                Messages =
                [
                    new BetaUserMessageParam
                    {
                        Content = new List<BetaContentBlockParam>
                        {
                            Attachment(isPdf, asset.ContentType, bytes),
                            new BetaTextBlockParam { Text = "Lis ce reçu." },
                        },
                    },
                ],
            }, cancellationToken: ct);

            var reading = Parse(response);

            await RecordAsync(tenantId, mediaAssetId, reading is not null, response, ct);

            return new ReceiptScanResult(
                reading,
                reading is null
                    ? "Rien n'a pu être lu sur cette image. Saisissez les montants à la main."
                    : null,
                Math.Max(0, allowance - used - 1));
        }
        catch (Exception ex)
        {
            // Not recorded: nothing was read and, for a transport failure, nothing was charged.
            // A key the API refuses lands here too, which is why the message says to warn
            // somebody rather than to try again.
            logger.LogError(ex, "Lecture du reçu {MediaAssetId} impossible.", mediaAssetId);
            return new ReceiptScanResult(
                null, "La lecture a échoué. Saisissez les montants à la main.", allowance - used);
        }
    }

    /// <summary>
    /// The receipt, as the API wants it. A PDF goes in as a document and a photograph as an
    /// image — the same bytes in the wrong block type is a 400, and suppliers send both.
    /// </summary>
    private static BetaContentBlockParam Attachment(bool isPdf, string contentType, byte[] bytes)
    {
        var data = Convert.ToBase64String(bytes);

        return isPdf
            ? new BetaRequestDocumentBlock { Source = new BetaBase64PdfSource { Data = data } }
            : new BetaImageBlockParam
            {
                Source = new BetaBase64ImageSource
                {
                    Data = data,
                    MediaType = contentType.ToLowerInvariant(),
                },
            };
    }

    private const string Instructions = """
        Tu lis des reçus et des factures de fournisseurs pour une entreprise québécoise, pour
        remplir un formulaire de dépense. Les documents sont en français ou en anglais.

        Règles :
        - N'invente jamais. Un champ que tu ne peux pas lire avec certitude est null. Un champ
          vide sera rempli à la main en deux secondes ; un champ faux se retrouve sur la facture
          d'un client.
        - « total » est le montant payé, taxes comprises.
        - « tps » et « tvq » sont les taxes si elles sont détaillées sur le document. Si une
          seule taxe est indiquée sans dire laquelle, laisse les deux à null.
        - Les montants sont des nombres, sans symbole de devise. « 1 234,56 $ » devient 1234.56.
        - « date » est la date de la transaction au format AAAA-MM-JJ. Si l'année est écrite sur
          deux chiffres, complète-la vers l'année la plus plausible dans le passé proche.
        - « fournisseur » est le nom du commerce, pas son adresse ni son slogan.
        - « numero » est le numéro de facture ou de reçu, s'il y en a un.
        - Si l'image n'est pas un reçu, ou si elle est illisible, mets tous les champs à null.
        """;

    /// <summary>
    /// Every field required and every field nullable. That is the shape that makes a strict
    /// schema and "do not invent" compatible: the model must answer about each field, and "je
    /// ne sais pas" is an answer it is allowed to give.
    /// </summary>
    private static Dictionary<string, JsonElement> Schema()
    {
        static object Nullable(string type, string description) =>
            new { type = new[] { type, "null" }, description };

        return new Dictionary<string, JsonElement>
        {
            ["type"] = JsonSerializer.SerializeToElement("object"),
            ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
            ["required"] = JsonSerializer.SerializeToElement(
                new[] { "fournisseur", "total", "tps", "tvq", "date", "numero" }),
            ["properties"] = JsonSerializer.SerializeToElement(new
            {
                fournisseur = Nullable("string", "Le nom du commerce."),
                total = Nullable("number", "Le montant payé, taxes comprises."),
                tps = Nullable("number", "La TPS, si elle est détaillée."),
                tvq = Nullable("number", "La TVQ, si elle est détaillée."),
                date = Nullable("string", "La date de la transaction, AAAA-MM-JJ."),
                numero = Nullable("string", "Le numéro de facture ou de reçu."),
            }),
        };
    }

    /// <summary>
    /// The JSON the model answered, turned into the reading — or null when it found nothing.
    ///
    /// A reading where every field came back null is treated as nothing found rather than as a
    /// success with six blanks: the form would look like it had been filled in with emptiness.
    /// </summary>
    private ReceiptReading? Parse(BetaMessage response)
    {
        var text = string.Concat(
            response.Content
                .Select(block => block.TryPickText(out var t) ? t.Text : null)
                .Where(t => !string.IsNullOrWhiteSpace(t)));

        if (string.IsNullOrWhiteSpace(text)) return null;

        try
        {
            using var document = JsonDocument.Parse(text);
            var root = document.RootElement;

            var reading = new ReceiptReading(
                Text(root, "fournisseur"),
                Money(root, "total"),
                Money(root, "tps"),
                Money(root, "tvq"),
                Day(root, "date"),
                Text(root, "numero"));

            var empty = reading is
            {
                Supplier: null, Total: null, Gst: null, Qst: null, SpentOn: null, InvoiceNumber: null
            };

            return empty ? null : reading;
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Réponse illisible du modèle pour un scan de reçu.");
            return null;
        }
    }

    private static string? Text(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() is { Length: > 0 } text ? text.Trim() : null
            : null;

    private static decimal? Money(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetDecimal(out var amount) && amount >= 0
            ? Math.Round(amount, 2, MidpointRounding.AwayFromZero)
            : null;

    /// <summary>
    /// A date, refused when it is not plausible. A model that reads "03/04" off a faded slip can
    /// produce the year 20 or 2203, and a dépense filed in the year 2203 is one nobody finds again.
    /// </summary>
    private static DateOnly? Day(JsonElement root, string name)
    {
        if (Text(root, name) is not { } text) return null;
        if (!DateOnly.TryParse(text, System.Globalization.CultureInfo.InvariantCulture, out var day)) return null;

        var today = BusinessDay.Today;
        return day.Year < today.Year - 10 || day > today.AddDays(2) ? null : day;
    }

    private async Task RecordAsync(
        Guid tenantId, Guid mediaAssetId, bool found, BetaMessage response, CancellationToken ct)
    {
        db.ReceiptScans.Add(new ReceiptScan
        {
            TenantId = tenantId,
            MediaAssetId = mediaAssetId,
            RequestedByUserId = currentUser.UserId,
            FoundSomething = found,
            InputTokens = (int)response.Usage.InputTokens,
            OutputTokens = (int)response.Usage.OutputTokens,
            Model = Model,
        });

        await db.SaveChangesAsync(ct);
    }

    /// <summary>How many this tenant's plan includes. A tenant with no plan gets the default.</summary>
    private async Task<int> AllowanceAsync(Guid tenantId, CancellationToken ct)
    {
        var allowance = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId && t.PlanId != null)
            .Select(t => (int?)t.Plan!.MonthlyReceiptScans)
            .FirstOrDefaultAsync(ct);

        return allowance ?? DefaultMonthlyAllowance;
    }

    /// <summary>
    /// Scans since the first of the month, in the company's own calendar. Counted rather than
    /// kept in a column: a stored counter and a list of rows are two things that must agree, and
    /// one month they will not.
    /// </summary>
    private async Task<int> UsedThisMonthAsync(Guid tenantId, CancellationToken ct)
    {
        var today = BusinessDay.Today;
        var firstOfMonth = new DateTimeOffset(
            new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc));

        return await db.ReceiptScans.IgnoreQueryFilters()
            .CountAsync(s => s.TenantId == tenantId && s.CreatedAt >= firstOfMonth, ct);
    }
}
