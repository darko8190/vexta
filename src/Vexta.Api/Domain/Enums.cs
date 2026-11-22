namespace Vexta.Api.Domain;

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
    Client = 3
}

public enum TenantSubscriptionStatus
{
    Incomplete = 0,
    Active = 1,
    PastDue = 2,
    Canceled = 3
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

public enum ProjectStatus
{
    Planifie = 0,
    EnCours = 1,
    EnPause = 2,
    Termine = 3,
    Annule = 4
}

public enum InvoiceStatus
{
    Brouillon = 0,
    Envoyee = 1,
    Payee = 2,
    EnRetard = 3,
    Annulee = 4
}
