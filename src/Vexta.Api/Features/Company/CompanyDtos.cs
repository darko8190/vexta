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
