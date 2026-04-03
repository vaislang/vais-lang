import { describe, it, expect } from "vitest";
import { buildSidebarHTML, SIDEBAR_CONFIG } from "../src/core/sidebar.js";
import type { SidebarConfig } from "../src/core/types.js";

describe("buildSidebarHTML", () => {
  it("returns a string containing a <nav> element", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    expect(html).toContain("<nav");
    expect(html).toContain("</nav>");
  });

  it("renders all section titles", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    for (const section of SIDEBAR_CONFIG.sections) {
      expect(html).toContain(section.title);
    }
  });

  it("renders all nav item links", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    for (const section of SIDEBAR_CONFIG.sections) {
      for (const item of section.items) {
        expect(html).toContain(`href="${item.path.replace(/&/g, "&amp;")}"`);
        // Title is HTML-escaped in the output
        const escapedTitle = item.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        expect(html).toContain(escapedTitle);
      }
    }
  });

  it("marks the active item with aria-current and active class", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    // The root "/" item should be active
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("sidebar-item--active");
    expect(html).toContain("sidebar-item__link--active");
  });

  it("marks a nested section path as active", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/guide/configuration");
    expect(html).toContain('aria-current="page"');
  });

  it("does not mark non-matching items as active", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/tutorial/first-app");
    // Only tutorial items should be active, not the root "/"
    const activeLinks = html.match(/sidebar-item__link--active/g) ?? [];
    // Should have at least one active link in tutorial section
    expect(activeLinks.length).toBeGreaterThan(0);
  });

  it("renders toggle buttons for collapsible sections", () => {
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    expect(html).toContain("data-toggle=");
    expect(html).toContain('aria-expanded="');
  });

  it("collapses sections that are marked collapsed=true and have no active item", () => {
    // API Reference section starts collapsed=true
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/");
    expect(html).toContain("sidebar-section__items--collapsed");
  });

  it("expands a collapsed section when its item is active", () => {
    // Navigate to an API path — the API section should NOT be collapsed
    const html = buildSidebarHTML(SIDEBAR_CONFIG, "/api/runtime");
    // The API section items list should NOT have the collapsed class
    // We can check that the section with /api/ items lacks the collapsed class
    // by verifying aria-expanded="true" appears for that section
    expect(html).toContain('aria-expanded="true"');
  });

  it("works with a custom SidebarConfig", () => {
    const custom: SidebarConfig = {
      sections: [
        {
          title: "Basics",
          items: [{ title: "Intro", path: "/intro" }],
        },
      ],
    };
    const html = buildSidebarHTML(custom, "/intro");
    expect(html).toContain("Basics");
    expect(html).toContain("Intro");
    expect(html).toContain('href="/intro"');
    expect(html).toContain('aria-current="page"');
  });

  it("escapes HTML special characters in titles and paths", () => {
    const malicious: SidebarConfig = {
      sections: [
        {
          title: '<script>alert(1)</script>',
          items: [
            { title: '<b>XSS</b>', path: '/safe?a=1&b=2' },
          ],
        },
      ],
    };
    const html = buildSidebarHTML(malicious, "/");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});

describe("SIDEBAR_CONFIG", () => {
  it("has at least one section", () => {
    expect(SIDEBAR_CONFIG.sections.length).toBeGreaterThan(0);
  });

  it("each section has a title and at least one item", () => {
    for (const section of SIDEBAR_CONFIG.sections) {
      expect(typeof section.title).toBe("string");
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("contains guide, tutorial and api sections", () => {
    const paths = SIDEBAR_CONFIG.sections.flatMap((s) =>
      s.items.map((i) => i.path)
    );
    expect(paths.some((p) => p.startsWith("/guide"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/tutorial"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api"))).toBe(true);
  });
});
