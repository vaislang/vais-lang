import type { SidebarConfig, SidebarSection, NavItem } from "./types.js";

export const SIDEBAR_CONFIG: SidebarConfig = {
  sections: [
    {
      title: "Getting Started",
      collapsible: true,
      collapsed: false,
      items: [
        { title: "Introduction", path: "/" },
        { title: "Installation", path: "/guide/installation" },
        { title: "Quick Start", path: "/guide/quick-start" },
      ],
    },
    {
      title: "Guide",
      collapsible: true,
      collapsed: false,
      items: [
        { title: "Overview", path: "/guide/" },
        { title: "Configuration", path: "/guide/configuration" },
        { title: "Components", path: "/guide/components" },
        { title: "Routing", path: "/guide/routing" },
        { title: "SSR & SSG", path: "/guide/ssr-ssg" },
      ],
    },
    {
      title: "Tutorial",
      collapsible: true,
      collapsed: false,
      items: [
        { title: "Overview", path: "/tutorial/" },
        { title: "Building Your First App", path: "/tutorial/first-app" },
        { title: "State Management", path: "/tutorial/state" },
        { title: "API Integration", path: "/tutorial/api-integration" },
      ],
    },
    {
      title: "API Reference",
      collapsible: true,
      collapsed: true,
      items: [
        { title: "Overview", path: "/api/" },
        { title: "@vaisx/runtime", path: "/api/runtime" },
        { title: "@vaisx/kit", path: "/api/kit" },
        { title: "@vaisx/components", path: "/api/components" },
        { title: "@vaisx/cli", path: "/api/cli" },
      ],
    },
  ],
};

/**
 * Build the sidebar HTML for the given current path.
 * Active items and their parent sections are highlighted.
 */
export function buildSidebarHTML(config: SidebarConfig, currentPath: string): string {
  const sections = config.sections
    .map((section) => buildSectionHTML(section, currentPath))
    .join("\n");

  return `<nav class="sidebar-nav" aria-label="Documentation navigation">\n${sections}\n</nav>`;
}

function buildSectionHTML(section: SidebarSection, currentPath: string): string {
  const hasActive = section.items.some((item) => isActive(item, currentPath));
  const collapsed = section.collapsible && section.collapsed && !hasActive;
  const sectionId = `section-${section.title.toLowerCase().replace(/\s+/g, "-")}`;

  const itemsHTML = section.items
    .map((item) => buildNavItemHTML(item, currentPath))
    .join("\n");

  if (section.collapsible) {
    return `
<div class="sidebar-section${hasActive ? " sidebar-section--active" : ""}" data-section="${sectionId}">
  <button
    class="sidebar-section__toggle"
    aria-expanded="${!collapsed}"
    aria-controls="${sectionId}-items"
    data-toggle="${sectionId}"
  >
    <span class="sidebar-section__title">${escapeHTML(section.title)}</span>
    <span class="sidebar-section__chevron" aria-hidden="true"></span>
  </button>
  <ul id="${sectionId}-items" class="sidebar-section__items${collapsed ? " sidebar-section__items--collapsed" : ""}">
    ${itemsHTML}
  </ul>
</div>`.trim();
  }

  return `
<div class="sidebar-section${hasActive ? " sidebar-section--active" : ""}">
  <p class="sidebar-section__title">${escapeHTML(section.title)}</p>
  <ul class="sidebar-section__items">
    ${itemsHTML}
  </ul>
</div>`.trim();
}

function buildNavItemHTML(item: NavItem, currentPath: string): string {
  const active = isActive(item, currentPath);
  return `<li class="sidebar-item${active ? " sidebar-item--active" : ""}">
    <a href="${escapeHTML(item.path)}" class="sidebar-item__link${active ? " sidebar-item__link--active" : ""}"${active ? ' aria-current="page"' : ""}>${escapeHTML(item.title)}</a>
  </li>`;
}

function isActive(item: NavItem, currentPath: string): boolean {
  if (item.path === "/" && currentPath === "/") return true;
  if (item.path !== "/" && currentPath.startsWith(item.path)) return true;
  return false;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Attach toggle event listeners to all collapsible sidebar sections.
 * Call this after the sidebar HTML has been inserted into the DOM.
 */
export function initSidebarToggles(): void {
  const toggles = document.querySelectorAll<HTMLButtonElement>("[data-toggle]");
  toggles.forEach((btn) => {
    const sectionId = btn.dataset["toggle"];
    if (!sectionId) return;
    const items = document.getElementById(`${sectionId}-items`);
    if (!items) return;

    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      items.classList.toggle("sidebar-section__items--collapsed", expanded);
    });
  });
}
