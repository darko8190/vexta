import {
  Blocks,
  Building2,
  FileText,
  FolderKanban,
  Images,
  LayoutDashboard,
  MapPin,
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

const tenantNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/adresses", label: "Adresses", icon: MapPin },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  { href: "/factures", label: "Factures", icon: FileText },
  { href: "/bibliotheque", label: "Bibliothèque", icon: Images },
];

/** Managing who can sign in belongs to the owner: an employee must not grant themselves access. */
const tenantAdminNav: NavItem[] = [{ href: "/equipe", label: "Équipe", icon: UsersRound }];

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
