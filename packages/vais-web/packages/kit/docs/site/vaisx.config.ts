import type { VaisXConfig } from "@vaisx/kit";

const config: VaisXConfig = {
  // Application root directory
  appDir: "app",

  // Static content directory (markdown files, etc.)
  contentDir: "content",

  // Output directory for production builds
  outDir: ".vaisx/output",

  // Rendering strategy per route pattern
  rendering: {
    // Static site generation for all doc pages
    "/docs/[slug]": "ssg",
    // All other routes use SSR by default
    "*": "ssr",
  },

  // Markdown processing options
  markdown: {
    // Enable syntax highlighting in code blocks
    highlight: true,
    // Automatically generate heading anchors
    headingAnchors: true,
  },

  // Compiler options
  compiler: {
    // Minify output in production
    minify: true,
    // Generate source maps
    sourceMaps: true,
    // Target environments
    target: ["es2020"],
  },
};

export default config;
