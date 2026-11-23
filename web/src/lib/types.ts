/**
 * Client is a customer of the company, not a member of it: they see their own files only.
 *
 * The three roles a company hands out are TenantAdmin (Administrateur), ProjectManager
 * (Chargé de projet) and TenantUser (Employé) — see userRoleLabels for the words used on screen.
 */
export type UserRole = "SuperAdmin" | "TenantAdmin" | "ProjectManager" | "TenantUser" | "Client";

/** The three a company can assign, in the order they are offered. */
export const assignableRoles = ["TenantAdmin", "ProjectManager", "TenantUser"] as const;

export type AssignableRole = (typeof assignableRoles)[number];

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
  /**
   * Where they stand with the company. Never "Banni": a barred client is one whose lock is
   * closed (see isBlocked), and the screen reads the two together so they cannot disagree.
   */
  status: ClientStatus;
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
  /** Only the ones still in service. */
  assetCount: number;
  /** Positive is owed; negative is a credit the client is holding. */
  accountBalance: number;
  /** Barred outright: no new project, no new invoice, nothing ordered publicly. */
  isBlocked: boolean;
  blockedReason: string | null;
  /** The account is barred but the client is not: they pay as they go. */
  isAccountBlocked: boolean;
  accountBlockedReason: string | null;
  access: ClientAccess;
  createdAt: string;
  updatedAt: string;
}

/**
 * Prospect, client, ancien client.
 *
 * None of the three refuses anything — a prospect is quoted, and an ancien client who calls
 * back is a client again. What refuses is the lock on the record.
 */
export type ClientStatus = "Prospect" | "Client" | "Ancien";

// ---- Actifs : what a client owns that work gets done on ----

/**
 * A vehicle at a garage, a building for a contractor, a furnace for a refrigeration shop.
 *
 * Deliberately not called a vehicle: Vexta is project management for any trade, and the moment
 * one of them gets its own screen the next one needs its own too.
 */
export interface ClientAsset {
  id: string;
  label: string;
  /** "Toyota Corolla 2018", or the label when the make and model were never filled. */
  designation: string;
  /** One of the company's kinds of asset. Null for one filed before a kind was chosen. */
  assetTypeId: string | null;
  assetTypeName: string | null;
  assetTypeIcon: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  serialNumber: string | null;
  reference: string | null;
  usage: number | null;
  usageUnit: string | null;
  addressId: string | null;
  addressLine: string | null;
  notes: string | null;
  /** False once it is sold, scrapped or no longer serviced. Kept, because the work is history. */
  isActive: boolean;
  createdAt: string;
}

export interface SaveClientAssetValues {
  label: string;
  assetTypeId: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  serialNumber: string | null;
  reference: string | null;
  usage: number | null;
  usageUnit: string | null;
  addressId: string | null;
  notes: string | null;
  isActive: boolean;
}

/**
 * One of the company's kinds of asset: Véhicule, Maison, Bloc appartements, Machinerie.
 *
 * Added to from the dropdown that uses it, like an expense category: stopping to go and
 * configure a list is what makes people pick the wrong kind instead.
 */
export interface ClientAssetType {
  id: string;
  name: string;
  icon: string | null;
  assetCount: number;
}

export interface SaveClientAssetTypeValues {
  name: string;
  icon: string | null;
}

// ---- Compte client ----

export type AccountEntryKind = "Charge" | "Paiement" | "Ajustement";

