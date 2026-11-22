import {
  Blocks,
  Boxes,
  ChartBar,
  Building2,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Palette,
  Settings,
  Tag,
  Users,
  UsersRound,
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
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  { href: "/factures", label: "Factures", icon: FileText },
  { href: "/inventaire", label: "Inventaire", icon: Boxes },
  { href: "/outils", label: "Outils & Formation", icon: GraduationCap },
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
  { href: "/entreprise", label: "Entreprise", icon: Building2 },
];

/**
 * A personal space holds nothing yet. Clients, projects and invoices belong to a company, and
 * offering them here would open three screens whose only content is an invitation to buy a
 * business plan. What goes in a personal space is still being decided; until then the space is
 * honestly empty rather than furnished with other people's furniture.
 */
const personalNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
];

/**
 * A customer sees their own files and nothing else. The labels say "mes" on purpose: the same
 * two routes show the whole company to staff, and the possessive is what tells a client what
 * they are looking at without them having to work it out from an unexpectedly short list.
 */
const clientNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/projets", label: "Mes projets", icon: FolderKanban },
  { href: "/factures", label: "Mes factures", icon: FileText },
];

const superAdminNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Locataires", icon: Building2 },
  { href: "/admin/forfaits", label: "Forfaits", icon: Tag },
  { href: "/admin/modules", label: "Modules", icon: Blocks },
  // After Modules on purpose: a report is attached to one, so the module has to exist first.
  { href: "/admin/rapports", label: "Rapports", icon: ChartBar },
  { href: "/admin/apparence", label: "Apparence", icon: Palette },
  { href: "/admin/parametres", label: "Intégrations", icon: Settings },
];

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
