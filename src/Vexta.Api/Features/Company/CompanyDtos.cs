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
    string? BrandColor);

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
    string Slug,
    /// <summary>Null while nothing has ever been saved — the page is defaults, not a record.</summary>
    DateTimeOffset? UpdatedAt);

public record SavePublicPageRequest(
    bool IsPublished,
    string? Headline,
    string? About,
    string? ContactNote,
    bool ShowProducts,
    bool ShowJobs);

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
    DateTimeOffset CreatedAt);
