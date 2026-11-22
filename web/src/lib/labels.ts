import type {
  AddressType,
  EmploymentType,
  InvoiceLineKind,
  InvoiceStatus,
  MarginMode,
  ProjectStatus,
  TenantSubscriptionStatus,
} from "@/lib/types";

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
