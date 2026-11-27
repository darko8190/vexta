namespace Vexta.Api.Domain;

/// <summary>
/// What someone may do in one space. Shown as Administrateur, Chargé de projet and Employé —
/// see Vexta.Api.Auth.Roles for the groupings the endpoints are gated on.
///
/// The numbers are stored, so a new role is appended rather than inserted. ProjectManager is 4
/// even though it sits between TenantAdmin and TenantUser in authority: the order of the enum
/// is not the order of the ladder, and renumbering would reassign every existing membership.
/// </summary>
public enum UserRole
{
    SuperAdmin = 0,
    TenantAdmin = 1,
    TenantUser = 2,

    /// <summary>
    /// A customer of the tenant, not a member of it: they see their own projects and their own
    /// invoices and nothing else. Never counted against the plan's seats — seats are sold for
    /// the people who run the business, and a company does not pay per customer.
    /// </summary>
    Client = 3,

    /// <summary>
    /// Chargé de projet: runs the jobs and bills them, but does not run the company. Everything
    /// a company does day to day, minus the employees, the company card, the settings and the
    /// plan — the four things an employee must not be able to turn on themselves.
    /// </summary>
    ProjectManager = 4
}

public enum TenantSubscriptionStatus
{
    Incomplete = 0,
    Active = 1,
    PastDue = 2,
    Canceled = 3,

    /// <summary>
    /// Inside a free trial the plan granted, with no card on file and no Stripe subscription at
    /// all. Vexta's own state, not one of Stripe's: the company has not been asked to pay yet,
    /// so there is nothing at Stripe to have a status.
    ///
    /// Distinct from Active because the two end differently — an active subscription renews, a
    /// trial runs out. See <see cref="Tenant.TrialEndsAt"/>.
    /// </summary>
    Trialing = 4
}

/// <summary>
/// Personal spaces belong to a travailleur autonome and are free: they never get a Stripe
/// subscription, so the subscription gate has to let them through on this instead of on status.
/// </summary>
public enum TenantKind
{
    Business = 0,
    Personal = 1
}

/// <summary>
/// A particulier is one person; an entreprise is a company reached through a contact person.
/// Both carry a contact name, which is why the name fields are not conditional in the data.
/// </summary>
public enum ClientType
{
    Particulier = 0,
    Entreprise = 1
}

public enum AddressType
{
    Facturation = 0,
    Livraison = 1,
    SiegeSocial = 2,
    Autre = 3
}

/// <summary>
/// Where a job sits in the pipeline, in the words the office uses.
///
/// The numbers are the ones the previous list used, so the stored column needs no rewriting
/// beyond the two states that changed meaning: a paused job is a started job, and a finished
/// one is either waiting to be billed or already billed, which the migration decides by
/// looking for an invoice.
///
/// Facture is reached by invoicing the project rather than by remembering to come back here.
/// </summary>
/// <summary>Where an expense stands with the office.</summary>
public enum ExpenseStatus
{
    AApprouver = 0,
    Approuvee = 1,
    Remboursee = 2,
    Refusee = 3
}

/// <summary>The unit a recurring project counts its interval in.</summary>
public enum RecurrenceUnit
{
    Semaine = 0,
    Mois = 1,
    Annee = 2
}

public enum ProjectStatus
{
    AFaire = 0,
    Commence = 1,
    AFacturer = 2,
    Facture = 3,
    Annule = 4
}

public enum InvoiceStatus
{
    Brouillon = 0,
    Envoyee = 1,
    Payee = 2,
    EnRetard = 3,
    Annulee = 4,
    /// <summary>Some money in, not all of it.</summary>
    PartiellementPayee = 5,
    /// <summary>Paid and handed over to the accounting system: closed for good.</summary>
    TransfereeComptabilite = 6
}

/// <summary>
/// What a line on an invoice is. The kind decides where its price comes from: a material or a
/// piece of equipment is looked up in the catalogue, labour is priced from the company's hourly
/// rate, and the last two are typed by hand.
/// </summary>
public enum InvoiceLineKind
{
    Materiaux = 0,
    MainDOeuvre = 1,
    Equipement = 2,
    FraisSupplementaires = 3,
    Autre = 4,
    Assemblage = 5
}

/// <summary>
/// How a company turns a purchase price into a selling price. The two conventions give
/// different numbers from the same percentage and both are called "la marge" on site, so it is
/// a company-wide setting rather than a guess:
///
/// Multiplication — markup on cost: vendant = achat × (1 + marge / 100). 100 $ at 35 % = 135 $.
/// Division — margin on the selling price: vendant = achat ÷ (1 − marge / 100). 100 $ at 35 % =
/// 153,85 $, and the profit really is 35 % of what the client pays.
/// </summary>
public enum MarginMode
{
    Multiplication = 0,
    Division = 1
}

/// <summary>What a job posting offers. Shown on the company's public page.</summary>
public enum EmploymentType
{
    TempsPlein = 0,
    TempsPartiel = 1,
    Contrat = 2,
    Saisonnier = 3,
    Stage = 4
}

/// <summary>
/// Where a client stands with the company. Not what they may do — that is the lock on the
/// record (see <see cref="Client.IsBlocked"/>) — but who they are to the business today.
///
/// Banni is deliberately absent. Barring a client is already one switch, and a second one in
/// this column could only ever disagree with it: a status reading "Client" on a barred record,
/// or "Banni" on one that still takes work. A barred client is shown as banni and the lock
/// stays the only fact.
///
/// Client is 1 and the stored default, so every record that existed before this column is what
/// it always was. Prospect has to be chosen.
/// </summary>
public enum ClientStatus
{
    /// <summary>Quoted, not yet sold. Work and invoices are allowed: that is how you sell them.</summary>
    Prospect = 0,

    Client = 1,

    /// <summary>
    /// Gone quiet or gone elsewhere. Nothing is refused — an ancien client who calls back is a
    /// client again, and a refusal would be the wrong answer to that phone call.
    /// </summary>
    Ancien = 2
}
