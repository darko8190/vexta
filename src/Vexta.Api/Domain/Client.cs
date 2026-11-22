namespace Vexta.Api.Domain;

public class Client : IInvitable
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    /// <summary>
    /// Sequential within the tenant and never chosen by hand. Displayed as C-0001; stored as the
    /// number alone so sorting and the next value stay arithmetic rather than string work.
    /// </summary>
    public int Number { get; set; }

    public ClientType Type { get; set; } = ClientType.Particulier;

    /// <summary>Required for an entreprise, null for a particulier.</summary>
    public string? CompanyName { get; set; }

    /// <summary>
    /// The person. For an entreprise this is who you actually call there, which is why it is
    /// asked for in both cases.
    /// </summary>
    public string? FirstName { get; set; }
    public string? LastName { get; set; }

    /// <summary>
    /// What every other screen shows: the company for an entreprise, the person for a
    /// particulier. Stored rather than computed because invoices, projects and addresses all
    /// search and sort on it, and a computed property cannot be translated to SQL. Kept in sync
    /// on every save — see ClientsController.DisplayNameFor.
    /// </summary>
    public required string Name { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? TaxId { get; set; }
    public string? Notes { get; set; }

    /// <summary>
    /// True for a client no tax is charged to: a band council, a reserve delivery, a government
    /// body holding an exemption certificate. It is the default for this client's new projects
    /// and invoices rather than a rule enforced on them — the exemption belongs to the client,
    /// but whether a given job qualifies is still the company's call.
    /// </summary>
    public bool IsTaxExempt { get; set; }

    /// <summary>
    /// The sign-in account of a particulier who was given access to their own files, or null.
    /// An entreprise is a company and has no one to be: its people are its Contacts, and access
    /// is granted to them individually.
    /// </summary>
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    public string? InvitationTokenHash { get; set; }
    public DateTimeOffset? InvitationExpiresAt { get; set; }
    public DateTimeOffset? InvitationSentAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Address> Addresses { get; set; } = [];
    public List<ClientContact> Contacts { get; set; } = [];
    public List<Project> Projects { get; set; } = [];
    public List<Invoice> Invoices { get; set; } = [];
}
