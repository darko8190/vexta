namespace Vexta.Api.Domain;

/// <summary>
/// A logo or icon the super admin uploaded, replacing the one configured in the environment.
///
/// The bytes live in the database rather than in R2 on purpose. These are a handful of small
/// files that the sign-in page needs before anything else works, so they must not depend on an
/// integration a fresh deployment has not configured yet. They are also not secret, so unlike
/// <see cref="PlatformSetting"/> they are stored as-is: a lost data protection key ring would
/// otherwise take the logo with it.
/// </summary>
public class BrandingAsset
{
    /// <summary>One of <see cref="BrandingSlots"/>. Also the primary key: one image per slot.</summary>
    public required string Slot { get; set; }

    public required string ContentType { get; set; }
    public required byte[] Content { get; set; }

    /// <summary>
    /// The image's natural size, measured by the browser before upload. Kept so the page can
    /// reserve the right space and the logo does not shift the layout as it loads.
    /// </summary>
    public int Width { get; set; }
    public int Height { get; set; }

    /// <summary>
    /// Lets the browser revalidate with If-None-Match instead of re-downloading. It changes on
    /// every upload, which is what makes a new logo appear immediately despite a long cache.
    /// </summary>
    public required string ETag { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public static class BrandingSlots
{
    public const string LogoLight = "logo-light";
    public const string LogoDark = "logo-dark";
    public const string Icon = "icon";

    public static readonly string[] All = [LogoLight, LogoDark, Icon];

    public static bool IsValid(string? slot) =>
        slot is not null && All.Contains(slot, StringComparer.Ordinal);
}