export interface ClientAccountEntry {
  id: string;
  date: string;
  kind: AccountEntryKind;
  /** Signed: positive is owed, negative reduces the balance. */
  amount: number;
  description: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

export interface ClientAccount {
  balance: number;
  totalCharged: number;
  totalPaid: number;
  isBlocked: boolean;
  blockedReason: string | null;
  isAccountBlocked: boolean;
  accountBlockedReason: string | null;
  entries: ClientAccountEntry[];
}

export interface SaveAccountEntryValues {
  kind: AccountEntryKind;
  /** Always positive. The API decides the sign from the kind. */
  amount: number;
  description: string;
  date: string | null;
  /** Only read for an Ajustement, where the direction is the person's to choose. */
  reducesBalance: boolean;
}

// ---- Paiements de facture ----

export type PaymentMethod =
  | "Comptant"
  | "Interac"
  | "Carte"
  | "Cheque"
  | "Virement"
  | "PorteAuCompte"
  | "Autre";

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

/** The payments and the three figures they are read against, which travel together. */
export interface InvoicePayments {
  total: number;
  paid: number;
  outstanding: number;
  /** Why "porté au compte" cannot be used, or null when it can. */
  accountRefusal: string | null;
  payments: InvoicePayment[];
}

export interface SaveInvoicePaymentValues {
  amount: number;
  method: PaymentMethod;
  date: string | null;
  reference: string | null;
  note: string | null;
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

/** The pipeline a job moves through. Facturé is reached by invoicing it, not by hand. */
export type ProjectStatus = "AFaire" | "Commence" | "AFacturer" | "Facture" | "Annule";

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
  /** The margin applied to catalogue lines on this job, if one was chosen. */
  pricePolicyId: string | null;
  pricePolicyName: string | null;
  /** The client's asset the work is on: the car in the bay, the building being reroofed. */
  clientAssetId: string | null;
  clientAssetLabel: string | null;
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

/** What a line is. The kind decides where its price comes from. */
export type InvoiceLineKind =
  | "Materiaux"
  | "MainDOeuvre"
  | "Equipement"
  | "FraisSupplementaires"
  | "Autre";

export interface InvoiceLine {
  id?: string;
  kind: InvoiceLineKind;
  /** The catalogue entry this line came from, for a material or a piece of equipment. */
  productId?: string | null;
  description: string;
  quantity: number;
  purchasePrice?: number | null;
  marginPercent?: number | null;
  /** The selling price per unit — what the client is charged. */
  unitPrice: number;
  /** Whether the company's two rates apply. The rates themselves belong to the invoice. */
  isTaxable: boolean;
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
  /** No tax on this invoice. No line is taxable while it is set. */
  isTaxExempt: boolean;
  /** Which margin the catalogue lines were priced with, if any. */
  pricePolicyId: string | null;
  pricePolicyName: string | null;
  /** When it was emailed to the client, or null if it never was. */
  sentAt: string | null;
  subtotal: number;
  /** The two taxes, named and separate — "TPS (5 %)" and what it comes to. */
  tax1Label: string;
  tax1: number;
  tax2Label: string;
  tax2: number;
  taxTotal: number;
  total: number;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
}

// ---- Sending an invoice by email ----

/** One field a company may drop into its invoice email, as the settings screen lists them. */
export interface InvoiceEmailField {
  /** Written as {{numero}} in the template. */
  field: string;
  description: string;
}

/** A person the invoice can be addressed to: the client, or one of its contacts. */
export interface InvoiceRecipient {
  /** The contact's id, or null for the client's own address. */
  id: string | null;
  name: string;
  email: string;
  /** What this address is — « Fiche du client », « Comptes payables ». */
  role: string | null;
}

/** A file already on file that can ride along with the invoice. */
export interface InvoiceAttachmentOption {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Everything the send screen needs, in one request: who it can go to, the company's own
 * wording with the invoice's fields already filled in, and what can be attached.
 */
export interface InvoiceSendDefaults {
  /** The address pre-selected: the client's, or its first contact. Null when none is on file. */
  to: string | null;
  subject: string;
  /** HTML, fields already resolved — this is exactly what will be sent. */
  body: string;
  recipients: InvoiceRecipient[];
  /** Employees who can be put in copy, with their sign-in addresses. */
  employees: InvoiceRecipient[];
  /** The documents of the project this invoice belongs to, if it belongs to one. */
  projectDocuments: InvoiceAttachmentOption[];
}

export interface SendInvoiceValues {
  to: string;
  ccEmployeeIds: string[];
  subject: string;
  body: string;
  /** Files uploaded in the send form itself. */
  mediaAssetIds: string[];
  projectDocumentIds: string[];
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
  /**
   * The one integration billed per use rather than per month: it reads the receipts
   * photographed against an expense. How many a company gets is set on its plan.
   */
  anthropicConfigured: boolean;
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
  /** Receipts a month this plan may have read by a model. Zero turns the feature off. */
  monthlyReceiptScans: number;
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
  /**
   * Administrateur, chargé de projet or employé. Decided before an access exists, and copied
   * onto the sign-in account the moment one is granted.
   */
  role: AssignableRole;
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
  /** Only the work still open: a finished task is no longer something to do. */
  openTasks: number;
  materials: number;
  equipment: number;
  assemblies: number;
  timesheets: number;
  expenses: number;
  extraCharges: number;
  /** Files and written notes together: one section, one badge. */
  documentsAndNotes: number;
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

/**
 * A material posted on a job. The three prices are copied onto the row when it is taken from
 * the catalogue, so a repriced product never rewrites a job that is already closed.
 */
export interface ProjectMaterial {
  id: string;
  /** The catalogue entry it came from, or null when it was typed by hand. */
  productId: string | null;
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  purchasePrice: number | null;
  marginPercent: number | null;
  /** What the client is charged per unit. */
  unitPrice: number;
  /** quantity × unitPrice, computed by the API so both ends show the same figure. */
  total: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Tasks ----

export type ProjectTaskStatus = "AFaire" | "EnCours" | "Bloquee" | "Terminee";

export type ProjectTaskPriority = "Basse" | "Normale" | "Haute" | "Urgente";

/** One person a task can be handed to. */
export interface TaskAssignee {
  id: string;
  name: string;
  jobTitle: string | null;
}

export interface TaskTeam {
  id: string;
  name: string;
  memberCount: number;
}

export interface TaskAssignables {
  employees: TaskAssignee[];
  teams: TaskTeam[];
}

/**
 * One thing to do on a job. A task goes to named people, to a team, to both, or to nobody —
 * all four are real, and the list says which rather than inventing an owner.
 */
export interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  assignees: TaskAssignee[];
  completedAt: string | null;
  /** Decided by the API, so every reader agrees on what today is. */
  isLate: boolean;
  sortOrder: number;
}

export interface SaveProjectTaskValues {
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  assignedTeamId: string | null;
  assigneeIds: string[];
}

export interface SaveProjectMaterialValues {
  productId: string | null;
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  purchasePrice: number | null;
  marginPercent: number | null;
  unitPrice: number;
}

/** One stretch of time worked on a job. The hours are rounded to the quarter by the API. */
export interface TimesheetEntry {
  id: string;
  /** Null when the person has since been taken off the payroll. */
  employeeId: string | null;
  employeeName: string | null;
  startDate: string;
  endDate: string;
  /** HH:mm, as the time inputs read and write them. */
  startTime: string;
  endTime: string;
  /** Rounded to the quarter hour: 7 h 52 → 16 h 03 is 8,25. */
  hours: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveTimesheetValues {
  employeeId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  note: string | null;
}

/** A file filed against a job. The URL is signed and short-lived, so it is never stored. */
export interface ProjectDocument {
  id: string;
  title: string;
  /** The company's own filing: « Plan », « Permis », « Soumission ». */
  category: string | null;
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  url: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface SaveProjectDocumentValues {
  title: string;
  category: string | null;
  mediaAssetId: string;
}

/** Something written down about the job, as a dated entry in a thread. */
export interface ProjectNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
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

// ---- Catalogue, pricing and the company's public page ----

/** How a purchase price becomes a selling price. See MarginMode on the API. */
export type MarginMode = "Multiplication" | "Division";

export type EmploymentType = "TempsPlein" | "TempsPartiel" | "Contrat" | "Saisonnier" | "Stage";

/** A named margin, chosen on a project or an invoice. */
export interface PricePolicy {
  id: string;
  name: string;
  marginPercent: number;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  productCount: number;
  subCategories: ProductSubCategory[];
}

export interface ProductSubCategory {
  id: string;
  categoryId: string;
  name: string;
  productCount: number;
}

/** A product as a list shows it. A-0001 is its number. */
export interface ProductRecord {
  id: string;
  number: number;
  code: string | null;
  title: string;
  description: string | null;
  /** How it is counted and sold: un, pi, m, sac. */
  unit: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  barcode: string | null;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  tracksInventory: boolean;
  /** What is on the shelf. */
  quantityOnHand: number;
  /** Committed to projects and invoices that have not been settled. */
  quantityReserved: number;
  /** On hand minus reserved. */
  quantityAvailable: number;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  installationMinutes: number | null;
  note: string | null;
  /** Null for a product; set for a variant of one. */
  parentProductId: string | null;
  parentTitle: string | null;
  variantCount: number;
  imageCount: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  url: string | null;
  sortOrder: number;
}

export interface ProductPriceEntry {
  id: string;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  changedByName: string | null;
  createdAt: string;
}

export interface ProductStockEntry {
  id: string;
  quantityChange: number;
  quantityAfter: number;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** The badges on a product's own rail. */
export interface ProductSectionCounts {
  images: number;
  variants: number;
  suppliers: number;
  stockEntries: number;
  priceEntries: number;
  purchases: number;
}

/** A position shown on the company's public page. */
export interface JobPosting {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  employmentType: EmploymentType;
  compensation: string | null;
  applyTo: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the company writes on its public page, as its owner edits it. */
export interface PublicPageSettings {
  isPublished: boolean;
  headline: string | null;
  about: string | null;
  contactNote: string | null;
  showProducts: boolean;
  showJobs: boolean;
  /** Where the page lives: /e/{slug}. */
  slug: string;
  updatedAt: string | null;
}

/** The same page as a visitor reads it, with nothing private on it. */
export interface PublicCompany {
  name: string;
  slug: string;
  headline: string | null;
  about: string | null;
  contactNote: string | null;
  email: string | null;
  phone: string | null;
  logoETag: string | null;
  tenantId: string;
  brandColor: string | null;
  address: CompanyAddress | null;
  products: PublicProduct[];
  jobs: JobPosting[];
}

export interface PublicProduct {
  id: string;
  number: number;
  title: string;
  description: string | null;
  categoryName: string | null;
  sellingPrice: number | null;
  imageUrl: string | null;
}

/**
 * A catalogue hit as the invoice line picker shows it. Deliberately small: the picker runs on
 * every keystroke and a line only needs what it is about to copy onto itself.
 */
export interface ProductSearchResult {
  id: string;
  number: number;
  code: string | null;
  title: string;
  /** Copied onto the line that picks it, so a quantity reads as feet or as sheets. */
  unit: string | null;
  categoryName: string | null;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  tracksInventory: boolean;
  quantityAvailable: number;
}

// ---- Reports ----

/** One report a company is offered on the Rapports page. */
export interface ReportSummary {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  moduleId: string;
  moduleTitle: string;
  /** False while the calculation is still to be written. The page says so plainly. */
  isImplemented: boolean;
}

export interface ReportColumn {
  label: string;
  /** Right-aligned and tabular. A property of the column, not a guess from the first cell. */
  numeric: boolean;
}

/**
 * A report's result: columns, and rows of cells already formatted by the API. Shapeless on
 * purpose — a new report is a server-side job, not a new table component here.
 */
export interface ReportResult {
  title: string;
  subtitle: string | null;
  columns: ReportColumn[];
  rows: string[][];
  totals: string[] | null;
  generatedAt: string;
}

/** One report as the super admin manages it. */
export interface AdminReport {
  id: string;
  moduleId: string;
  moduleTitle: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface ReportKeyOption {
  key: string;
  label: string;
  isImplemented: boolean;
}

export interface SaveReportValues {
  moduleId: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  sortOrder: number;
  isPublished: boolean;
}

// ---- Mon espace : what the signed-in employee has to do, and has done ----

export interface MyTimesheet {
  id: string;
  projectId: string;
  /** Shown as P-0001, which is how the job is named on paper. */
  projectNumber: number;
  clientName: string;
  projectDescription: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
}

export interface MyWeek {
  /** Monday. Decided by the server so the browser and the payroll cannot disagree. */
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  /** False for an account with no employee record behind it. Not an error — a state. */
  hasEmployeeRecord: boolean;
  entries: MyTimesheet[];
}

export interface MyAssignment {
  id: string;
  projectId: string;
  projectNumber: number;
  clientName: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  startDate: string | null;
  dueDate: string | null;
  isLate: boolean;
  /** The crew's name when the task came through a crew, null when it came by name. */
  viaTeam: string | null;
}

export interface MyAssignments {
  hasEmployeeRecord: boolean;
  assignments: MyAssignment[];
}

// ---- Achats : every expense the company has filed, across its jobs ----

export interface ExpenseListItem {
  id: string;
  projectId: string;
  projectNumber: number;
  clientName: string;
  name: string;
  description: string | null;
  expenseTypeId: string;
  expenseTypeName: string;
  cost: number | null;
  sellingPrice: number | null;
  spentOn: string | null;
  photoCount: number;
  createdAt: string;
}

/** Over everything the filters match, not only the page on screen. */
export interface ExpenseTotals {
  count: number;
  cost: number;
  sellingPrice: number;
}

export interface ExpenseList {
  page: PagedResult<ExpenseListItem>;
  totals: ExpenseTotals;
}

export interface ExpenseFilters {
  search?: string;
  type?: string;
  du?: string;
  au?: string;
  projet?: string;
}

// ---- Formulaires : what a company asks, and what the answers set off ----

/** What a question accepts. Short on purpose: a type nobody can explain comes back empty. */
export type FormFieldType =
  | "Texte"
  | "TexteLong"
  | "Nombre"
  | "Date"
  | "Choix"
  | "MultiChoix"
  | "OuiNon"
  | "Courriel"
  | "Telephone";

/** Which field of a new client an answer fills, when the form is set to create one. */
export type FormFieldTarget =
  | "Aucun"
  | "Prenom"
  | "Nom"
  | "NomEntreprise"
  | "Courriel"
  | "Telephone"
  | "Notes";

export type FormActionKind = "EnvoyerCourriel" | "CreerClient";

export interface FormTemplate {
  id: string;
  title: string;
  description: string | null;
  successMessage: string | null;
  /** False while it is being written: a draft is not offered to be filled. */
  isPublished: boolean;
  sortOrder: number;
  fieldCount: number;
  actionCount: number;
  submissionCount: number;
  updatedAt: string;
}

export interface FormField {
  id: string;
  label: string;
  helpText: string | null;
  type: FormFieldType;
  isRequired: boolean;
  /** Already split. Empty for the types that offer no choices. */
  options: string[];
  target: FormFieldTarget;
  sortOrder: number;
}

export interface FormAction {
  id: string;
  kind: FormActionKind;
  recipients: string | null;
  subject: string | null;
  newClientStatus: ClientStatus;
  isActive: boolean;
  sortOrder: number;
}

export interface FormTemplateDetail {
  form: FormTemplate;
  fields: FormField[];
  actions: FormAction[];
}

export interface SaveFormTemplateValues {
  title: string;
  description: string | null;
  successMessage: string | null;
  isPublished: boolean;
  sortOrder: number;
}

/** Null id for a new question. One left out of the list is deleted. */
export interface SaveFormFieldValues {
  id: string | null;
  label: string;
  type: FormFieldType;
  isRequired: boolean;
  helpText: string | null;
  options: string[];
  target: FormFieldTarget;
}

export interface SaveFormActionValues {
  id: string | null;
  kind: FormActionKind;
  recipients: string | null;
  subject: string | null;
  newClientStatus: ClientStatus;
  isActive: boolean;
}

export interface FormAnswer {
  id: string;
  formFieldId: string | null;
  /** A copy taken when it was answered: renaming the question must not rewrite the answer. */
  label: string;
  type: FormFieldType;
  value: string | null;
  sortOrder: number;
}

export interface FormSubmission {
  id: string;
  formTemplateId: string;
  formTitle: string;
  submittedByName: string | null;
  createdClientId: string | null;
  createdClientName: string | null;
  /** What the actions did, failures included. Null when the form sets nothing off. */
  actionLog: string | null;
  answerCount: number;
  createdAt: string;
}

export interface FormSubmissionDetail {
  submission: FormSubmission;
  answers: FormAnswer[];
}

export interface SubmitFormResult {
  submission: FormSubmissionDetail;
  successMessage: string;
  actionLog: string | null;
}

// ---- Lecture de reçus ----

/**
 * What a model read off a receipt.
 *
 * Nothing here is saved by the API: it fills the form the person is already in, and they
 * decide. A receipt read wrong and filed silently ends up on a client's invoice.
 */
export interface ReceiptReading {
  found: boolean;
  /** Why nothing came back, or null when the reading speaks for itself. */
  message: string | null;
  /** Scans left in the month's allowance. */
  remaining: number;
  supplier: string | null;
  total: number | null;
  gst: number | null;
  qst: number | null;
  spentOn: string | null;
  invoiceNumber: string | null;
}

/** Whether the button is worth offering: a key on the platform, and scans left this month. */
export interface ReceiptScanAvailability {
  available: boolean;
  remaining: number;
  allowance: number;
}

// ---- La fiche de l'employé ----

export type WageKind = "Horaire" | "Annuel";

export type LeaveKind = "Vacances" | "Maladie" | "SansSolde" | "Parental" | "BanqueHeures" | "Autre";

export type LeaveStatus = "EnAttente" | "Approuve" | "Refuse" | "Annule";

export type CredentialKind = "Formation" | "Permis" | "Carte";

export type CvEntryKind = "Experience" | "Formation" | "Competence";

export type CandidateStatus = "Nouveau" | "Entrevue" | "Offre" | "Embauche" | "Refuse" | "Retire";

export interface EmployeeAddress {
  id: string;
  employeeId: string;
  employeeName: string;
  label: string | null;
  isPrimary: boolean;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string;
}

export interface SaveEmployeeAddressValues {
  employeeId: string;
  label: string | null;
  isPrimary: boolean;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string | null;
}

export interface EmergencyContact {
  id: string;
  employeeId: string;
  employeeName: string;
  name: string;
  relationship: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  isPrimary: boolean;
  note: string | null;
}

export interface SaveEmergencyContactValues {
  employeeId: string;
  name: string;
  relationship: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  isPrimary: boolean;
  note: string | null;
}

/** One rate, and whether it is the one in force today. */
export interface EmployeeWage {
  id: string;
  effectiveOn: string;
  kind: WageKind;
  amount: number;
  note: string | null;
  isCurrent: boolean;
}

export interface SaveEmployeeWageValues {
  effectiveOn: string;
  kind: WageKind;
  amount: number;
  note: string | null;
}

export interface HourBankEntry {
  id: string;
  date: string;
  /** Positive when banked, negative when taken. */
  hours: number;
  reason: string;
  createdAt: string;
}

export interface HourBank {
  balance: number;
  banked: number;
  taken: number;
  entries: HourBankEntry[];
}

export interface SaveHourBankEntryValues {
  date: string;
  hours: number;
  reason: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  hours: number | null;
  note: string | null;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Both ends included, so a single-day leave reads 1. */
  days: number;
  createdAt: string;
}

export interface SaveLeaveValues {
  employeeId: string | null;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  hours: number | null;
  note: string | null;
}

export interface ScheduleShift {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string | null;
  projectNumber: number | null;
  projectDescription: string | null;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
}

export interface ScheduleWeek {
  start: string;
  end: string;
  totalHours: number;
  shifts: ScheduleShift[];
}

export interface SaveScheduleShiftValues {
  employeeId: string | null;
  projectId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
}

export interface EmployeeCredential {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: CredentialKind;
  name: string;
  issuer: string | null;
  reference: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  mediaAssetId: string | null;
  fileName: string | null;
  note: string | null;
  /** Null when it does not expire; negative once it has. */
  daysUntilExpiry: number | null;
}

export interface SaveEmployeeCredentialValues {
  employeeId: string;
  kind: CredentialKind;
  name: string;
  issuer: string | null;
  reference: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  mediaAssetId: string | null;
  note: string | null;
}

export interface EmployeeCvEntry {
  id: string;
  kind: CvEntryKind;
  title: string;
  organization: string | null;
  startOn: string | null;
  endOn: string | null;
  description: string | null;
  sortOrder: number;
}

export interface SaveEmployeeCvEntryValues {
  kind: CvEntryKind;
  title: string;
  organization: string | null;
  startOn: string | null;
  endOn: string | null;
  description: string | null;
  sortOrder: number;
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  desiredJobTitle: string | null;
  source: string | null;
  status: CandidateStatus;
  appliedOn: string;
  resumeMediaAssetId: string | null;
  resumeFileName: string | null;
  notes: string | null;
  /** Set once they are hired. The card then points at a real employee. */
  employeeId: string | null;
}

export interface SaveCandidateValues {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  desiredJobTitle: string | null;
  source: string | null;
  status: CandidateStatus;
  appliedOn: string | null;
  resumeMediaAssetId: string | null;
  notes: string | null;
}

export interface HireCandidateValues {
  email: string;
  jobTitle: string | null;
}

/** The badges on the HR rail, in one call. */
export interface HrSectionCounts {
  employees: number;
  teams: number;
  addresses: number;
  emergencyContacts: number;
  candidates: number;
  credentials: number;
  pendingLeaves: number;
  documents: number;
}

// ---- Fournisseurs, commandes et réceptions ----

export type PurchaseOrderStatus = "Brouillon" | "Envoyee" | "PartiellementRecue" | "Recue" | "Annulee";

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  accountNumber: string | null;
  line1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
  isActive: boolean;
  orderCount: number;
  /** Placed but not fully received. What somebody is chasing. */
  openOrderCount: number;
}

export interface SaveSupplierValues {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  accountNumber: string | null;
  line1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface PurchaseOrderLine {
  id: string;
  productId: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
  total: number;
  quantityReceived: number;
  sortOrder: number;
}

export interface PurchaseOrder {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  projectId: string | null;
  projectNumber: number | null;
  projectDescription: string | null;
  status: PurchaseOrderStatus;
  orderedOn: string;
  expectedOn: string | null;
  reference: string | null;
  note: string | null;
  /** Before tax. What the supplier's invoice should come to. */
  total: number;
  lineCount: number;
  receiptCount: number;
  createdAt: string;
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder;
  lines: PurchaseOrderLine[];
}

export interface SavePurchaseOrderLineValues {
  id: string | null;
  productId: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
}

export interface SavePurchaseOrderValues {
  supplierId: string;
  projectId: string | null;
  orderedOn: string | null;
  expectedOn: string | null;
  reference: string | null;
  note: string | null;
  lines: SavePurchaseOrderLineValues[] | null;
}

export interface GoodsReceiptLine {
  id: string;
  purchaseOrderLineId: string;
  description: string;
  unit: string | null;
  quantity: number;
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId: string;
  orderNumber: number;
  supplierId: string;
  supplierName: string;
  receivedOn: string;
  slipNumber: string | null;
  note: string | null;
  lineCount: number;
  createdAt: string;
}

export interface GoodsReceiptDetail {
  receipt: GoodsReceipt;
  lines: GoodsReceiptLine[];
}

export interface SaveGoodsReceiptValues {
  purchaseOrderId: string;
  receivedOn: string | null;
  slipNumber: string | null;
  note: string | null;
  lines: { purchaseOrderLineId: string; quantity: number }[];
}

/** What is still owed on an order, so the delivery form opens with the right numbers. */
export interface OutstandingLine {
  purchaseOrderLineId: string;
  description: string;
  unit: string | null;
  ordered: number;
  received: number;
  outstanding: number;
}

// ---- Paiements, vus de la facturation ----

export interface PaymentListItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

/** `onAccount` is held apart: it is the invoice moved onto the client's account, not money in. */
export interface PaymentTotals {
  count: number;
  received: number;
  onAccount: number;
}

export interface PaymentList {
  page: PagedResult<PaymentListItem>;
  totals: PaymentTotals;
}

// ---- Réponses aux formulaires ----

export interface FormResponsesSummary {
  id: string;
  title: string;
  isPublished: boolean;
  submissionCount: number;
  /** Null when nobody has filled it yet. */
  lastSubmissionAt: string | null;
}

/** One shift this person worked, as their file lists it. */
export interface EmployeeTimesheet {
  id: string;
  projectId: string;
  projectNumber: number;
  clientName: string;
  projectDescription: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
}

export interface EmployeeWeek {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  entries: EmployeeTimesheet[];
}

/** The badges on one employee's rail. Leaves counts only what is still waiting. */
export interface EmployeeFileCounts {
  emergencyContacts: number;
  addresses: number;
  cvEntries: number;
  wages: number;
  credentials: number;
  pendingLeaves: number;
  hourBankEntries: number;
  documents: number;
}
