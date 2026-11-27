﻿import {
  Blocks,
  Boxes,
  Briefcase,
  Bug,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartBar,
  ClipboardPen,
  Clock,
  FileText,
  FileUser,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Palette,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Truck,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 0 for a tab, 1 for a sub-tab. One level deep: a sidebar that nests further stops scanning. */
  depth?: number;
}

// Adresses and Bibliothèque are deliberately absent: addresses belong inside a client's own
// record, and the media library is reached from wherever a file is being attached. Their routes
// still work — they are just not top-level destinations.
/** Always first and never a module: a company must have somewhere to land. */
export const dashboardNavItem: NavItem = {
  href: "/tableau-de-bord",
  label: "Tableau de bord",
  icon: LayoutDashboard,
};

const tenantNav: NavItem[] = [
  dashboardNavItem,
  // The two an employee opens first, and the only two that are about them rather than about the
  // company. High on the list on purpose: for most of the payroll, these are the application.
  { href: "/mes-feuilles-de-temps", label: "Mes feuilles de temps", icon: CalendarClock },
  { href: "/mes-assignations", label: "Mes assignations", icon: ListChecks },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  // Before Facturation, because that is the order the money happens in: a price is given,
  // then the work is done, then it is billed.
  { href: "/soumissions", label: "Soumissions", icon: ClipboardPen },
  // Facturation rather than Factures: the tab holds the invoices and what was paid on them,
  // and naming it after only the first half would make the second look like it belongs
  // somewhere else. Paiements is a section inside it, not a second entry here.
  { href: "/factures", label: "Facturation", icon: FileText },
  // Money already spent, under the heading it will grow into.
  { href: "/achats", label: "Achats", icon: ShoppingCart },
  // Its own tab rather than a section of Achats: a dépense is money already gone, and an order
  // is money promised. They are read by different people on different days.
  { href: "/approvisionnement", label: "Fournisseurs & Commandes", icon: Truck },
  { href: "/inventaire", label: "Inventaire", icon: Boxes },
  // Beside Inventaire: both are what the company has, one sold off the shelf, the other
  // brought back after each job and billed for its time.
  { href: "/equipements", label: "Équipements", icon: Wrench },
  // Right after Inventaire, because that is where what it sells comes from. "En ligne" is
  // doing real work in the label: Fournisseurs & Commandes above is the company buying, and
  // somebody who opened the wrong one would only find out from the names on the rows.
  { href: "/commandes", label: "Commandes en ligne", icon: ShoppingBag },
  // Outils, not "Outils & Formation": the formations went to Ressources humaines, where the
  // people they belong to are. A heading that still named them would send somebody here first.
  { href: "/outils", label: "Outils", icon: ClipboardPen },
  // The company's whole crew, as against "Mes feuilles de temps" at the top, which is one
  // person's own. Two entries for what looks like one thing because they answer to two
  // different people: an employee files, a foreman reads.
  { href: "/temps", label: "Feuilles de temps et poinçons", icon: Clock },
  { href: "/taches-horaire", label: "Tâches et horaire", icon: CalendarClock },
  // In the built-in menu too, not only as a module: a company whose plan defines no modules
  // falls back to this list, and it should not be the one company without its figures.
  { href: "/rapports", label: "Rapports", icon: ChartBar },
];

/**
 * Managing who can sign in belongs to the owner: an employee must not grant themselves access.
 * Entreprise sits last on purpose — it is the company's own card, consulted rather than worked in.
 */
const tenantAdminNav: NavItem[] = [
  { href: "/ressources-humaines", label: "Ressources humaines", icon: UsersRound },
  // The company card now opens Paramètres, as its first section.
];

