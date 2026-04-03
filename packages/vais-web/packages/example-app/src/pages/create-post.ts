/**
 * Create post page — form for creating new blog posts.
 * Demonstrates @vaisx/forms patterns simulated in pure TypeScript.
 */

import type { RouteContext } from "../types.js";
import { store } from "../data.js";
import { escapeHtml } from "../ssr/render.js";
import type { PageComponent } from "../ssr/render.js";
import { Header } from "../components/header.js";
import type { ValidationRule } from "../types.js";

// ── Create Post Form Types ────────────────────────────────────────────────────

export interface CreatePostValues {
  title: string;
  content: string;
  categoryId: string;
  authorId: string;
}

// ── Validation (simulating @vaisx/forms validation rules) ────────────────────

const required = (message = "This field is required"): ValidationRule => ({
  validate: (v) => v !== null && v !== undefined && String(v).trim().length > 0,
  message,
});

const minLength = (min: number, message?: string): ValidationRule => ({
  validate: (v) => String(v ?? "").length >= min,
  message: message ?? `Must be at least ${min} characters`,
});

const maxLength = (max: number, message?: string): ValidationRule => ({
  validate: (v) => String(v ?? "").length <= max,
  message: message ?? `Must be at most ${max} characters`,
});

export const createPostValidation: Record<keyof CreatePostValues, ValidationRule[]> = {
  title: [required("Title is required"), minLength(3, "Title must be at least 3 characters"), maxLength(200)],
  content: [required("Content is required"), minLength(20, "Content must be at least 20 characters")],
  categoryId: [required("Please select a category")],
  authorId: [required("Please select an author")],
};

/**
 * Validate create-post form values.
 */
export function validateCreatePost(
  values: Partial<CreatePostValues>,
): Partial<Record<keyof CreatePostValues, string>> {
  const errors: Partial<Record<keyof CreatePostValues, string>> = {};

  for (const [field, rules] of Object.entries(createPostValidation) as [
    keyof CreatePostValues,
    ValidationRule[],
  ][]) {
    for (const rule of rules) {
      if (!rule.validate(values[field])) {
        errors[field] = rule.message;
        break;
      }
    }
  }

  return errors;
}

// ── Create Post Page Labels ───────────────────────────────────────────────────

const createPostLabels: Record<string, Record<string, string>> = {
  en: {
    title: "Write a New Post",
    titleLabel: "Post Title",
    titlePlaceholder: "Enter a compelling title…",
    contentLabel: "Content",
    contentPlaceholder: "Write your post here…",
    categoryLabel: "Category",
    authorLabel: "Author",
    submitLabel: "Publish Post",
    cancelLabel: "Cancel",
    selectCategory: "— Select category —",
    selectAuthor: "— Select author —",
  },
  ko: {
    title: "새 게시물 작성",
    titleLabel: "제목",
    titlePlaceholder: "제목을 입력하세요…",
    contentLabel: "내용",
    contentPlaceholder: "내용을 작성하세요…",
    categoryLabel: "카테고리",
    authorLabel: "작성자",
    submitLabel: "게시물 발행",
    cancelLabel: "취소",
    selectCategory: "— 카테고리 선택 —",
    selectAuthor: "— 작성자 선택 —",
  },
  ja: {
    title: "新しい投稿を書く",
    titleLabel: "タイトル",
    titlePlaceholder: "タイトルを入力してください…",
    contentLabel: "内容",
    contentPlaceholder: "投稿内容を書いてください…",
    categoryLabel: "カテゴリー",
    authorLabel: "著者",
    submitLabel: "投稿を公開",
    cancelLabel: "キャンセル",
    selectCategory: "— カテゴリーを選択 —",
    selectAuthor: "— 著者を選択 —",
  },
};

// ── Create Post Page Component ────────────────────────────────────────────────

