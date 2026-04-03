/**
 * Injected into section pages (guide, tutorial, api).
 * Renders the sidebar into #sidebar-root with the current path highlighted.
 */
import { buildSidebarHTML, SIDEBAR_CONFIG, initSidebarToggles } from "../core/sidebar.js";

function initSectionPage(): void {
  const sidebarRoot = document.getElementById("sidebar-root");
  if (!sidebarRoot) return;

  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  sidebarRoot.innerHTML = buildSidebarHTML(SIDEBAR_CONFIG, currentPath);

  // Re-run sidebar toggle init after injecting HTML
  initSidebarToggles();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSectionPage);
} else {
  initSectionPage();
}
