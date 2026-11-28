using Vexta.Api.Domain;

namespace Vexta.Api.Features.Company;

/// <summary>
/// The company's own profile — what appears on its documents and on screens its clients see.
/// The address is the primary company location, not a copy of it.
/// </summary>
public record CompanyProfileDto(
    Guid Id,
    string Name,
    string Slug,
    string Kind,
    string? Description,
    string? ContactEmail,
    string? Phone,
    /// <summary>Null when no logo is on file; otherwise the cache buster for its image URL.</summary>
    string? LogoETag,
    /// <summary>The company's chosen colour as #RRGGBB, or null for Vexta's blue.</summary>
    string? BrandColor,
    /// <summary>The NEQ or equivalent. Asked at sign-up, never required, editable here.</summary>
    string? BusinessNumber,
    CompanyAddressDto? Address);

public record CompanyAddressDto(
    string Label,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country);

public record SaveCompanyProfileRequest(
    string Name,
    string? Description,
    string? ContactEmail,
    string? Phone,
    /// <summary>#RRGGBB, or null/blank to go back to Vexta's blue.</summary>
    string? BrandColor,
    string? BusinessNumber = null);

/// <summary>Base64 rather than multipart, for the same reason as the platform branding upload.</summary>
public record UploadCompanyLogoRequest(string ContentType, byte[] Content, int Width, int Height);

// ---- The company's own public page, as its owner edits it ----

/// <summary>
/// What the owner has written for /e/{slug}. The slug is carried along so the editor can show
/// the address the page will live at without asking for the profile as well.
/// </summary>
public record PublicPageSettingsDto(
    bool IsPublished,
    string? Headline,
    string? About,
    string? ContactNote,
    bool ShowProducts,
    bool ShowJobs,
    bool ShowForms,
    bool AcceptsOrders,
    bool RequiresOnlinePayment,
    /// <summary>
    /// Whether the company's own Stripe account can take a charge today. Sent with the page's
    /// settings because the switch above depends on it, and a toggle that refuses without
    /// saying why is a toggle somebody presses four times.
    /// </summary>
    bool CanChargeOnline,
    PublicPageStyle Style,
    string Slug,
    /// <summary>Null while nothing has ever been saved — the page is defaults, not a record.</summary>
    DateTimeOffset? UpdatedAt,
    bool ShowAbout,
    bool ShowLogo,
    bool ShowHeadline,
    string? FooterTitle,
    string? FooterText,
    bool FooterShowAddress,
    bool FooterShowPhone,
    bool FooterShowEmail);

public record SavePublicPageRequest(
    bool IsPublished,
    string? Headline,
    string? About,
    string? ContactNote,
    bool ShowProducts,
    bool ShowJobs,
    bool ShowForms,
    bool AcceptsOrders,
    bool RequiresOnlinePayment,
    PublicPageStyle Style,
    // Optional, and kept as they are when left out: the switch that publishes the page and the
    // guide's steps save the page too, and know nothing of its head and foot.
    bool? ShowAbout = null,
    bool? ShowLogo = null,
    bool? ShowHeadline = null,
    string? FooterTitle = null,
    string? FooterText = null,
    bool? FooterShowAddress = null,
    bool? FooterShowPhone = null,
    bool? FooterShowEmail = null);

/// <summary>
/// A position on the shop window. Deliberately not the row the company reads: a posting also
/// carries the company's own notes, how many people it is hiring and how many have applied,
/// and none of that is a visitor's business. The hiring side of it lives in
/// Vexta.Api.Features.Hr.JobPostingDto.
/// </summary>
public record PublicJobDto(
    Guid Id,
    string Title,
    string? Description,
    string? Location,
    EmploymentType EmploymentType,
    string? Compensation,
    string? ApplyTo,
    /// <summary>
    /// Whether there is a form to fill. The questions themselves are fetched only when somebody
    /// presses Postuler: most visitors read a posting and never apply.
    /// </summary>
    bool HasForm,
    List<PublicJobDocumentDto> Documents,
    DateTimeOffset CreatedAt,
    /// <summary>The group it is listed under. Null lists it under « Autres ».</summary>
    string? Category = null);

/// <summary>
/// A file the company hung on a posting. The link is a signed URL minted for this response, as
/// everywhere else -- the bucket is never public.
/// </summary>
public record PublicJobDocumentDto(
    Guid Id,
    string Label,
    string ContentType,
    long SizeBytes,
    /// <summary>Null when storage could not be reached. The posting still belongs on the page.</summary>
    string? Url);

/// <summary>The setup guide's progress as the screen wrote it, or null before it was opened.</summary>
public record HiddenNavigationDto(IReadOnlyList<string> Keys);

public record SetupGuideDto(System.Text.Json.JsonElement? State);

public record SaveSetupGuideRequest(System.Text.Json.JsonElement State);
