export type UserRole = "SuperAdmin" | "TenantAdmin" | "TenantUser";

export type TenantSubscriptionStatus = "Incomplete" | "Active" | "PastDue" | "Canceled";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string | null;
  tenantName: string | null;
  tenantSubscriptionStatus: TenantSubscriptionStatus | null;
  isImpersonating: boolean;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  notes: string | null;
  addressCount: number;
  projectCount: number;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  email: string | null;
}

export type AddressType = "Facturation" | "Livraison" | "SiegeSocial" | "Autre";

export interface AddressRecord {
  id: string;
  clientId: string;
  clientName: string;
  type: AddressType;
  isPrimary: boolean;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "Planifie" | "EnCours" | "EnPause" | "Termine" | "Annule";

export interface ProjectRecord {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = "Brouillon" | "Envoyee" | "Payee" | "EnRetard" | "Annulee";

export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
  sortOrder?: number;
}

export interface InvoiceRecord {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: TenantSubscriptionStatus;
  currentPeriodEnd: string | null;
  createdAt: string;
  userCount: number;
  clientCount: number;
}

export interface PlatformSettings {
  mailgunConfigured: boolean;
  mailgunDomain: string | null;
  mailgunFromEmail: string | null;
  mailgunFromName: string | null;
  mailgunRegion: string;
  stripeConfigured: boolean;
  stripePublishableKey: string | null;
  stripeMonthlyPriceId: string | null;
}
