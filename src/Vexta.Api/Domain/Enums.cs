namespace Vexta.Api.Domain;

public enum UserRole
{
    SuperAdmin = 0,
    TenantAdmin = 1,
    TenantUser = 2
}

public enum TenantSubscriptionStatus
{
    Incomplete = 0,
    Active = 1,
    PastDue = 2,
    Canceled = 3
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
