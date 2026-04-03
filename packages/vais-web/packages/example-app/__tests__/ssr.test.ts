/**
 * SSR render tests — validates that page components produce valid HTML output.
 */

import { describe, it, expect } from "vitest";
import { renderPage, render404, escapeHtml, renderDocument, batchRender } from "../src/ssr/render.js";
import { HomePage } from "../src/pages/home.js";
import { PostPage } from "../src/pages/post.js";
import { CreatePostPage } from "../src/pages/create-post.js";
import { AboutPage } from "../src/pages/about.js";
import type { RouteContext } from "../src/types.js";

const enCtx: RouteContext = { locale: "en", query: {} };
const koCtx: RouteContext = { locale: "ko", query: {} };

// ── renderPage ─────────────────────────────────────────────────────────────────

describe("renderPage — RenderResult structure", () => {
  it("returns html, head, statusCode, and headers", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html).toBeTruthy();
    expect(result.head).toBeTruthy();
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toContain("text/html");
  });

  it("html starts with <!DOCTYPE html>", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("html contains <html lang> attribute matching locale", () => {
    const enResult = renderPage(HomePage, enCtx);
    expect(enResult.html).toContain('lang="en"');

    const koResult = renderPage(HomePage, koCtx);
    expect(koResult.html).toContain('lang="ko"');
  });

  it("html contains the SSR marker script", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html).toContain("__VAISX_SSR__");
  });

  it("head contains <title>", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.head).toContain("<title>");
  });

  it("headers include X-Render-Time", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.headers["X-Render-Time"]).toBeTruthy();
  });

  it("headers include security headers", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(result.headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});

// ── Home Page SSR ──────────────────────────────────────────────────────────────

describe("Home Page SSR", () => {
  it("renders post cards", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html).toContain("post-card");
  });

  it("renders navigation header", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html).toContain("site-header");
    expect(result.html).toContain("site-nav");
  });

  it("renders categories sidebar", () => {
    const result = renderPage(HomePage, enCtx);
    expect(result.html).toContain("category-list");
  });

  it("renders pagination when posts exceed page size", () => {
    const result = renderPage(HomePage, enCtx);
    // 5 seed posts, page size 3, so pagination should appear
    expect(result.html).toContain("pagination");
  });

  it("Korean locale renders Korean labels", () => {
    const result = renderPage(HomePage, koCtx);
    expect(result.html).toContain("최근 게시물");
  });

  it("page 2 query renders second page", () => {
    const result = renderPage(HomePage, { locale: "en", query: { page: "2" } });
    expect(result.html).toContain("pagination");
    expect(result.statusCode).toBe(200);
  });
});

// ── Post Page SSR ──────────────────────────────────────────────────────────────

describe("Post Page SSR", () => {
  it("renders post content when postId is valid", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("Getting Started with VaisX");
    expect(result.html).toContain("post__title");
  });

  it("renders author information", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.html).toContain("Alice Kim");
  });

  it("renders comment section", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.html).toContain("comments-section");
  });

  it("renders the comment form", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.html).toContain("comment-form");
    expect(result.html).toContain('name="author"');
    expect(result.html).toContain('name="content"');
  });

  it("returns 404 for unknown postId", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "ghost" } });
    expect(result.statusCode).toBe(404);
    expect(result.html).toContain("Post Not Found");
  });

  it("returns 404 when postId missing", () => {
    const result = renderPage(PostPage, { locale: "en", query: {} });
    expect(result.statusCode).toBe(404);
  });

  it("title includes post title", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.html).toContain("Getting Started with VaisX");
  });

  it("renders OG meta tags", () => {
    const result = renderPage(PostPage, { locale: "en", query: { postId: "post-1" } });
    expect(result.html).toContain('property="og:title"');
  });
});

// ── Create Post Page SSR ───────────────────────────────────────────────────────

describe("Create Post Page SSR", () => {
  it("renders the create post form", () => {
    const result = renderPage(CreatePostPage, enCtx);
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('name="title"');
    expect(result.html).toContain('name="content"');
    expect(result.html).toContain('name="categoryId"');
    expect(result.html).toContain('name="authorId"');
  });

  it("renders category options from data store", () => {
    const result = renderPage(CreatePostPage, enCtx);
    expect(result.html).toContain("Technology");
    expect(result.html).toContain("Design");
    expect(result.html).toContain("Business");
  });

  it("renders author options from data store", () => {
    const result = renderPage(CreatePostPage, enCtx);
    expect(result.html).toContain("Alice Kim");
    expect(result.html).toContain("Bob Park");
  });
});

// ── About Page SSR ─────────────────────────────────────────────────────────────

describe("About Page SSR", () => {
  it("renders the about page", () => {
    const result = renderPage(AboutPage, enCtx);
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("About Us");
  });

  it("renders team members", () => {
    const result = renderPage(AboutPage, enCtx);
    expect(result.html).toContain("Alice Kim");
    expect(result.html).toContain("Bob Park");
    expect(result.html).toContain("Carol Lee");
  });

  it("Korean about page shows Korean content", () => {
    const result = renderPage(AboutPage, koCtx);
    expect(result.html).toContain("소개");
    expect(result.html).toContain("미션");
  });
});

// ── 404 Page ───────────────────────────────────────────────────────────────────

describe("render404", () => {
  it("returns statusCode 404", () => {
    const result = render404(enCtx);
    expect(result.statusCode).toBe(404);
  });

  it("html contains 404 message", () => {
    const result = render404(enCtx);
    expect(result.html).toContain("404");
  });
});

// ── Utility functions ──────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });
  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });
  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });
  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});

describe("renderDocument", () => {
  it("produces a valid HTML document structure", () => {
    const html = renderDocument({ title: "Test", body: "<p>Hello</p>" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it("includes the title", () => {
    const html = renderDocument({ title: "My Page", body: "" });
    expect(html).toContain("<title>My Page</title>");
  });

  it("sets the lang attribute from locale option", () => {
    const html = renderDocument({ title: "T", body: "", locale: "ja" });
    expect(html).toContain('lang="ja"');
  });
});

// ── Batch render ───────────────────────────────────────────────────────────────

describe("batchRender", () => {
  it("renders multiple pages and returns all results", () => {
    const results = batchRender([
      { component: HomePage, context: enCtx },
      { component: AboutPage, context: enCtx },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.statusCode).toBe(200);
    expect(results[1]!.statusCode).toBe(200);
  });
});
