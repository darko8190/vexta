using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// What may still be changed on a job that has been billed.
///
/// Nothing, except the status itself. Once an invoice has gone out, the materials, the hours and
/// the expenses behind it are the figures the client was charged from: editing them afterwards
/// makes the job and the invoice disagree, and the invoice is the document that will be quoted
/// back at the company.
///
/// The status stays open so the office can reopen the job deliberately — put it back to
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
