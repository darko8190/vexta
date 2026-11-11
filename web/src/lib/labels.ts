import type { AddressType, InvoiceStatus, ProjectStatus, TenantSubscriptionStatus } from "@/lib/types";

export const addressTypeLabels: Record<AddressType, string> = {
  Facturation: "Facturation",
  Livraison: "Livraison",
  SiegeSocial: "Siège social",
  Autre: "Autre",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  Planifie: "Planifié",
  EnCours: "En cours",
  EnPause: "En pause",
  Termine: "Terminé",
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
  Planifie: "outline",
  EnCours: "default",
  EnPause: "secondary",
  Termine: "secondary",
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
