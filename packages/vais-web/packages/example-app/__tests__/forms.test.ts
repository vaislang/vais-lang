/**
 * Form validation and submission tests.
 */

import { describe, it, expect } from "vitest";
import {
  validateCommentForm,
  createCommentFormState,
  required,
  minLength,
  maxLength,
  CommentForm,
} from "../src/components/comment-form.js";
import { validateCreatePost } from "../src/pages/create-post.js";
import type { CommentFormValues } from "../src/components/comment-form.js";

// ── Built-in Validation Rules ──────────────────────────────────────────────────

describe("required rule", () => {
  it("returns true for non-empty string", () => {
    expect(required().validate("hello")).toBe(true);
  });
  it("returns false for empty string", () => {
    expect(required().validate("")).toBe(false);
  });
  it("returns false for whitespace-only string", () => {
    expect(required().validate("   ")).toBe(false);
  });
  it("returns false for null", () => {
    expect(required().validate(null)).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(required().validate(undefined)).toBe(false);
  });
  it("uses custom message", () => {
    expect(required("Field needed").message).toBe("Field needed");
  });
  it("default message is 'This field is required'", () => {
    expect(required().message).toBe("This field is required");
  });
});

describe("minLength rule", () => {
  it("passes when value meets minimum length", () => {
    expect(minLength(3).validate("hello")).toBe(true);
    expect(minLength(5).validate("12345")).toBe(true);
  });
  it("passes for exact minimum length", () => {
    expect(minLength(3).validate("abc")).toBe(true);
  });
  it("fails when value is shorter than minimum", () => {
    expect(minLength(5).validate("hi")).toBe(false);
  });
  it("default message includes the min length", () => {
    expect(minLength(8).message).toContain("8");
  });
  it("uses custom message", () => {
    expect(minLength(10, "Too short!").message).toBe("Too short!");
  });
});

describe("maxLength rule", () => {
  it("passes when value is within maximum length", () => {
    expect(maxLength(100).validate("hello")).toBe(true);
  });
  it("passes for exact maximum length", () => {
    expect(maxLength(5).validate("hello")).toBe(true);
  });
  it("fails when value exceeds maximum length", () => {
    expect(maxLength(3).validate("hello")).toBe(false);
  });
  it("default message includes the max length", () => {
    expect(maxLength(50).message).toContain("50");
  });
});

// ── validateCommentForm ────────────────────────────────────────────────────────

describe("validateCommentForm", () => {
  it("returns no errors for valid input", () => {
    const errors = validateCommentForm({ author: "Jane", content: "Great post, very helpful!" });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("returns error when author is empty", () => {
    const errors = validateCommentForm({ author: "", content: "Valid content here." });
    expect(errors.author).toBeTruthy();
  });

  it("returns error when content is too short", () => {
    const errors = validateCommentForm({ author: "Jane", content: "Hi" });
    expect(errors.content).toBeTruthy();
    expect(errors.content).toContain("5");
  });

  it("returns error when content is empty", () => {
    const errors = validateCommentForm({ author: "Jane", content: "" });
    expect(errors.content).toBeTruthy();
  });

  it("returns error when author exceeds max length", () => {
    const longName = "A".repeat(101);
    const errors = validateCommentForm({ author: longName, content: "Valid content here." });
    expect(errors.author).toBeTruthy();
  });

  it("returns errors for both fields when both invalid", () => {
    const errors = validateCommentForm({ author: "", content: "" });
    expect(errors.author).toBeTruthy();
    expect(errors.content).toBeTruthy();
  });
});

// ── createCommentFormState ─────────────────────────────────────────────────────

describe("createCommentFormState", () => {
  it("creates form state with default empty values", () => {
    const state = createCommentFormState();
    expect(state.fields.author.value).toBe("");
    expect(state.fields.content.value).toBe("");
    expect(state.isSubmitting).toBe(false);
    expect(state.isDirty).toBe(false);
  });

  it("creates form state with pre-populated values", () => {
    const state = createCommentFormState({ author: "Bob", content: "Hello!" });
    expect(state.fields.author.value).toBe("Bob");
    expect(state.fields.content.value).toBe("Hello!");
  });

  it("marks fields with errors as touched", () => {
    const state = createCommentFormState({}, { author: "Required" });
    expect(state.fields.author.touched).toBe(true);
    expect(state.isValid).toBe(false);
  });

  it("isValid is true when no errors", () => {
    const state = createCommentFormState();
    expect(state.isValid).toBe(true);
  });

  it("isValid is false when errors present", () => {
    const state = createCommentFormState({}, { content: "Too short" });
    expect(state.isValid).toBe(false);
  });
});

// ── validateCreatePost ─────────────────────────────────────────────────────────

describe("validateCreatePost", () => {
  it("returns no errors for fully valid input", () => {
    const errors = validateCreatePost({
      title: "A Proper Post Title",
      content: "This is a long enough content for the post.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("returns error when title is missing", () => {
    const errors = validateCreatePost({
      content: "Long enough content here.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(errors.title).toBeTruthy();
  });

  it("returns error when title is too short", () => {
    const errors = validateCreatePost({
      title: "Hi",
      content: "Long enough content here.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(errors.title).toBeTruthy();
    expect(errors.title).toContain("3");
  });

  it("returns error when content is missing", () => {
    const errors = validateCreatePost({
      title: "Valid Title Here",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(errors.content).toBeTruthy();
  });

  it("returns error when content is too short", () => {
    const errors = validateCreatePost({
      title: "Valid Title",
      content: "Short.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(errors.content).toBeTruthy();
  });

  it("returns error when categoryId is missing", () => {
    const errors = validateCreatePost({
      title: "Valid Title",
      content: "This is long enough content for a blog post.",
    });
    expect(errors.categoryId).toBeTruthy();
  });

  it("returns error when authorId is missing", () => {
    const errors = validateCreatePost({
      title: "Valid Title",
      content: "This is long enough content for a blog post.",
      categoryId: "cat-1",
    });
    expect(errors.authorId).toBeTruthy();
  });
});

// ── CommentForm Component (HTML output) ───────────────────────────────────────

describe("CommentForm HTML output", () => {
  it("renders form with postId hidden input", () => {
    const html = CommentForm({ postId: "post-42" });
    expect(html).toContain('value="post-42"');
    expect(html).toContain('name="postId"');
  });

  it("renders author and content inputs", () => {
    const html = CommentForm({ postId: "post-1" });
    expect(html).toContain('name="author"');
    expect(html).toContain('name="content"');
  });

  it("renders error messages when errors are provided", () => {
    const html = CommentForm({
      postId: "post-1",
      errors: { author: "Author name is required" },
    });
    expect(html).toContain("Author name is required");
    expect(html).toContain("form-field--error");
  });

  it("pre-fills values when provided", () => {
    const html = CommentForm({
      postId: "post-1",
      values: { author: "Jane Doe" },
    });
    expect(html).toContain("Jane Doe");
  });

  it("renders Korean locale labels", () => {
    const html = CommentForm({ postId: "post-1", locale: "ko" });
    expect(html).toContain("댓글 작성");
  });

  it("marks inputs as aria-invalid when errors present", () => {
    const html = CommentForm({
      postId: "post-1",
      errors: { content: "Too short" },
    });
    expect(html).toContain('aria-invalid="true"');
  });

  it("escapes HTML in error messages (XSS prevention)", () => {
    const html = CommentForm({
      postId: "post-1",
      errors: { author: "<script>alert('xss')</script>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
