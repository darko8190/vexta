using Microsoft.Extensions.Caching.Memory;

namespace Vexta.Api.Services;

/// <summary>
/// How often a stranger may file a form on a company's public page.
///
/// Every other write in Vexta is behind a session, which is its own limit: somebody who abuses
/// one has an account that can be taken away. A public form has none of that, and it is a route
/// that creates clients and sends e-mail — so without a ceiling, one script could fill a
/// company's customer list with rubbish overnight and have Mailgun carry every line of it.
///
/// Two ceilings, because they answer two different problems. The per-address one stops a person
/// or a script hammering one form. The per-company one is the backstop for a distributed flood:
/// the addresses are all different, but the company's day still ends.
///
/// Counted in memory. That is deliberate and worth being honest about: restart the API and the
/// counters are gone, and a second instance counts separately. What it buys is a ceiling with no
/// new infrastructure, and the numbers are chosen so that the leak matters less than the floor —
/// a company that genuinely receives sixty quote requests in a day has a wonderful problem and
/// should telephone us.
/// </summary>
public interface IPublicSubmissionLimiter
{
    /// <summary>
    /// Why this submission must not be filed, or null to go ahead. Counts nothing: a visitor
    /// who forgot a required field has not used up one of their five.
    /// </summary>
    string? Problem(string? address, Guid tenantId);

    /// <summary>Called once a submission has actually been filed.</summary>
    void Record(string? address, Guid tenantId);
}

public class PublicSubmissionLimiter(IMemoryCache cache) : IPublicSubmissionLimiter
{
    /// <summary>Enough for somebody who mistyped their telephone number twice and came back.</summary>
    private const int PerAddressPerHour = 5;

    /// <summary>
    /// A day's worth for a company that advertises. Reached honestly it is a sign of success,
    /// and the message says to write directly rather than pretending nothing happened.
    /// </summary>
    private const int PerTenantPerDay = 60;

    public string? Problem(string? address, Guid tenantId)
    {
        if (Count(TenantKey(tenantId)) >= PerTenantPerDay)
        {
            return "Cette entreprise a reçu beaucoup de demandes aujourd'hui. Écrivez-lui directement, ou réessayez demain.";
        }

        // No address to count against — a proxy that strips it, or a test harness. The company's
        // own ceiling above still applies, which is the one that protects the data.
        if (address is null) return null;

        return Count(AddressKey(address, tenantId)) >= PerAddressPerHour
            ? "Vous avez déjà envoyé plusieurs demandes. Réessayez dans une heure."
            : null;
    }

    public void Record(string? address, Guid tenantId)
    {
        Increment(TenantKey(tenantId), TimeSpan.FromDays(1));
        if (address is not null) Increment(AddressKey(address, tenantId), TimeSpan.FromHours(1));
    }

    private int Count(string key) => cache.TryGetValue(key, out int count) ? count : 0;

    /// <summary>
    /// The window is the clock hour or the calendar day, which is what the key carries — the
    /// expiry is only there so nothing has to be swept. Read and write are not one atomic step,
    /// and two requests landing in the same instant can both see the same number, which costs at
    /// worst one extra submission and is not what this guards against.
    /// </summary>
    private void Increment(string key, TimeSpan window)
    {
        var count = Count(key);

        cache.Set(key, count + 1, new MemoryCacheEntryOptions
        {
            // Relative to now rather than sliding: a window that renewed on every attempt would
            // never close for whoever is attempting.
            AbsoluteExpirationRelativeToNow = window,
            Size = 1
        });
    }

    private static string TenantKey(Guid tenantId) =>
        $"public-form:tenant:{tenantId}:{DateTimeOffset.UtcNow:yyyyMMdd}";

    private static string AddressKey(string address, Guid tenantId) =>
        $"public-form:addr:{tenantId}:{address}:{DateTimeOffset.UtcNow:yyyyMMddHH}";
}
