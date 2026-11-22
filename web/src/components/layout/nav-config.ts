import {
  Blocks,
  Building2,
  FileText,
  FolderKanban,
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
}

// Adresses and Bibliothèque are deliberately absent: addresses belong inside a client's own
// record, and the media library is reached from wherever a file is being attached. Their routes
// still work — they are just not top-level destinations.
const tenantNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  { href: "/factures", label: "Factures", icon: FileText },
];

/**
 * Managing who can sign in belongs to the owner: an employee must not grant themselves access.
 * Entreprise sits last on purpose — it is the company's own card, consulted rather than worked in.
 */
const tenantAdminNav: NavItem[] = [
  { href: "/ressources-humaines", label: "Ressources humaines", icon: UsersRound },
  { href: "/entreprise", label: "Entreprise", icon: Building2 },
];

const superAdminNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Locataires", icon: Building2 },
  { href: "/admin/forfaits", label: "Forfaits", icon: Tag },
  { href: "/admin/modules", label: "Modules", icon: Blocks },
  { href: "/admin/apparence", label: "Apparence", icon: Palette },
  { href: "/admin/parametres", label: "Intégrations", icon: Settings },
];

export function getNavItems(role: UserRole | undefined, isImpersonating = false): NavItem[] {
  if (role === "SuperAdmin" && !isImpersonating) return superAdminNav;

  // A super admin who has entered a tenant acts as its owner, so they get the owner's items too.
  const isOwner = role === "TenantAdmin" || (role === "SuperAdmin" && isImpersonating);
  return isOwner ? [...tenantNav, ...tenantAdminNav] : tenantNav;
}
