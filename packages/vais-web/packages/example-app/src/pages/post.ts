/**
 * Single post page — shows post content, author info, and comments.
 */

import type { RouteContext } from "../types.js";
import { store } from "../data.js";
import { escapeHtml } from "../ssr/render.js";
import type { PageComponent } from "../ssr/render.js";
import { CommentForm } from "../components/comment-form.js";
import { Header } from "../components/header.js";
import type { Comment } from "../types.js";

// ── Post Page Labels ──────────────────────────────────────────────────────────

const postLabels: Record<string, Record<string, string>> = {
  en: {
    by: "By",
    in: "in",
    comments: "Comments",
    noComments: "Be the first to comment!",
    backToHome: "← Back to Home",
    publishedOn: "Published on",
  },
  ko: {
    by: "작성자:",
    in: "",
    comments: "댓글",
    noComments: "첫 번째 댓글을 남겨보세요!",
    backToHome: "← 홈으로 돌아가기",
    publishedOn: "작성일:",
  },
  ja: {
    by: "著者:",
    in: "",
    comments: "コメント",
    noComments: "最初のコメントを書いてください！",
    backToHome: "← ホームへ戻る",
    publishedOn: "投稿日:",
  },
};

function formatDate(date: Date, locale: string): string {
  try {
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date.toISOString().split("T")[0] ?? "";
  }
}

function renderComment(comment: Comment, locale: string): string {
  const date = formatDate(comment.createdAt, locale);
  return `<article class="comment" data-comment-id="${escapeHtml(comment.id)}">
  <header class="comment__header">
    <strong class="comment__author">${escapeHtml(comment.author)}</strong>
    <time class="comment__date" datetime="${comment.createdAt.toISOString()}">${escapeHtml(date)}</time>
  </header>
  <div class="comment__body">
    <p>${escapeHtml(comment.content)}</p>
  </div>
</article>`;
}

// ── Post Page Component ───────────────────────────────────────────────────────

export const PostPage: PageComponent = (context: RouteContext) => {
  const { locale, query } = context;
  const labels = postLabels[locale] ?? postLabels["en"]!;

  const postId = query["postId"] ?? "";
  const post = store.getPostById(postId);

  if (!post) {
    return {
      title: "Post Not Found",
      body: `<div class="error-page"><h1>Post Not Found</h1><p>The post you requested does not exist.</p><a href="/">${escapeHtml(labels["backToHome"]!)}</a></div>`,
      statusCode: 404,
    };
  }

  const formattedDate = formatDate(post.createdAt, locale);
  const comments = store.getCommentsByPost(postId);

  const commentsHtml =
    comments.length > 0
      ? comments.map((c) => renderComment(c, locale)).join("\n")
      : `<p class="no-comments">${escapeHtml(labels["noComments"]!)}</p>`;

  const commentForm = CommentForm({ postId, locale });
  const header = Header({ currentPath: `/posts/${postId}`, locale });

  const body = `${header}
<main class="post-page" id="main-content">
  <div class="container">
    <a href="/" class="back-link">${escapeHtml(labels["backToHome"]!)}</a>
    <article class="post" data-post-id="${escapeHtml(post.id)}">
      <header class="post__header">
        <div class="post__category">
          <a href="/category/${escapeHtml(post.category.slug)}">${escapeHtml(post.category.name)}</a>
        </div>
        <h1 class="post__title">${escapeHtml(post.title)}</h1>
        <div class="post__meta">
          <div class="post__author">
            <img
              src="${escapeHtml(post.author.avatar)}"
              alt="${escapeHtml(post.author.name)}"
              class="post__avatar"
              width="40"
              height="40"
            >
            <span>${escapeHtml(labels["by"]!)} <strong>${escapeHtml(post.author.name)}</strong></span>
          </div>
          <time class="post__date" datetime="${post.createdAt.toISOString()}">
            ${escapeHtml(labels["publishedOn"]!)} ${escapeHtml(formattedDate)}
          </time>
        </div>
      </header>
      <div class="post__content">
        ${post.content.split("\n").map((p) => p.trim() ? `<p>${escapeHtml(p)}</p>` : "").join("\n")}
      </div>
    </article>
    <section class="comments-section" aria-labelledby="comments-heading">
      <h2 id="comments-heading" class="section-heading">${escapeHtml(labels["comments"]!)} (${comments.length})</h2>
      <div class="comments-list">
        ${commentsHtml}
      </div>
      ${commentForm}
    </section>
  </div>
</main>`;

  return {
    title: `${post.title} | VaisX Blog`,
    body,
    meta: `<meta name="description" content="${escapeHtml(post.content.slice(0, 150))}">
    <meta property="og:title" content="${escapeHtml(post.title)}">
    <meta property="og:type" content="article">`,
  };
};
