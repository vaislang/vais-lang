/**
 * Post preview card component.
 * Renders a blog post summary suitable for listing pages.
 */

import type { Post } from "../types.js";
import { escapeHtml } from "../ssr/render.js";

// ── Post Card Component ───────────────────────────────────────────────────────

export interface PostCardProps {
  post: Post;
  locale?: string;
  showExcerpt?: boolean;
  excerptLength?: number;
}

/**
 * Generate a plain-text excerpt from HTML/Markdown content.
 */
function generateExcerpt(content: string, maxLength: number): string {
  // Strip any HTML tags for plain text excerpt
  const plainText = content.replace(/<[^>]+>/g, "").trim();
  if (plainText.length <= maxLength) return plainText;
  return plainText.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
}

/**
 * Format a date for display.
 */
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

/**
 * Post card component — renders a preview card for a blog post.
 */
export function PostCard(props: PostCardProps): string {
  const { post, locale = "en", showExcerpt = true, excerptLength = 160 } = props;

  const formattedDate = formatDate(post.createdAt, locale);
  const excerpt = showExcerpt ? generateExcerpt(post.content, excerptLength) : "";
  const commentCount = post.comments.length;

  const excerptHtml = excerpt
    ? `<p class="post-card__excerpt">${escapeHtml(excerpt)}</p>`
    : "";

  const commentBadge =
    commentCount > 0
      ? `<span class="post-card__comments" aria-label="${commentCount} comments">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M1 2h14v9H8l-4 3v-3H1V2z"/></svg>
          ${commentCount}
        </span>`
      : "";

  return `<article class="post-card" data-post-id="${escapeHtml(post.id)}">
  <header class="post-card__header">
    <a href="/posts/${escapeHtml(post.id)}" class="post-card__title-link">
      <h2 class="post-card__title">${escapeHtml(post.title)}</h2>
    </a>
    <div class="post-card__meta">
      <span class="post-card__category">
        <a href="/category/${escapeHtml(post.category.slug)}">${escapeHtml(post.category.name)}</a>
      </span>
      <span class="post-card__separator" aria-hidden="true">·</span>
      <time class="post-card__date" datetime="${post.createdAt.toISOString()}">${escapeHtml(formattedDate)}</time>
    </div>
  </header>
  ${excerptHtml}
  <footer class="post-card__footer">
    <div class="post-card__author">
      <img
        src="${escapeHtml(post.author.avatar)}"
        alt="${escapeHtml(post.author.name)}"
        class="post-card__avatar"
        width="32"
        height="32"
        loading="lazy"
      >
      <span class="post-card__author-name">${escapeHtml(post.author.name)}</span>
    </div>
    <div class="post-card__stats">
      ${commentBadge}
      <a href="/posts/${escapeHtml(post.id)}" class="post-card__read-more">Read more →</a>
    </div>
  </footer>
</article>`;
}
