/**
 * Pagination component.
 * Renders accessible page navigation for lists of posts.
 */

import { escapeHtml } from "../ssr/render.js";

// ── Pagination Component ──────────────────────────────────────────────────────

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  locale?: string;
  maxVisible?: number;
}

const paginationLabels: Record<string, Record<string, string>> = {
  en: { previous: "Previous", next: "Next", page: "Page", of: "of" },
  ko: { previous: "이전", next: "다음", page: "페이지", of: "/ 총" },
  ja: { previous: "前へ", next: "次へ", page: "ページ", of: "/ 全" },
};

/**
 * Build the URL for a given page number.
 */
function pageUrl(basePath: string, page: number): string {
  if (page === 1) return basePath;
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}page=${page}`;
}

/**
 * Generate the range of page numbers to display.
 */
function getPageRange(current: number, total: number, maxVisible: number): number[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Pagination component — renders accessible page navigation.
 */
export function Pagination(props: PaginationProps): string {
  const { currentPage, totalPages, basePath, locale = "en", maxVisible = 5 } = props;

  if (totalPages <= 1) return "";

  const labels = paginationLabels[locale] ?? paginationLabels["en"]!;
  const pageRange = getPageRange(currentPage, totalPages, maxVisible);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const prevButton = hasPrev
    ? `<a
        href="${escapeHtml(pageUrl(basePath, currentPage - 1))}"
        class="pagination__btn pagination__btn--prev"
        rel="prev"
        aria-label="${escapeHtml(labels["previous"]!)}"
      >${escapeHtml(labels["previous"]!)}</a>`
    : `<span class="pagination__btn pagination__btn--prev pagination__btn--disabled" aria-disabled="true">${escapeHtml(labels["previous"]!)}</span>`;

  const nextButton = hasNext
    ? `<a
        href="${escapeHtml(pageUrl(basePath, currentPage + 1))}"
        class="pagination__btn pagination__btn--next"
        rel="next"
        aria-label="${escapeHtml(labels["next"]!)}"
      >${escapeHtml(labels["next"]!)}</a>`
    : `<span class="pagination__btn pagination__btn--next pagination__btn--disabled" aria-disabled="true">${escapeHtml(labels["next"]!)}</span>`;

  const pageButtons = pageRange
    .map((page) => {
      if (page === currentPage) {
        return `<span
          class="pagination__page pagination__page--current"
          aria-current="page"
          aria-label="${escapeHtml(labels["page"]!)} ${page}"
        >${page}</span>`;
      }
      return `<a
          href="${escapeHtml(pageUrl(basePath, page))}"
          class="pagination__page"
          aria-label="${escapeHtml(labels["page"]!)} ${page}"
        >${page}</a>`;
    })
    .join("\n    ");

  // Add ellipsis markers
  const firstPage = pageRange[0] ?? 1;
  const lastPage = pageRange[pageRange.length - 1] ?? totalPages;

  const leadingEllipsis =
    firstPage > 2
      ? `<a href="${escapeHtml(pageUrl(basePath, 1))}" class="pagination__page" aria-label="${escapeHtml(labels["page"]!)} 1">1</a>
    <span class="pagination__ellipsis" aria-hidden="true">…</span>`
      : firstPage === 2
        ? `<a href="${escapeHtml(pageUrl(basePath, 1))}" class="pagination__page" aria-label="${escapeHtml(labels["page"]!)} 1">1</a>`
        : "";

  const trailingEllipsis =
    lastPage < totalPages - 1
      ? `<span class="pagination__ellipsis" aria-hidden="true">…</span>
    <a href="${escapeHtml(pageUrl(basePath, totalPages))}" class="pagination__page" aria-label="${escapeHtml(labels["page"]!)} ${totalPages}">${totalPages}</a>`
      : lastPage === totalPages - 1
        ? `<a href="${escapeHtml(pageUrl(basePath, totalPages))}" class="pagination__page" aria-label="${escapeHtml(labels["page"]!)} ${totalPages}">${totalPages}</a>`
        : "";

  return `<nav class="pagination" role="navigation" aria-label="Page navigation">
  <div class="pagination__inner">
    ${prevButton}
    <div class="pagination__pages">
      ${leadingEllipsis}
      ${pageButtons}
      ${trailingEllipsis}
    </div>
    ${nextButton}
  </div>
  <p class="pagination__summary" aria-live="polite">
    ${escapeHtml(labels["page"]!)} ${currentPage} ${escapeHtml(labels["of"]!)} ${totalPages}
  </p>
</nav>`;
}
