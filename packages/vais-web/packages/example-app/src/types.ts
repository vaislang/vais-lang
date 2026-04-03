/**
 * Core data models for the VaisX Example Blog Application.
 * Simulates VaisX component patterns in pure TypeScript.
 */

// ── Data Models ──────────────────────────────────────────────────────────────

export interface Author {
  id: string;
  name: string;
  avatar: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: string;
  content: string;
  createdAt: Date;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  author: Author;
  category: Category;
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

// ── SSR Types ─────────────────────────────────────────────────────────────────

export interface RenderResult {
  html: string;
  head: string;
  statusCode: number;
  headers: Record<string, string>;
}

// ── Performance Types ─────────────────────────────────────────────────────────

export interface PerformanceMetrics {
  lcp: number; // ms — Largest Contentful Paint
  cls: number; // score — Cumulative Layout Shift
  fid: number; // ms — First Input Delay
  ttfb: number; // ms — Time to First Byte
}

// ── Routing Types ─────────────────────────────────────────────────────────────

export interface Route {
  path: string;
  pattern: RegExp;
  handler: (params: RouteParams, context: RouteContext) => RenderResult;
}

export interface RouteParams {
  [key: string]: string;
}

export interface RouteContext {
  locale: string;
  query: Record<string, string>;
}

// ── Pagination Types ──────────────────────────────────────────────────────────

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Form Types (simulating @vaisx/forms patterns) ────────────────────────────

export interface FormField<T = string> {
  value: T;
  error?: string;
  touched: boolean;
  dirty: boolean;
}

export interface FormState<T extends Record<string, unknown>> {
  fields: { [K in keyof T]: FormField<T[K]> };
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
}

export interface ValidationRule {
  validate: (value: unknown) => boolean;
  message: string;
}

export interface CreatePostInput {
  title: string;
  content: string;
  categoryId: string;
  authorId: string;
}

export interface CreateCommentInput {
  postId: string;
  author: string;
  content: string;
}

// ── I18n Types (simulating @vaisx/i18n patterns) ─────────────────────────────

export type Locale = "en" | "ko" | "ja";

export interface I18nMessages {
  [key: string]: string | I18nMessages;
}

export interface I18nInstance {
  locale: Locale;
  t(key: string, params?: Record<string, string | number>): string;
  setLocale(locale: Locale): void;
}