export const CreatePostPage: PageComponent = (context: RouteContext) => {
  const { locale, query } = context;
  const l = createPostLabels[locale] ?? createPostLabels["en"]!;

  // Support pre-populated values from query (e.g. after validation failure)
  const values: Partial<CreatePostValues> = {
    title: query["title"],
    content: query["content"],
    categoryId: query["categoryId"],
    authorId: query["authorId"],
  };

  const errors: Partial<Record<keyof CreatePostValues, string>> = {};
  if (query["error_title"]) errors.title = query["error_title"];
  if (query["error_content"]) errors.content = query["error_content"];
  if (query["error_categoryId"]) errors.categoryId = query["error_categoryId"];
  if (query["error_authorId"]) errors.authorId = query["error_authorId"];

  const categories = store.getAllCategories();
  const authors = store.getAllAuthors();

  const categoryOptions = [
    `<option value="">${escapeHtml(l["selectCategory"]!)}</option>`,
    ...categories.map(
      (cat) =>
        `<option value="${escapeHtml(cat.id)}" ${values.categoryId === cat.id ? "selected" : ""}>${escapeHtml(cat.name)}</option>`,
    ),
  ].join("\n        ");

  const authorOptions = [
    `<option value="">${escapeHtml(l["selectAuthor"]!)}</option>`,
    ...authors.map(
      (author) =>
        `<option value="${escapeHtml(author.id)}" ${values.authorId === author.id ? "selected" : ""}>${escapeHtml(author.name)}</option>`,
    ),
  ].join("\n        ");

  function fieldError(field: keyof CreatePostValues): string {
    return errors[field]
      ? `<span class="field-error" role="alert">${escapeHtml(errors[field]!)}</span>`
      : "";
  }

  const header = Header({ currentPath: "/posts/create", locale });

  const body = `${header}
<main class="create-post-page" id="main-content">
  <div class="container">
    <h1 class="page-heading">${escapeHtml(l["title"]!)}</h1>
    <form
      class="create-post-form"
      method="POST"
      action="/posts"
      data-form="create-post"
      novalidate
    >
      <div class="form-field ${errors.title ? "form-field--error" : ""}">
        <label class="form-label" for="post-title">${escapeHtml(l["titleLabel"]!)}</label>
        <input
          class="form-input"
          type="text"
          id="post-title"
          name="title"
          value="${escapeHtml(values.title ?? "")}"
          placeholder="${escapeHtml(l["titlePlaceholder"]!)}"
          required
          minlength="3"
          maxlength="200"
          aria-invalid="${errors.title ? "true" : "false"}"
        >
        ${fieldError("title")}
      </div>
      <div class="form-field ${errors.categoryId ? "form-field--error" : ""}">
        <label class="form-label" for="post-category">${escapeHtml(l["categoryLabel"]!)}</label>
        <select
          class="form-select"
          id="post-category"
          name="categoryId"
          required
          aria-invalid="${errors.categoryId ? "true" : "false"}"
        >
          ${categoryOptions}
        </select>
        ${fieldError("categoryId")}
      </div>
      <div class="form-field ${errors.authorId ? "form-field--error" : ""}">
        <label class="form-label" for="post-author">${escapeHtml(l["authorLabel"]!)}</label>
        <select
          class="form-select"
          id="post-author"
          name="authorId"
          required
          aria-invalid="${errors.authorId ? "true" : "false"}"
        >
          ${authorOptions}
        </select>
        ${fieldError("authorId")}
      </div>
      <div class="form-field ${errors.content ? "form-field--error" : ""}">
        <label class="form-label" for="post-content">${escapeHtml(l["contentLabel"]!)}</label>
        <textarea
          class="form-textarea"
          id="post-content"
          name="content"
          rows="12"
          placeholder="${escapeHtml(l["contentPlaceholder"]!)}"
          required
          minlength="20"
          aria-invalid="${errors.content ? "true" : "false"}"
        >${escapeHtml(values.content ?? "")}</textarea>
        ${fieldError("content")}
      </div>
      <div class="form-actions">
        <a href="/" class="btn btn--secondary">${escapeHtml(l["cancelLabel"]!)}</a>
        <button type="submit" class="btn btn--primary">${escapeHtml(l["submitLabel"]!)}</button>
      </div>
    </form>
  </div>
</main>`;

  return {
    title: `${l["title"]!} | VaisX Blog`,
    body,
  };
};
