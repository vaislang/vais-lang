/**
 * i18n tests — multi-language content rendering.
 */

import { describe, it, expect } from "vitest";
import { renderPage } from "../src/ssr/render.js";
import { HomePage } from "../src/pages/home.js";
import { AboutPage } from "../src/pages/about.js";
import { CreatePostPage } from "../src/pages/create-post.js";
import { PostPage } from "../src/pages/post.js";
import { Header } from "../src/components/header.js";
import { CommentForm } from "../src/components/comment-form.js";
import { Pagination } from "../src/components/pagination.js";
import type { RouteContext } from "../src/types.js";

// ── Locale helpers ─────────────────────────────────────────────────────────────

function ctx(locale: string, query: Record<string, string> = {}): RouteContext {
  return { locale, query };
}

// ── lang attribute ─────────────────────────────────────────────────────────────

describe("lang attribute in rendered HTML", () => {
  it("sets lang=en for English", () => {
    const result = renderPage(HomePage, ctx("en"));
    expect(result.html).toContain('lang="en"');
  });

  it("sets lang=ko for Korean", () => {
    const result = renderPage(HomePage, ctx("ko"));
    expect(result.html).toContain('lang="ko"');
  });

  it("sets lang=ja for Japanese", () => {
    const result = renderPage(HomePage, ctx("ja"));
    expect(result.html).toContain('lang="ja"');
  });
});

// ── Home page i18n ─────────────────────────────────────────────────────────────

describe("Home page i18n", () => {
  it("English home page heading", () => {
    const result = renderPage(HomePage, ctx("en"));
    expect(result.html).toContain("Latest Posts");
  });

  it("Korean home page heading", () => {
    const result = renderPage(HomePage, ctx("ko"));
    expect(result.html).toContain("최근 게시물");
  });

  it("Japanese home page heading", () => {
    const result = renderPage(HomePage, ctx("ja"));
    expect(result.html).toContain("最新の投稿");
  });

  it("Korean home page title in <head>", () => {
    const result = renderPage(HomePage, ctx("ko"));
    expect(result.html).toContain("VaisX 블로그");
  });

  it("Japanese home page title in <head>", () => {
    const result = renderPage(HomePage, ctx("ja"));
    expect(result.html).toContain("VaisX ブログ");
  });
});

// ── About page i18n ───────────────────────────────────────────────────────────

describe("About page i18n", () => {
  it("English about page heading", () => {
    const result = renderPage(AboutPage, ctx("en"));
    expect(result.html).toContain("About Us");
  });

  it("Korean about page heading", () => {
    const result = renderPage(AboutPage, ctx("ko"));
    expect(result.html).toContain("소개");
  });

  it("Japanese about page heading", () => {
    const result = renderPage(AboutPage, ctx("ja"));
    expect(result.html).toContain("私たちについて");
  });

  it("Korean about mission section", () => {
    const result = renderPage(AboutPage, ctx("ko"));
    expect(result.html).toContain("미션");
  });

  it("Japanese about mission section", () => {
    const result = renderPage(AboutPage, ctx("ja"));
    expect(result.html).toContain("ミッション");
  });
});

// ── Create Post page i18n ─────────────────────────────────────────────────────

describe("Create Post page i18n", () => {
  it("English create post title", () => {
    const result = renderPage(CreatePostPage, ctx("en"));
    expect(result.html).toContain("Write a New Post");
  });

  it("Korean create post title", () => {
    const result = renderPage(CreatePostPage, ctx("ko"));
    expect(result.html).toContain("새 게시물 작성");
  });

  it("Japanese create post submit button", () => {
    const result = renderPage(CreatePostPage, ctx("ja"));
    expect(result.html).toContain("投稿を公開");
  });
});

// ── Post page i18n ────────────────────────────────────────────────────────────

