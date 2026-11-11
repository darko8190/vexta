import {
  Building2,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MapPin,
  Settings,
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
  { href: "/facturation", label: "Facturation", icon: CreditCard },
];

const superAdminNav: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Locataires", icon: Building2 },
  { href: "/admin/parametres", label: "Intégrations", icon: Settings },
];

export function getNavItems(role: UserRole | undefined): NavItem[] {
  return role === "SuperAdmin" ? superAdminNav : tenantNav;
}
