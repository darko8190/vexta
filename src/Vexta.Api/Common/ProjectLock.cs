using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// What may still be changed on a job whose invoice has gone out.
///
/// The rule is about money, not about records. Everything that can move an amount is frozen —
/// the materials, the hours, the expenses, the budget, the tax answer, the price policy —
/// because those are the figures the client was charged from, and the invoice is the document
/// that will be quoted back at the company.
///
/// Documents and notes are not frozen, and deliberately so: a plan still arrives after the
/// invoice, and a site journal that stops on billing day is a journal nobody trusts. Neither
/// of them changes a total.
///
/// The status stays open too, so the office can reopen the job on purpose — put it back to
/// À facturer, or cancel it — rather than being stuck with a frozen record and no way out.
/// </summary>
public static class ProjectLock
{
    public static bool IsBilled(ProjectStatus status) => status == ProjectStatus.Facture;

    /// <summary>
    /// The refusal to hand back, or null when the job is open. One sentence, and it says how to
    /// get out of it: a locked record with no stated way forward is read as a bug.
    /// </summary>
    public static string? Problem(ProjectStatus status) => IsBilled(status)
        ? "Ce projet est facturé. Remettez-le à « À facturer » pour le modifier."
        : null;
}