describe("Post page i18n", () => {
  it("English post page 'Published on' label", () => {
    const result = renderPage(PostPage, ctx("en", { postId: "post-1" }));
    expect(result.html).toContain("Published on");
  });

  it("Korean post page comment label", () => {
    const result = renderPage(PostPage, ctx("ko", { postId: "post-1" }));
    expect(result.html).toContain("댓글");
  });

  it("Japanese post page back link", () => {
    const result = renderPage(PostPage, ctx("ja", { postId: "post-1" }));
    expect(result.html).toContain("ホームへ戻る");
  });
});

// ── Header component i18n ─────────────────────────────────────────────────────

describe("Header component i18n", () => {
  it("renders English nav labels", () => {
    const html = Header({ currentPath: "/", locale: "en" });
    expect(html).toContain("Home");
    expect(html).toContain("About");
    expect(html).toContain("Write a Post");
  });

  it("renders Korean nav labels", () => {
    const html = Header({ currentPath: "/", locale: "ko" });
    expect(html).toContain("홈");
    expect(html).toContain("소개");
    expect(html).toContain("글 작성");
  });

  it("renders Japanese nav labels", () => {
    const html = Header({ currentPath: "/", locale: "ja" });
    expect(html).toContain("ホーム");
    expect(html).toContain("について");
    expect(html).toContain("投稿を書く");
  });

  it("renders language switcher with all locales", () => {
    const html = Header({ currentPath: "/", locale: "en" });
    expect(html).toContain("English");
    expect(html).toContain("한국어");
    expect(html).toContain("日本語");
  });

  it("marks current locale as selected in switcher", () => {
    const html = Header({ currentPath: "/", locale: "ko" });
    // The ko option should have selected attribute
    expect(html).toContain('value="ko" selected');
  });

  it("marks active nav link with aria-current=page", () => {
    const html = Header({ currentPath: "/about", locale: "en" });
    expect(html).toContain('aria-current="page"');
  });
});

// ── CommentForm i18n ──────────────────────────────────────────────────────────

describe("CommentForm i18n", () => {
  it("renders English labels", () => {
    const html = CommentForm({ postId: "post-1", locale: "en" });
    expect(html).toContain("Leave a Comment");
    expect(html).toContain("Your Name");
  });

  it("renders Korean labels", () => {
    const html = CommentForm({ postId: "post-1", locale: "ko" });
    expect(html).toContain("댓글 작성");
    expect(html).toContain("이름");
  });

  it("renders Japanese labels", () => {
    const html = CommentForm({ postId: "post-1", locale: "ja" });
    expect(html).toContain("コメントを書く");
    expect(html).toContain("お名前");
  });

  it("renders Japanese submit button", () => {
    const html = CommentForm({ postId: "post-1", locale: "ja" });
    expect(html).toContain("コメントを投稿");
  });
});

// ── Pagination i18n ───────────────────────────────────────────────────────────

describe("Pagination i18n", () => {
  const paginationProps = { currentPage: 2, totalPages: 5, basePath: "/" };

  it("renders English prev/next labels", () => {
    const html = Pagination({ ...paginationProps, locale: "en" });
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });

  it("renders Korean prev/next labels", () => {
    const html = Pagination({ ...paginationProps, locale: "ko" });
    expect(html).toContain("이전");
    expect(html).toContain("다음");
  });

  it("renders Japanese prev/next labels", () => {
    const html = Pagination({ ...paginationProps, locale: "ja" });
    expect(html).toContain("前へ");
    expect(html).toContain("次へ");
  });

  it("returns empty string when there is only one page", () => {
    const html = Pagination({ currentPage: 1, totalPages: 1, basePath: "/", locale: "en" });
    expect(html).toBe("");
  });
});

// ── Fallback locale ───────────────────────────────────────────────────────────

describe("Fallback for unknown locale", () => {
  it("falls back to English for unknown locale in Header", () => {
    const html = Header({ currentPath: "/", locale: "fr" });
    // Should fall back to English labels
    expect(html).toContain("Home");
  });

  it("falls back to English for unknown locale in About page", () => {
    const result = renderPage(AboutPage, ctx("fr"));
    expect(result.html).toContain("About Us");
  });
});
