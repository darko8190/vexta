using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// One client's running account: what they were charged, what they paid, and the balance.
///
/// A customer may read their own — it is their statement, and the query filter already narrows
/// it to theirs. Entering a line is the company's, and reserved to the managers: a line on an
/// account is money, and an employee logging their hours has no business adjusting a balance.
/// </summary>
[ApiController]
[Route("api/clients/{clientId:guid}/compte")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class ClientAccountController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ClientAccountDto>> Get(Guid clientId, CancellationToken ct)
    {
        var client = await db.Clients.AsNoTracking()
            .Where(c => c.Id == clientId)
            .Select(c => new { c.Name, c.IsBlocked, c.BlockedReason, c.IsAccountBlocked, c.AccountBlockedReason })
            .FirstOrDefaultAsync(ct);

        if (client is null) return NotFound();

        var entries = await db.ClientAccountEntries.AsNoTracking()
            .Where(e => e.ClientId == clientId)
            .OrderByDescending(e => e.Date)
            // Tie-broken by when it was entered: several lines share a date on a busy day, and a
            // statement that reorders itself between two readings is one nobody can check.
            .ThenByDescending(e => e.CreatedAt)
            .Select(e => new ClientAccountEntryDto(
                e.Id, e.Date, e.Kind, e.Amount, e.Description, e.InvoiceId,
                e.Invoice == null ? null : e.Invoice.Number, e.CreatedAt))
            .ToListAsync(ct);

        // Summed from the lines rather than read off the client, because a stored balance and a
        // list of entries are two things that must agree and eventually do not.
        var balance = entries.Sum(e => e.Amount);

        var charged = entries.Where(e => e.Amount > 0).Sum(e => e.Amount);
        var paid = entries.Where(e => e.Amount < 0).Sum(e => -e.Amount);

        return Ok(new ClientAccountDto(
            balance,
            charged,
            paid,
            client.IsBlocked,
            client.BlockedReason,
            client.IsAccountBlocked,
            client.AccountBlockedReason,
            entries));
    }

    /// <summary>
    /// A line entered by hand: a payment received on the account, an opening balance, a credit
    /// note, a correction.
    ///
    /// Charges that come from an invoice are not entered here — they are written by taking a
    /// payment with the method "porté au compte", so the invoice and the account can never
    /// disagree about whether the charge happened.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ClientAccountEntryDto>> Create(
        Guid clientId, SaveAccountEntryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clientId, ct);
        if (client is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // A barred account still takes payments. Refusing them would leave the client unable to
        // clear the balance that got the account barred in the first place.
        if (request.Kind != AccountEntryKind.Paiement && client.AccountRefusal() is { } refusal)
        {
            return BadRequest(new { message = refusal });
        }

        var entry = new ClientAccountEntry
        {
            TenantId = tenantId,
            ClientId = clientId,
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.Now),
            Kind = request.Kind,
            Amount = Signed(request.Kind, request.Amount, request.ReducesBalance),
            Description = request.Description.Trim(),
            CreatedByUserId = currentUser.UserId
        };

        db.ClientAccountEntries.Add(entry);
        await db.SaveChangesAsync(ct);

        return Ok(new ClientAccountEntryDto(
            entry.Id, entry.Date, entry.Kind, entry.Amount, entry.Description, null, null, entry.CreatedAt));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid clientId, Guid id, CancellationToken ct)
    {
        var entry = await db.ClientAccountEntries
            .FirstOrDefaultAsync(e => e.Id == id && e.ClientId == clientId, ct);
        if (entry is null) return NotFound();

        // A line that came from an invoice is removed by undoing the payment that created it, not
        // from here: deleting it would leave an invoice marked as settled on the account and
        // nothing on the account saying so.
        if (entry.InvoiceId is not null || entry.InvoicePaymentId is not null)
        {
            return BadRequest(new
            {
                message = "Cette ligne vient d'une facture. Retirez le paiement sur la facture pour l'annuler."
            });
        }

        db.ClientAccountEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The sign, decided here so no form ever shows a minus sign — a field where the sign
    /// matters is a field somebody gets backwards.
    ///
    /// A charge raises the balance, a payment lowers it, and an adjustment goes whichever way
    /// the person said with a plain checkbox: "réduit le solde".
    /// </summary>
    private static decimal Signed(AccountEntryKind kind, decimal amount, bool reducesBalance)
    {
        var magnitude = Math.Abs(amount);

        return kind switch
        {
            AccountEntryKind.Charge => magnitude,
            AccountEntryKind.Paiement => -magnitude,
            _ => reducesBalance ? -magnitude : magnitude
        };
    }

    private static string? Problem(SaveAccountEntryRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Description)) return "La description est obligatoire.";
        if (r.Description.Trim().Length > 300) return "La description est trop longue.";
        if (r.Amount <= 0) return "Le montant doit être supérieur à zéro.";
        if (r.Amount > 10_000_000m) return "Le montant est trop élevé.";

        // A statement dated next year reads as a mistake and would sit at the top of the list
        // for months. Backdating is allowed: an opening balance is always backdated.
        if (r.Date is { } date && date > DateOnly.FromDateTime(DateTime.Now).AddDays(1))
        {
            return "La date ne peut pas être dans le futur.";
        }

        return null;
    }
}
