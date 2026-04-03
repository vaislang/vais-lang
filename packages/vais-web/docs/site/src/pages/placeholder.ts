export type Section = "guide" | "tutorial" | "api";

interface PlaceholderConfig {
  icon: string;
  title: string;
  description: string;
  badge: string;
}

const CONFIGS: Record<Section, PlaceholderConfig> = {
  guide: {
    icon: "📖",
    title: "Guide",
    description:
      "In-depth guides covering configuration, components, routing, SSR/SSG and more are on their way.",
    badge: "Coming soon",
  },
  tutorial: {
    icon: "🎓",
    title: "Tutorial",
    description:
      "Step-by-step tutorials — from scaffolding your first app to advanced patterns — will be published here.",
    badge: "Coming soon",
  },
  api: {
    icon: "📚",
    title: "API Reference",
    description:
      "Full auto-generated API documentation for every VaisX package will be available here.",
    badge: "Coming soon",
  },
};

export function renderPlaceholderPage(section: Section): string {
  const cfg = CONFIGS[section];
  return `
<div class="placeholder">
  <div class="placeholder__icon" aria-hidden="true">${cfg.icon}</div>
  <h1 class="placeholder__title">${cfg.title}</h1>
  <p class="placeholder__desc">${cfg.description}</p>
  <span class="placeholder__badge">${cfg.badge}</span>
  <p style="margin-top:1.5rem">
    <a href="/" class="btn btn-secondary">← Back to home</a>
  </p>
</div>
`.trim();
}
