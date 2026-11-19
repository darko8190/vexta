using System.Text.RegularExpressions;

namespace Vexta.Api.Domain;

/// <summary>
/// Shared so a tenant renamed on upgrade gets its slug the same way sign-up built the first one.
/// </summary>
public static class TenantSlug
{
    public static string For(string name)
    {
        var lowered = name.Trim().ToLowerInvariant();
        var cleaned = Regex.Replace(lowered, "[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(cleaned) ? Guid.NewGuid().ToString("N")[..8] : cleaned;
    }

    /// <summary>Appends -2, -3… until the slug is free. <paramref name="isTaken"/> excludes self on a rename.</summary>
    public static async Task<string> UniqueAsync(string name, Func<string, Task<bool>> isTaken)
    {
        var slug = For(name);
        var suffix = 1;
        while (await isTaken(slug))
        {
            slug = $"{For(name)}-{++suffix}";
        }
        return slug;
    }
}