/**
 * A personal space holds what belongs to the person rather than to a company.
 *
 * Two halves, in this order. First what is theirs — their CV, the jobs they hold, what they
 * have been invoiced — gathered from every company on the platform rather than from the one
 * space they happen to be in: somebody who is a customer of three contractors had three places
 * to look and three places to forget one.
 *
 * Then the directory: the companies, the positions and the products published across Vexta.
 * That half is not about them at all, which is why it comes second — but it is the half that
 * makes a personal space worth opening when there is nothing waiting in the first.
 *
 * Clients and projects are still absent on purpose. They belong to a company, and offering them
 * here would open screens whose only content is an invitation to buy a business plan.
 */
const personalNav: NavItem[] = [
  { href: "/mon-cv", label: "Mon CV", icon: FileUser },
  { href: "/mes-emplois", label: "Mes emplois", icon: Briefcase },
  { href: "/mes-commandes", label: "Mes commandes", icon: ShoppingBag },
  { href: "/mes-factures", label: "Mes factures", icon: FileText },
  { href: "/mes-entreprises", label: "Mes entreprises", icon: Store },
  { href: "/entreprises", label: "Entreprises", icon: Building2 },
  { href: "/emplois", label: "Rechercher un emploi", icon: Search },
  { href: "/magasiner", label: "Magasiner", icon: ShoppingCart },
];

/**
 * A customer sees their own files and nothing else. The labels say "mes" on purpose: the same
 * two routes show the whole company to staff, and the possessive is what tells a client what
 * they are looking at without them having to work it out from an unexpectedly short list.
 */
const clientNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/projets", label: "Mes projets", icon: FolderKanban },
  // Between the two, in the order the money happens: the price, the work, the bill.
  { href: "/soumissions", label: "Mes soumissions", icon: ClipboardPen },
  { href: "/factures", label: "Mes factures", icon: FileText },
];

const superAdminNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Locataires", icon: Building2 },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/forfaits", label: "Forfaits", icon: Tag },
  { href: "/admin/modules", label: "Modules", icon: Blocks },
  // Beside Modules, because the two together are what a forfait is made of: the tabs and what
  // can be done inside them.
  { href: "/admin/fonctionnalites", label: "Fonctionnalités", icon: Sparkles },
  // After Modules on purpose: a report is attached to one, so the module has to exist first.
  { href: "/admin/rapports", label: "Rapports", icon: ChartBar },
  { href: "/admin/signalements", label: "Signalements", icon: Bug },
  { href: "/admin/apparence", label: "Apparence", icon: Palette },
  { href: "/admin/parametres", label: "Intégrations", icon: Settings },
];

/**
 * The menu of « mode employé »: what someone working on the jobs opens, for an owner or a
 * project manager who is, today, one of the crew.
 */
const EMPLOYEE_MODE_HREFS = ["/mes-assignations", "/mes-feuilles-de-temps"];

/** What is the employee's own besides their hours and assignments: their leave, their week, their expenses. */
export const crewOwnNav: NavItem[] = [
  { href: "/mes-conges", label: "Mes demandes de congés", icon: CalendarDays },
  { href: "/mon-horaire", label: "Mon horaire", icon: CalendarRange },
  { href: "/mes-depenses", label: "Mes dépenses", icon: Receipt },
];

export function employeeModeNavItems(): NavItem[] {
  return [
    ...EMPLOYEE_MODE_HREFS.map((href) => tenantNav.find((item) => item.href === href)).filter(
      (item): item is NavItem => Boolean(item),
    ),
    ...crewOwnNav,
  ];
}

export function getNavItems(
  role: UserRole | undefined,
  isImpersonating = false,
  tenantKind: "Business" | "Personal" | null = null,
): NavItem[] {
  if (role === "SuperAdmin" && !isImpersonating) return superAdminNav;
  if (role === "Client") return clientNav;
  if (tenantKind === "Personal") return personalNav;

  // A super admin who has entered a tenant acts as its owner, so they get the owner's items too.
  const isOwner = role === "TenantAdmin" || (role === "SuperAdmin" && isImpersonating);

  return isOwner ? [...tenantNav, ...tenantAdminNav] : tenantNav;
}
