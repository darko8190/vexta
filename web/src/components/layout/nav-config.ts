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

const superAdminNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Locataires", icon: Building2 },
  { href: "/admin/forfaits", label: "Forfaits", icon: Tag },
  { href: "/admin/modules", label: "Modules", icon: Blocks },
  { href: "/admin/apparence", label: "Apparence", icon: Palette },
  { href: "/admin/parametres", label: "Intégrations", icon: Settings },
];

export function getNavItems(role: UserRole | undefined, isImpersonating = false): NavItem[] {
  return role === "SuperAdmin" && !isImpersonating ? superAdminNav : tenantNav;
}
