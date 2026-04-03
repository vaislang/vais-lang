/**
 * Home page — lists recent posts with pagination.
 */

import type { RouteContext } from "../types.js";
import { store } from "../data.js";
import { escapeHtml } from "../ssr/render.js";
import type { PageComponent } from "../ssr/render.js";
import { PostCard } from "../components/post-card.js";
import { Pagination } from "../components/pagination.js";
import { Header } from "../components/header.js";

// ── Home Page Labels ──────────────────────────────────────────────────────────

const homeLabels: Record<string, Record<string, string>> = {
  en: {
    title: "VaisX Blog",
    heading: "Latest Posts",
    description: "Insights on web development, framework design, and modern tooling.",
    noPosts: "No posts found.",
    categories: "Categories",
  },
  ko: {
    title: "VaisX 블로그",
    heading: "최근 게시물",
    description: "웹 개발, 프레임워크 설계, 최신 도구에 대한 인사이트.",
    noPosts: "게시물이 없습니다.",
    categories: "카테고리",
  },
  ja: {
    title: "VaisX ブログ",
    heading: "最新の投稿",
    description: "Web開発、フレームワーク設計、最新のツールに関する洞察。",
    noPosts: "投稿が見つかりません。",
    categories: "カテゴリー",
  },
};

const PAGE_SIZE = 3;

// ── Home Page Component ───────────────────────────────────────────────────────

export const HomePage: PageComponent = (context: RouteContext) => {
  const { locale, query } = context;
  const labels = homeLabels[locale] ?? homeLabels["en"]!;

  const page = Math.max(1, parseInt(query["page"] ?? "1", 10));
  const categorySlug = query["category"];

  // Fetch posts
  let allPosts = store.getAllPosts();
  if (categorySlug) {
    const category = store.getCategoryBySlug(categorySlug);
    if (category) {
      allPosts = store.getPostsByCategory(category.id);
    }
  }

  const total = allPosts.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const posts = allPosts.slice(start, start + PAGE_SIZE);

  // Render post cards
  const postCardsHtml =
    posts.length > 0
      ? posts.map((post) => PostCard({ post, locale, showExcerpt: true })).join("\n")
      : `<p class="no-posts">${escapeHtml(labels["noPosts"]!)}</p>`;

  // Render categories sidebar
  const categories = store.getAllCategories();
  const categoryLinksHtml = categories
    .map(
      (cat) =>
        `<li><a href="/?category=${escapeHtml(cat.slug)}" class="${categorySlug === cat.slug ? "active" : ""}">${escapeHtml(cat.name)}</a></li>`,
    )
    .join("\n      ");

  const paginationHtml = Pagination({
    currentPage: page,
    totalPages,
    basePath: categorySlug ? `/?category=${categorySlug}` : "/",
    locale,
  });

  const header = Header({ currentPath: "/", locale });

  const body = `${header}
<main class="home-page" id="main-content">
  <div class="container">
    <div class="page-layout">
      <section class="posts-section" aria-labelledby="posts-heading">
        <h1 id="posts-heading" class="page-heading">${escapeHtml(labels["heading"]!)}</h1>
        <p class="page-description">${escapeHtml(labels["description"]!)}</p>
        <div class="posts-list">
          ${postCardsHtml}
        </div>
        ${paginationHtml}
      </section>
      <aside class="sidebar">
        <section class="sidebar-section" aria-labelledby="categories-heading">
          <h2 id="categories-heading" class="sidebar-heading">${escapeHtml(labels["categories"]!)}</h2>
          <ul class="category-list">
            <li><a href="/" class="${!categorySlug ? "active" : ""}">All</a></li>
            ${categoryLinksHtml}
          </ul>
        </section>
      </aside>
    </div>
  </div>
</main>`;

  return {
    title: labels["title"]!,
    body,
    meta: `<meta name="description" content="${escapeHtml(labels["description"]!)}">`,
  };
};
