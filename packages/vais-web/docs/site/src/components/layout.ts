import { buildSidebarHTML, SIDEBAR_CONFIG } from "../core/sidebar.js";

export interface LayoutOptions {
  title: string;
  description?: string;
  currentPath: string;
  content: string;
  showSidebar?: boolean;
}

export function renderLayout(opts: LayoutOptions): string {
  const { title, description, currentPath, content, showSidebar = true } = opts;

  const sidebarHTML = showSidebar
    ? buildSidebarHTML(SIDEBAR_CONFIG, currentPath)
    : "";

  const metaDescription = description
    ? `<meta name="description" content="${description}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${metaDescription}
  <title>${title}</title>
  <link rel="stylesheet" href="/src/styles/main.css" />
  <link rel="stylesheet" href="/src/styles/prism-theme.css" />
</head>
<body>
  <div class="app-shell">
    ${renderHeader()}
    <div class="app-body">
      ${showSidebar ? `<aside class="app-sidebar">${sidebarHTML}</aside>` : ""}
      <main class="app-content" id="main-content">
        <div class="content-wrapper">
          ${content}
        </div>
      </main>
    </div>
    ${renderFooter()}
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`;
}

function renderHeader(): string {
  return `<header class="app-header" role="banner">
  <div class="header-inner">
    <a href="/" class="header-logo" aria-label="VaisX home">
      <span class="logo-mark" aria-hidden="true">⬡</span>
      <span class="logo-text">VaisX</span>
      <span class="logo-badge">docs</span>
    </a>
    <nav class="header-nav" aria-label="Main navigation">
      <a href="/guide/" class="header-nav__link">Guide</a>
      <a href="/tutorial/" class="header-nav__link">Tutorial</a>
      <a href="/api/" class="header-nav__link">API</a>
    </nav>
    <div class="header-actions">
      <button
        id="theme-toggle"
        class="btn-icon"
        aria-label="Toggle color scheme"
        title="Toggle color scheme"
      >☾</button>
      <a
        href="https://github.com/vaislang/vais-web"
        class="btn-icon"
        aria-label="GitHub repository"
        target="_blank"
        rel="noopener noreferrer"
      >⌥</a>
    </div>
  </div>
</header>`;
}

function renderFooter(): string {
  return `<footer class="app-footer" role="contentinfo">
  <div class="footer-inner">
    <p class="footer-copy">
      &copy; ${new Date().getFullYear()} VaisX contributors &mdash; MIT License
    </p>
    <nav class="footer-nav" aria-label="Footer navigation">
      <a href="/guide/">Guide</a>
      <a href="/tutorial/">Tutorial</a>
      <a href="/api/">API</a>
      <a href="https://github.com/vaislang/vais-web" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
  </div>
</footer>`;
}
