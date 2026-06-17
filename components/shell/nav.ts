import {
  LayoutDashboard,
  Eye,
  Link2,
  FileSearch,
  Sparkles,
  FileText,
  TrendingUp,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Built and reachable in the current milestone. Unbuilt items render disabled. */
  enabled: boolean;
};

/**
 * Full product nav. `enabled` is flipped on per milestone:
 * M1 Overview · M2 Settings · M3 Visibility · M4 Sources · M5 Site audit/Actions ·
 * M6 Content · M7 Tracking · M8 Assistant.
 */
export const navItems: NavItem[] = [
  { label: "Overview", href: "/app", icon: LayoutDashboard, enabled: true },
  { label: "Visibility", href: "/app/visibility", icon: Eye, enabled: true },
  { label: "Sources", href: "/app/sources", icon: Link2, enabled: true },
  { label: "Site audit", href: "/app/site-audit", icon: FileSearch, enabled: true },
  { label: "Actions", href: "/app/actions", icon: Sparkles, enabled: true },
  { label: "Content", href: "/app/content", icon: FileText, enabled: true },
  { label: "Tracking", href: "/app/tracking", icon: TrendingUp, enabled: true },
  { label: "Assistant", href: "/app/assistant", icon: Bot, enabled: false },
  { label: "Settings", href: "/app/settings", icon: Settings, enabled: true },
];
