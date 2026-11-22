import {
  Bell,
  Building2,
  Calendar,
  ChartBar,
  Cloud,
  Clock,
  CreditCard,
  FileText,
  FolderKanban,
  HardDrive,
  Images,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Truck,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";

/**
 * The icons a module may use. The API validates against the same names, so a module can never
 * reach the public site asking for an icon this app cannot draw.
 */
export const MODULE_ICONS = {
  Users,
  MapPin,
  FolderKanban,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Images,
  HardDrive,
  CreditCard,
  Receipt,
  Calendar,
  Clock,
  Mail,
  Phone,
  Bell,
  Search,
  ChartBar,
  TrendingUp,
  Settings,
  Lock,
  Cloud,
  Smartphone,
  Truck,
  Wrench,
  Building2,
  UsersRound,
} as const;

export type ModuleIconName = keyof typeof MODULE_ICONS;

export const MODULE_ICON_NAMES = Object.keys(MODULE_ICONS) as ModuleIconName[];

/** Falls back to a neutral icon rather than rendering nothing if a name ever slips through. */
export function moduleIcon(name: string) {
  return MODULE_ICONS[name as ModuleIconName] ?? Settings;
}
