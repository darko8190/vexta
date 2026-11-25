namespace Vexta.Api.Features.Quotes;

/// <summary>
/// Reads the signature pad's output: a PNG data URL, as the browser's canvas gives it.
///
/// Checked rather than trusted. What comes back is printed on a contract, so it must be a real
/// PNG and not whatever a crafted request put after the comma, and it must stay small: a pad
/// stroke is a few kilobytes, and a megabyte there is not a signature.
/// </summary>
public static class SignaturePng
{
    private const string Prefix = "data:image/png;base64,";

    /// <summary>A generous ceiling for a stroke on a 2× screen; a photo would be far past it.</summary>
    public const int MaxBytes = 150_000;

    private static readonly byte[] Magic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    /// <summary>The PNG's bytes, or null when the value is not a usable signature.</summary>
    public static byte[]? Read(string? dataUrl)
    {
        if (dataUrl is null || !dataUrl.StartsWith(Prefix, StringComparison.Ordinal)) return null;
        var encoded = dataUrl.AsSpan(Prefix.Length);
        // Base64 runs four characters for three bytes: refuse an oversize value before decoding it.
        if (encoded.Length > (MaxBytes + 2) / 3 * 4) return null;

        var bytes = new byte[encoded.Length * 3 / 4];
        if (!Convert.TryFromBase64Chars(encoded, bytes, out var written)) return null;
        if (written < Magic.Length || !bytes.AsSpan(0, Magic.Length).SequenceEqual(Magic)) return null;
        return bytes[..written];
    }
}
