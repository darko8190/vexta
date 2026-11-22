using Vexta.Api.Domain;

namespace Vexta.Api.Auth;

/// <summary>
/// The role lists the endpoints are gated on, written once.
///
/// They used to be spelled out at each <c>[Authorize]</c>, fifteen times, which is how adding a
/// role goes wrong: miss one list and the new role is refused by one controller for no reason
/// anybody can see from the outside. Named by what the list means rather than by who is in it,
/// so a reader of an endpoint learns the intent and not the membership.
///
/// A super admin is in every list. They act as the owner of whatever space they have entered,
/// which is the only way to answer a company's "come and look at this with me".
/// </summary>
public static class Roles
{
    /// <summary>The platform. Never a company's own role.</summary>
    public const string Platform = nameof(UserRole.SuperAdmin);

    /// <summary>
    /// Administrateur. The company itself: its employees, its card, its settings, its plan, its
    /// pricing. An employee must not be able to grant themselves an access or change what the
    /// company charges.
    /// </summary>
    public const string Owner =
        $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.SuperAdmin)}";

    /// <summary>
    /// Administrateur and chargé de projet. Everything that runs the business: clients,
    /// projects, inventory, invoices. Writing, not just reading.
    /// </summary>
    public const string Managers =
        $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.ProjectManager)},{nameof(UserRole.SuperAdmin)}";

    /// <summary>
    /// Everyone who works there, employees included. Reading the company's files, and writing
    /// what happens on a job — hours, expenses, materials, notes, tasks.
    /// </summary>
    public const string Staff =
        $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.ProjectManager)},"
        + $"{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}";

    /// <summary>
    /// The same, plus the company's customers. Only for what a customer is meant to reach —
    /// their own projects and their own invoices — and the controller behind it still has to
    /// narrow the rows to theirs.
    /// </summary>
    public const string StaffAndClients = $"{Staff},{nameof(UserRole.Client)}";

    /// <summary>
    /// The three a company may hand out. SuperAdmin is the platform's and Client is granted by
    /// giving a customer access to their own files, so neither can be chosen from a list.
    /// </summary>
    public static readonly IReadOnlySet<UserRole> Assignable = new HashSet<UserRole>
    {
        UserRole.TenantAdmin, UserRole.ProjectManager, UserRole.TenantUser
    };
}
