import type {
  AccountEntryKind,
  AddressType,
  EmploymentType,
  InvoiceLineKind,
  InvoiceStatus,
  MarginMode,
  PaymentMethod,
  ProjectStatus,
  ProjectTaskPriority,
  ProjectTaskStatus,
  TenantSubscriptionStatus,
  UserRole,
} from "@/lib/types";

/**
 * The enum name is what travels; these are the words on screen. "Chargé de projet" is what the
 * office calls the person, and ProjectManager is what the token says — neither is translatable
 * into the other without this table.
 */
export const userRoleLabels: Record<UserRole, string> = {
  SuperAdmin: "Super admin",
  TenantAdmin: "Administrateur",
  ProjectManager: "Chargé de projet",
  TenantUser: "Employé",
  Client: "Client",
};

/** What each role may do, said in one line under the choice. */
export const userRoleHints: Record<"TenantAdmin" | "ProjectManager" | "TenantUser", string> = {
  TenantAdmin: "Tout, y compris les employés, la fiche entreprise et le forfait.",
  ProjectManager: "Les clients, les projets, l'inventaire et les factures. Pas les employés ni les paramètres.",
  TenantUser: "Consulte les dossiers, et saisit son temps, ses dépenses et ses tâches.",
};

export const addressTypeLabels: Record<AddressType, string> = {
  Facturation: "Facturation",
  Livraison: "Livraison",
  SiegeSocial: "Siège social",
  Autre: "Autre",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  AFaire: "À faire",
  Commence: "Commencé",
  AFacturer: "À facturer",
  Facture: "Facturé",
  Annule: "Annulé",
};

export const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  AFaire: "À faire",
  EnCours: "En cours",
  Bloquee: "Bloquée",
  Terminee: "Terminée",
};

/**
 * Bloquée is the one that stands out. A task waiting on a part is nobody's fault and will not
 * move on its own, which is exactly what has to be noticed in a list.
 */
export const taskStatusBadgeVariant: Record<ProjectTaskStatus, "default" | "secondary" | "destructive" | "outline"> = {
  AFaire: "outline",
  EnCours: "default",
  Bloquee: "destructive",
  Terminee: "secondary",
};

export const taskPriorityLabels: Record<ProjectTaskPriority, string> = {
  Basse: "Basse",
  Normale: "Normale",
  Haute: "Haute",
  Urgente: "Urgente",
};

/**
 * "Porté au compte" is the one that is not really a payment: the invoice is settled and the
 * client owes the money on their account instead. The wording says so rather than leaving
 * somebody to work out why the till does not balance.
 */
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  Comptant: "Comptant",
  Interac: "Interac",
  Carte: "Carte",
  Cheque: "Chèque",
  Virement: "Virement",
  PorteAuCompte: "Porté au compte",
  Autre: "Autre",
};

export const accountEntryKindLabels: Record<AccountEntryKind, string> = {
  Charge: "Charge",
  Paiement: "Paiement",
  Ajustement: "Ajustement",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  Brouillon: "Brouillon",
  Envoyee: "Envoyée",
  Payee: "Payée",
  EnRetard: "En retard",
  Annulee: "Annulée",
};

export const tenantStatusLabels: Record<TenantSubscriptionStatus, string> = {
  Incomplete: "Incomplet",
  Active: "Actif",
  PastDue: "Paiement en retard",
  Canceled: "Annulé",
};

export const projectStatusBadgeVariant: Record<ProjectStatus, "default" | "secondary" | "destructive" | "outline"> = {
  AFaire: "outline",
  Commence: "default",
  // À facturer is the one that needs chasing, so it is the one that stands out.
  AFacturer: "default",
  Facture: "secondary",
  Annule: "destructive",
};

export const invoiceStatusBadgeVariant: Record<InvoiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Brouillon: "outline",
  Envoyee: "secondary",
  Payee: "default",
  EnRetard: "destructive",
  Annulee: "destructive",
};

export const tenantStatusBadgeVariant: Record<TenantSubscriptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Incomplete: "outline",
  Active: "default",
  PastDue: "destructive",
  Canceled: "destructive",
};

export const invoiceLineKindLabels: Record<InvoiceLineKind, string> = {
  Materiaux: "Matériaux",
  MainDOeuvre: "Main-d'œuvre",
  Equipement: "Équipement",
  FraisSupplementaires: "Frais supplémentaires",
  Autre: "Autre",
};

export const marginModeLabels: Record<MarginMode, string> = {
  Multiplication: "Multiplication",
  Division: "Division",
};

export const employmentTypeLabels: Record<EmploymentType, string> = {
  TempsPlein: "Temps plein",
  TempsPartiel: "Temps partiel",
  Contrat: "Contrat",
  Saisonnier: "Saisonnier",
  Stage: "Stage",
};
