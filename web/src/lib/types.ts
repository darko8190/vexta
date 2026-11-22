/** Client is a customer of the company, not a member of it: they see their own files only. */
export type UserRole = "SuperAdmin" | "TenantAdmin" | "TenantUser" | "Client";

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
  /** The company's chosen colour as #RRGGBB, or null for Vexta's blue. */
  tenantBrandColor: string | null;
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

/** Whether someone can sign in to see their own files, and where the invitation stands. */
export interface ClientAccess {
  hasAccess: boolean;
  invitationPending: boolean;
  invitationExpiresAt: string | null;
  invitationSentAt: string | null;
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
  /** No tax charged to this client. The default for their projects and invoices. */
  isTaxExempt: boolean;
  primaryAddress: ClientAddress | null;
  addressCount: number;
  contactCount: number;
  projectCount: number;
  invoiceCount: number;
  access: ClientAccess;
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
  access: ClientAccess;
  createdAt: string;
}

/** C-0001. Padded so the column sorts and scans cleanly. */
export function formatClientNumber(n: number): string {
  return `C-${String(n).padStart(4, "0")}`;
}

export interface ClientSummary {
  id: string;
  number: number;
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

/** An address as a project shows it: enough to recognise, not the whole record. */
export interface ProjectAddress {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
}

export interface ProjectRecord {
  id: string;
  /** Sequential within the company. Shown as P-0001. */
  number: number;
  clientId: string;
  clientName: string;
  /** The client's own purchase order, printed on this project's invoices. */
  poNumber: string | null;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  /** No tax on this job. Taken from the client when the project is created. */
  isTaxExempt: boolean;
  clientAddress: ProjectAddress | null;
  sameAddressAsClient: boolean;
  /** Null when the work happens at the billing address. */
  siteAddress: ProjectAddress | null;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
}

/** P-0001. Padded so the column sorts and scans cleanly. */
export function formatProjectNumber(n: number): string {
  return `P-${String(n).padStart(4, "0")}`;
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
  /** The project's own number, so a reference reads P-0007 and never a GUID. */
  projectNumber: number | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string | null;
  /** No tax on this invoice. Every line's rate is zero while it is set. */
  isTaxExempt: boolean;
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
  /** The route it opens in a tenant's sidebar. Null for a module with no screen of its own. */
  navHref: string | null;
  parentModuleId: string | null;
  /** Only the owner of the company sees it in their menu. */
  ownerOnly: boolean;
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
  /** The person who opened the company: their access cannot be removed, nor their record. */
  isOwner: boolean;
  createdAt: string;
}

/** One employee's own page: the record, plus the teams they are on. */
export interface EmployeeDetail {
  employee: Employee;
  teams: EmployeeTeam[];
}

export interface EmployeeTeam {
  id: string;
  name: string;
  isLead: boolean;
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

/**
 * What comes back from granting or resending an invitation, whoever it is for. The link is here
 * whether or not the email went out: Mailgun is optional, and an invitation nobody can deliver
 * is an invitation nobody can accept.
 */
export interface InvitationGrant {
  /** Null when the person already had a Vexta account with a password: nothing was sent. */
  invitationUrl: string | null;
  expiresAt: string | null;
  emailSent: boolean;
}

export interface AccessGranted extends InvitationGrant {
  employee: Employee;
}

export interface Invitation {
  firstName: string;
  lastName: string;
  email: string;
  tenantName: string;
}

// ---- Ressources humaines ----

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

export interface TeamRecord {
  id: string;
  name: string;
  description: string | null;
  leadEmployeeId: string | null;
  leadName: string | null;
  members: TeamMember[];
  createdAt: string;
}

export interface CompanyLocation {
  id: string;
  label: string;
  isPrimary: boolean;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string;
  phone: string | null;
}

export interface HrDocument {
  id: string;
  title: string;
  category: string | null;
  employeeId: string | null;
  employeeName: string | null;
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** The four counters behind the Ressources humaines pills. */
export interface HrCounts {
  employees: number;
  teams: number;
  locations: number;
  documents: number;
}

// ---- Fiche entreprise ----

export interface CompanyAddress {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  kind: "Business" | "Personal";
  description: string | null;
  contactEmail: string | null;
  phone: string | null;
  /** Null when no logo is on file; otherwise the cache buster for its image URL. */
  logoETag: string | null;
  /** The company's chosen colour as #RRGGBB, or null for Vexta's blue. */
  brandColor: string | null;
  address: CompanyAddress | null;
}

// ---- What a project's own page needs around the record ----

/** One badge per section of a project, so the rail can say how much is behind each. */
export interface ProjectSectionCounts {
  materials: number;
  equipment: number;
  assemblies: number;
  timesheets: number;
  expenses: number;
  extraCharges: number;
  invoices: number;
}

export interface ProjectCostLine {
  key: string;
  label: string;
  cost: number;
  revenue: number;
  profit: number;
}

export interface ProjectCostTable {
  lines: ProjectCostLine[];
  totalCost: number;
  subtotal: number;
  profit: number;
  tax1Label: string;
  tax1: number;
  tax2Label: string;
  tax2: number;
  total: number;
  isTaxExempt: boolean;
}

export interface ProjectSummary {
  counts: ProjectSectionCounts;
  costs: ProjectCostTable;
}

/** One of the company's expense categories. */
export interface ExpenseType {
  id: string;
  name: string;
  expenseCount: number;
}

/** A receipt. The URL is signed and short-lived, which is why it is never stored anywhere. */
export interface ExpensePhoto {
  id: string;
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  url: string | null;
  sortOrder: number;
}

export interface ProjectExpense {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  expenseTypeId: string;
  expenseTypeName: string;
  cost: number | null;
  sellingPrice: number | null;
  spentOn: string | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExpenseDetail {
  expense: ProjectExpense;
  photos: ExpensePhoto[];
}
