/**
 * Comment submission form component.
 * Simulates @vaisx/forms patterns for client-side form state management.
 */

import { escapeHtml } from "../ssr/render.js";
import type { ValidationRule, FormState, FormField } from "../types.js";

// ── Comment Form Types ────────────────────────────────────────────────────────

export interface CommentFormValues {
  author: string;
  content: string;
}

export interface CommentFormProps {
  postId: string;
  locale?: string;
  errors?: Partial<Record<keyof CommentFormValues, string>>;
  values?: Partial<CommentFormValues>;
}

// ── Validation Rules (simulating @vaisx/forms API) ────────────────────────────

export const required = (message = "This field is required"): ValidationRule => ({
  validate: (v) => v !== null && v !== undefined && String(v).trim().length > 0,
  message,
});

export const minLength = (min: number, message?: string): ValidationRule => ({
  validate: (v) => String(v ?? "").length >= min,
  message: message ?? `Must be at least ${min} characters`,
});

export const maxLength = (max: number, message?: string): ValidationRule => ({
  validate: (v) => String(v ?? "").length <= max,
  message: message ?? `Must be at most ${max} characters`,
});

// ── Form State Factory (simulating @vaisx/forms createForm pattern) ──────────

export type CommentFormState = FormState<CommentFormValues>;

export function createCommentFormState(
  defaults: Partial<CommentFormValues> = {},
  errors: Partial<Record<keyof CommentFormValues, string>> = {},
): CommentFormState {
  function makeField<T>(value: T, error?: string): FormField<T> {
    return {
      value,
      error,
      touched: error !== undefined,
      dirty: false,
    };
  }

  const fields = {
    author: makeField(defaults.author ?? "", errors.author),
    content: makeField(defaults.content ?? "", errors.content),
  };

  const isValid = !errors.author && !errors.content;

  return {
    fields,
    isSubmitting: false,
    isValid,
    isDirty: false,
  };
}

/**
 * Validate comment form values against built-in rules.
 */
export function validateCommentForm(
  values: Partial<CommentFormValues>,
): Partial<Record<keyof CommentFormValues, string>> {
  const errors: Partial<Record<keyof CommentFormValues, string>> = {};

  const authorRules = [required("Author name is required"), maxLength(100)];
  for (const rule of authorRules) {
    if (!rule.validate(values.author)) {
      errors.author = rule.message;
      break;
    }
  }

  const contentRules = [
    required("Comment content is required"),
    minLength(5, "Comment must be at least 5 characters"),
    maxLength(2000, "Comment must be at most 2000 characters"),
  ];
  for (const rule of contentRules) {
    if (!rule.validate(values.content)) {
      errors.content = rule.message;
      break;
    }
  }

  return errors;
}

// ── Comment Form Component ────────────────────────────────────────────────────

/**
 * Comment form component — renders an HTML form for submitting comments.
 * Simulates the VaisX/forms pattern of form state + template rendering.
 */
export function CommentForm(props: CommentFormProps): string {
  const { postId, locale = "en", errors = {}, values = {} } = props;

  const labels: Record<string, Record<string, string>> = {
    en: {
      title: "Leave a Comment",
      authorLabel: "Your Name",
      authorPlaceholder: "Enter your name",
      contentLabel: "Comment",
      contentPlaceholder: "Write your comment here…",
      submitLabel: "Post Comment",
    },
    ko: {
      title: "댓글 작성",
      authorLabel: "이름",
      authorPlaceholder: "이름을 입력하세요",
      contentLabel: "댓글",
      contentPlaceholder: "댓글을 작성하세요…",
      submitLabel: "댓글 등록",
    },
    ja: {
      title: "コメントを書く",
      authorLabel: "お名前",
      authorPlaceholder: "名前を入力してください",
      contentLabel: "コメント",
      contentPlaceholder: "コメントをここに書いてください…",
      submitLabel: "コメントを投稿",
    },
  };

  const l = labels[locale] ?? labels["en"]!;

  const authorError = errors.author
    ? `<span class="field-error" role="alert" id="author-error">${escapeHtml(errors.author)}</span>`
    : "";

  const contentError = errors.content
    ? `<span class="field-error" role="alert" id="content-error">${escapeHtml(errors.content)}</span>`
    : "";

  const authorValue = escapeHtml(values.author ?? "");
  const contentValue = escapeHtml(values.content ?? "");

  return `<section class="comment-form" data-island="comment-form">
  <h3 class="comment-form__title">${escapeHtml(l["title"]!)}</h3>
  <form
    class="comment-form__form"
    method="POST"
    action="/posts/${escapeHtml(postId)}/comments"
    novalidate
    data-form="comment"
  >
    <input type="hidden" name="postId" value="${escapeHtml(postId)}">
    <div class="form-field ${errors.author ? "form-field--error" : ""}">
      <label class="form-label" for="comment-author">${escapeHtml(l["authorLabel"]!)}</label>
      <input
        class="form-input"
        type="text"
        id="comment-author"
        name="author"
        value="${authorValue}"
        placeholder="${escapeHtml(l["authorPlaceholder"]!)}"
        required
        maxlength="100"
        aria-describedby="${errors.author ? "author-error" : ""}"
        aria-invalid="${errors.author ? "true" : "false"}"
      >
      ${authorError}
    </div>
    <div class="form-field ${errors.content ? "form-field--error" : ""}">
      <label class="form-label" for="comment-content">${escapeHtml(l["contentLabel"]!)}</label>
      <textarea
        class="form-textarea"
        id="comment-content"
        name="content"
        rows="4"
        placeholder="${escapeHtml(l["contentPlaceholder"]!)}"
        required
        minlength="5"
        maxlength="2000"
        aria-describedby="${errors.content ? "content-error" : ""}"
        aria-invalid="${errors.content ? "true" : "false"}"
      >${contentValue}</textarea>
      ${contentError}
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn--primary">${escapeHtml(l["submitLabel"]!)}</button>
    </div>
  </form>
</section>`;
}
