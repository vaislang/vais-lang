/**
 * Navigation header component with i18n language switcher.
 * Simulates a VaisX component using pure TypeScript template functions.
 */

import type { Locale, I18nInstance } from "../types.js";
import { escapeHtml } from "../ssr/render.js";

// ── Header Component ──────────────────────────────────────────────────────────

export interface HeaderProps {
  currentPath: string;
  locale: string;
  i18n?: I18nInstance;
}

const navLabels: Record<string, Record<string, string>> = {
  en: { home: "Home", about: "About", createPost: "Write a Post" },
  ko: { home: "홈", about: "소개", createPost: "글 작성" },
  ja: { home: "ホーム", about: "について", createPost: "投稿を書く" },
};

const supportedLocales: Locale[] = ["en", "ko", "ja"];
const localeLabels: Record<string, string> = { en: "English", ko: "한국어", ja: "日本語" };

/**
 * Render the language switcher dropdown.
 */
function renderLanguageSwitcher(currentPath: string, currentLocale: string): string {
  const options = supportedLocales
    .map(
      (locale) =>
        `<option value="${locale}" ${locale === currentLocale ? "selected" : ""}>${localeLabels[locale]}</option>`,
    )
    .join("\n        ");

  return `<div class="language-switcher">
      <label for="locale-select" class="sr-only">Language</label>
      <select id="locale-select" name="locale" aria-label="Select language" data-island="locale-switcher" data-path="${escapeHtml(currentPath)}">
        ${options}
      </select>
    </div>`;
}

/**
 * Render a navigation link.
 */
function renderNavLink(href: string, label: string, currentPath: string): string {
  const isActive = currentPath === href || (href !== "/" && currentPath.startsWith(href));
  const className = isActive ? "nav-link nav-link--active" : "nav-link";
  return `<a href="${escapeHtml(href)}" class="${className}" ${isActive ? 'aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
}

/**
 * Header component — renders site navigation and locale switcher.
 */
export function Header(props: HeaderProps): string {
  const { currentPath, locale } = props;
  const labels = navLabels[locale] ?? navLabels["en"]!;

  const navLinks = [
    renderNavLink("/", labels["home"] ?? "Home", currentPath),
    renderNavLink("/about", labels["about"] ?? "About", currentPath),
    renderNavLink("/posts/create", labels["createPost"] ?? "Write a Post", currentPath),
  ].join("\n      ");

  const languageSwitcher = renderLanguageSwitcher(currentPath, locale);

  return `<header class="site-header" role="banner">
  <div class="header-inner">
    <a href="/" class="site-logo" aria-label="VaisX Blog — Home">
      <span class="logo-text">VaisX Blog</span>
    </a>
    <nav class="site-nav" role="navigation" aria-label="Main navigation">
      ${navLinks}
    </nav>
    ${languageSwitcher}
  </div>
</header>`;
}
