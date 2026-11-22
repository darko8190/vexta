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
  tenantKind: "Business" | "Personal" | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type ClientType = "Particulier" | "Entreprise";

/** The address fields as the client form asks for them, stored as the primary address. */
export interface ClientAddress {
  id: string | null;
  line1: string;
  /** Apartment or suite. */
  apartment: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string;
}

export interface ClientRecord {
  id: string;
  /** Sequential within the company. Shown as C-0001. */
  number: number;
  type: ClientType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  /** The company for an entreprise, the person for a particulier. */
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  notes: string | null;
  primaryAddress: ClientAddress | null;
  addressCount: number;
  contactCount: number;
  projectCount: number;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

/** C-0001. Padded so the column sorts and scans cleanly. */
export function formatClientNumber(n: number): string {
  return `C-${String(n).padStart(4, "0")}`;
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
  kind: "Business" | "Personal";
  subscriptionStatus: TenantSubscriptionStatus;
  currentPeriodEnd: string | null;
  createdAt: string;
  userCount: number;
  clientCount: number;
  /** Null for a personal space, and for a tenant created by hand before a plan was chosen. */
  planId: string | null;
  planName: string | null;
  /** Seats the plan allows. 1 when there is no plan. */
  maxUsers: number;
}

export interface PlatformSettings {
  mailgunConfigured: boolean;
  mailgunDomain: string | null;
  mailgunFromEmail: string | null;
  mailgunFromName: string | null;
  mailgunRegion: string;
  stripeConfigured: boolean;
  stripePublishableKey: string | null;
  r2Configured: boolean;
  r2AccountId: string | null;
  r2Bucket: string | null;
  r2PublicBaseUrl: string | null;
}

export interface ModuleRecord {
  id: string;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  /** The range's floor: shown to buyers, never enforced. */
  minUsers: number;
  /** Seats the plan allows, the owner included. This one is enforced. */
  maxUsers: number;
  isPublished: boolean;
  sortOrder: number;
  /** Null when Stripe could not be reached: such a plan cannot be published. */
  stripePriceId: string | null;
  modules: ModuleRecord[];
  tenantCount: number;
}

export interface PublicModule {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  minUsers: number;
  /** Seats the plan allows, the owner included. */
  maxUsers: number;
  modules: PublicModule[];
}

export interface MediaAssetRecord {
  id: string;
  fileName: string;
  contentType: string;
  /** What R2 stores, which is what Cloudflare bills for. */
  sizeBytes: number;
  /** What the file weighed before compression; equal to sizeBytes when stored as-is. */
  originalSizeBytes: number;
  /** "gzip" when the file is stored compressed, otherwise null. */
  contentEncoding: string | null;
  createdAt: string;
}

/** The three images the super admin can replace. */
export type BrandingSlot = "logo-light" | "logo-dark" | "icon";

export interface BrandingSlotInfo {
  slot: BrandingSlot;
  /** True when an image was uploaded; false when the slot falls back to the environment. */
  isUploaded: boolean;
  /** Changes on every upload, which is what busts the browser's cache for the preview. */
  eTag: string | null;
  width: number;
  height: number;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
  /** True once a sign-in account exists. This is what the seat limit counts. */
  hasAccess: boolean;
  /** Access granted but the password never chosen. */
  invitationPending: boolean;
  invitationExpired: boolean;
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
  createdAt: string;
}

export interface SeatUsage {
  used: number;
  limit: number;
  remaining: number;
  hasRoom: boolean;
  /** Why the limit is what it is, when it is not simply the plan's number. */
  limitReason: string | null;
}

export interface TeamList {
  employees: Employee[];
  seats: SeatUsage;
}

export interface AccessGranted {
  invitationUrl: string;
  expiresAt: string;
  emailSent: boolean;
  employee: Employee;
}

export interface Invitation {
  firstName: string;
  lastName: string;
  email: string;
  tenantName: string;
}
