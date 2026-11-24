using System.Text.RegularExpressions;
using Vexta.Api.Common;

namespace Vexta.Api.Domain;

/// <summary>
/// Shared so a tenant renamed on upgrade gets its slug the same way sign-up built the first one.
/// </summary>
public static class TenantSlug
{
    public static string For(string name)
    {
        // Accented letters are turned into their plain equivalents before anything is dropped.
        // Written without that step, "Les Bétons Lévis" became les-b-tons-l-vis: the regex below
        // deleted every accented letter outright, and the result is the company's own public web
        // address with holes in it.
        //
        // Only new slugs are affected. An existing one is never recomputed -- it is in links
        // people have already saved, and that is worth more than its spelling.
        var lowered = CompanyIdentity.Normalize(name);
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
