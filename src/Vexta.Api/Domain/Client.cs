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

    /// <summary>
    /// Prospect, client or ancien client. A label on the relationship and nothing more:
    /// none of the three refuses anything, because a prospect is quoted and an ancien client
    /// who calls back is a client again. What refuses is the lock below.
    /// </summary>
    public ClientStatus Status { get; set; } = ClientStatus.Client;

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
    /// Barred outright: no new project, no new invoice, nothing ordered on the company's public
    /// page. The record and its history stay exactly where they are — barring a client is a
    /// commercial decision, not a reason to lose what they already owe or what was done for them.
    ///
    /// Two levels on purpose, because the two reasons are different. This one is "we will not
    /// work for them again". <see cref="IsAccountBlocked"/> is "they pay up front from now on",
    /// which is a far more common answer and should not have to cost them their file.
    /// </summary>
    public bool IsBlocked { get; set; }

    /// <summary>
    /// Said back to whoever hits the refusal, and printed on the client's own card. A door that
    /// closes without a word is one nobody can explain to the person standing at the counter.
    /// </summary>
    public string? BlockedReason { get; set; }

    /// <summary>
    /// The account is barred but the client is not: work goes on, invoices go out, and nothing
    /// more may be put on the account. They pay as they go.
    /// </summary>
    public bool IsAccountBlocked { get; set; }

    public string? AccountBlockedReason { get; set; }

    /// <summary>
    /// Why nothing more may go on this client's account, or null when something may.
    ///
    /// A barred client is barred from the account too — saying otherwise would let a client we
    /// will not work for keep running a tab. Written once, here, so the invoice form and the
    /// payment endpoint cannot disagree about it.
    /// </summary>
    public string? AccountRefusal() =>
        IsBlocked
            ? Because("Ce client est bloqué", BlockedReason)
            : IsAccountBlocked
                ? Because("Le compte de ce client est bloqué", AccountBlockedReason)
                : null;

    /// <summary>Why no new work may be taken on for this client, or null when it may.</summary>
    public string? WorkRefusal() =>
        IsBlocked ? Because("Ce client est bloqué", BlockedReason) : null;

    private static string Because(string what, string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? $"{what}." : $"{what} : {reason.Trim()}";

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

    /// <summary>
    /// Who looks after the bills at this client, when it is somebody other than the person on
    /// the record. Null means that person: the particulier themselves, or the main contact of
    /// an entreprise — which is what a new client defaults to, because the one person typed in
    /// is the only one there is yet.
    ///
    /// SetNull when that contact is deleted, which falls back to the person on the record
    /// rather than to nobody.
    /// </summary>
    public Guid? BillingContactId { get; set; }
    public ClientContact? BillingContact { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Address> Addresses { get; set; } = [];
    public List<ClientContact> Contacts { get; set; } = [];
    public List<Project> Projects { get; set; } = [];
    public List<Invoice> Invoices { get; set; } = [];
    public List<ClientAsset> Assets { get; set; } = [];
    public List<ClientAccountEntry> AccountEntries { get; set; } = [];
}
