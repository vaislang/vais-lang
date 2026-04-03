export interface NavItem {
  title: string;
  path: string;
  children?: NavItem[];
}

export interface SidebarSection {
  title: string;
  items: NavItem[];
  collapsible?: boolean;
  collapsed?: boolean;
}

export interface SidebarConfig {
  sections: SidebarSection[];
}

export interface PageMeta {
  title: string;
  description?: string;
  section: "api" | "tutorial" | "guide" | "home";
}

export interface RenderedPage {
  html: string;
  meta: PageMeta;
}

export type ColorScheme = "light" | "dark";
