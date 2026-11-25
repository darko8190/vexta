using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// The address a form was e-mailed to, sealed into the link that went with it.
///
/// A form that files on the customer's own record (an asset, a request for a quote) normally
/// asks them to sign in, because the account is the only trustworthy answer to whose record it
/// is. A link the company itself sent to an address it has on file is a second trustworthy
/// answer: whoever holds it reads that mailbox. So the link carries the address, signed and
/// dated, and nothing else — the client is looked up when the form is filled, by the company
/// the form belongs to.
///
/// Signed with the API's data-protection keys (persisted, so links survive a restart) and good
/// for <see cref="Lifetime"/>. A forged or edited token simply fails to open and the form falls
/// back to asking for a sign-in.
/// </summary>
public class FormInvitation(IDataProtectionProvider protection)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(60);

    private ITimeLimitedDataProtector Protector =>
        protection.CreateProtector("Vexta.Forms.Invitation").ToTimeLimitedDataProtector();

    public string Seal(Guid formId, string email) =>
        Protector.Protect($"{formId:N}|{email.Trim().ToLowerInvariant()}", Lifetime);

    /// <summary>The address the link was sent to, when the token is genuine, current, and for this form.</summary>
    public string? Open(string? token, Guid formId)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        try
        {
            var parts = Protector.Unprotect(token).Split('|', 2);
            return parts.Length == 2 && parts[0] == formId.ToString("N") ? parts[1] : null;
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    /// <summary>
    /// The company's client who owns this address: the client's own e-mail first, then one of its
    /// contacts. Null when nobody has it, or when two clients share it — a guess between two
    /// files would put somebody's equipment on a stranger's record.
    /// </summary>
    public static async Task<Client?> ClientForAsync(
        VextaDbContext db, Guid tenantId, string email, CancellationToken ct)
    {
        var address = email.Trim().ToLower();

        var ids = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId && c.Email != null && c.Email.ToLower() == address)
            .Select(c => c.Id)
            .Distinct().Take(2).ToListAsync(ct);

        if (ids.Count == 0)
        {
            ids = await db.ClientContacts.IgnoreQueryFilters()
                .Where(c => c.TenantId == tenantId && c.Email != null && c.Email.ToLower() == address)
                .Select(c => c.ClientId)
                .Distinct().Take(2).ToListAsync(ct);
        }

        if (ids.Count != 1) return null;

        return await db.Clients.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == ids[0], ct);
    }
}
