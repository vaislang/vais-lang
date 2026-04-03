/**
 * In-memory data store with CRUD operations.
 * Simulates a database layer for the blog application.
 */

import type {
  Post,
  Author,
  Category,
  Comment,
  CreatePostInput,
  CreateCommentInput,
  PaginatedResult,
  PaginationOptions,
} from "./types.js";

// ── Seed Data ─────────────────────────────────────────────────────────────────

const seedAuthors: Author[] = [
  { id: "author-1", name: "Alice Kim", avatar: "/avatars/alice.png" },
  { id: "author-2", name: "Bob Park", avatar: "/avatars/bob.png" },
  { id: "author-3", name: "Carol Lee", avatar: "/avatars/carol.png" },
];

const seedCategories: Category[] = [
  { id: "cat-1", name: "Technology", slug: "technology" },
  { id: "cat-2", name: "Design", slug: "design" },
  { id: "cat-3", name: "Business", slug: "business" },
];

const seedPosts: Post[] = [
  {
    id: "post-1",
    title: "Getting Started with VaisX",
    content:
      "VaisX is a modern frontend framework that compiles to efficient JavaScript. In this post, we explore its core concepts including reactive signals, component composition, and SSR support.",
    author: seedAuthors[0]!,
    category: seedCategories[0]!,
    comments: [],
    createdAt: new Date("2026-01-10T10:00:00Z"),
    updatedAt: new Date("2026-01-10T10:00:00Z"),
  },
  {
    id: "post-2",
    title: "Designing with VaisX Components",
    content:
      "Component-driven design in VaisX allows developers to build reusable UI primitives. This guide covers the component lifecycle and pattern library.",
    author: seedAuthors[1]!,
    category: seedCategories[1]!,
    comments: [],
    createdAt: new Date("2026-01-15T14:00:00Z"),
    updatedAt: new Date("2026-01-15T14:00:00Z"),
  },
  {
    id: "post-3",
    title: "Scaling Your VaisX Application",
    content:
      "As your VaisX application grows, understanding the module system and code splitting strategies becomes critical. This article walks through production-ready architecture.",
    author: seedAuthors[2]!,
    category: seedCategories[2]!,
    comments: [],
    createdAt: new Date("2026-01-20T09:00:00Z"),
    updatedAt: new Date("2026-01-20T09:00:00Z"),
  },
  {
    id: "post-4",
    title: "VaisX Forms: Reactive Validation",
    content:
      "The @vaisx/forms package brings react-hook-form-inspired API to VaisX. Learn about field registration, schema validation, and server-side error handling.",
    author: seedAuthors[0]!,
    category: seedCategories[0]!,
    comments: [],
    createdAt: new Date("2026-01-25T11:00:00Z"),
    updatedAt: new Date("2026-01-25T11:00:00Z"),
  },
  {
    id: "post-5",
    title: "Internationalization in VaisX",
    content:
      "The @vaisx/i18n package provides first-class i18n support with locale detection, message interpolation, and SSR-compatible locale routing.",
    author: seedAuthors[1]!,
    category: seedCategories[0]!,
    comments: [],
    createdAt: new Date("2026-02-01T08:00:00Z"),
    updatedAt: new Date("2026-02-01T08:00:00Z"),
  },
];

const seedComments: Comment[] = [
  {
    id: "comment-1",
    postId: "post-1",
    author: "Dave",
    content: "Great introduction! Looking forward to more articles.",
    createdAt: new Date("2026-01-11T10:00:00Z"),
  },
  {
    id: "comment-2",
    postId: "post-1",
    author: "Eve",
    content: "VaisX looks very promising. Does it support TypeScript natively?",
    createdAt: new Date("2026-01-12T14:00:00Z"),
  },
  {
    id: "comment-3",
    postId: "post-2",
    author: "Frank",
    content: "The component patterns are elegant. Thanks for the detailed guide!",
    createdAt: new Date("2026-01-16T09:00:00Z"),
  },
];

// ── In-Memory Store ───────────────────────────────────────────────────────────

export class BlogDataStore {
  private posts: Map<string, Post>;
  private authors: Map<string, Author>;
  private categories: Map<string, Category>;
  private comments: Map<string, Comment>;
  private idCounter: number;

  constructor() {
    this.posts = new Map();
    this.authors = new Map();
    this.categories = new Map();
    this.comments = new Map();
    this.idCounter = 100;

    // Seed initial data
    for (const author of seedAuthors) {
      this.authors.set(author.id, { ...author });
    }
    for (const category of seedCategories) {
      this.categories.set(category.id, { ...category });
    }
    for (const post of seedPosts) {
      this.posts.set(post.id, { ...post, comments: [] });
    }
    for (const comment of seedComments) {
      this.comments.set(comment.id, { ...comment });
      const post = this.posts.get(comment.postId);
      if (post) {
        post.comments.push({ ...comment });
      }
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${++this.idCounter}`;
  }

  // ── Posts CRUD ──────────────────────────────────────────────────────────────

  getAllPosts(): Post[] {
    return Array.from(this.posts.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  getPostById(id: string): Post | undefined {
    return this.posts.get(id);
  }

  getPostsByCategory(categoryId: string): Post[] {
    return this.getAllPosts().filter((p) => p.category.id === categoryId);
  }

  getPostsByAuthor(authorId: string): Post[] {
    return this.getAllPosts().filter((p) => p.author.id === authorId);
  }

  getPaginatedPosts(options: PaginationOptions): PaginatedResult<Post> {
    const allPosts = this.getAllPosts();
    const { page, pageSize } = options;
    const total = allPosts.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = allPosts.slice(start, start + pageSize);

    return { items, total, page, pageSize, totalPages };
  }

  createPost(input: CreatePostInput): Post {
    const author = this.authors.get(input.authorId);
    if (!author) throw new Error(`Author not found: ${input.authorId}`);

    const category = this.categories.get(input.categoryId);
    if (!category) throw new Error(`Category not found: ${input.categoryId}`);

    const now = new Date();
    const post: Post = {
      id: this.generateId("post"),
      title: input.title,
      content: input.content,
      author: { ...author },
      category: { ...category },
      comments: [],
      createdAt: now,
      updatedAt: now,
    };

    this.posts.set(post.id, post);
    return { ...post };
  }

  updatePost(
    id: string,
    updates: Partial<Pick<Post, "title" | "content">>,
  ): Post | undefined {
    const post = this.posts.get(id);
    if (!post) return undefined;

    const updated: Post = {
      ...post,
      ...updates,
      updatedAt: new Date(),
    };
    this.posts.set(id, updated);
    return { ...updated };
  }

  deletePost(id: string): boolean {
    if (!this.posts.has(id)) return false;
    // Remove associated comments
    for (const [commentId, comment] of this.comments) {
      if (comment.postId === id) {
        this.comments.delete(commentId);
      }
    }
    this.posts.delete(id);
    return true;
  }

  // ── Comments CRUD ───────────────────────────────────────────────────────────

  getCommentsByPost(postId: string): Comment[] {
    return Array.from(this.comments.values())
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  createComment(input: CreateCommentInput): Comment {
    const post = this.posts.get(input.postId);
    if (!post) throw new Error(`Post not found: ${input.postId}`);

    const comment: Comment = {
      id: this.generateId("comment"),
      postId: input.postId,
      author: input.author,
      content: input.content,
      createdAt: new Date(),
    };

    this.comments.set(comment.id, comment);
    post.comments.push({ ...comment });
    return { ...comment };
  }

  deleteComment(commentId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment) return false;

    this.comments.delete(commentId);

    // Remove from post's comment list
    const post = this.posts.get(comment.postId);
    if (post) {
      post.comments = post.comments.filter((c) => c.id !== commentId);
    }
    return true;
  }

  // ── Authors & Categories ────────────────────────────────────────────────────

  getAllAuthors(): Author[] {
    return Array.from(this.authors.values());
  }

  getAuthorById(id: string): Author | undefined {
    return this.authors.get(id);
  }

  getAllCategories(): Category[] {
    return Array.from(this.categories.values());
  }

  getCategoryById(id: string): Category | undefined {
    return this.categories.get(id);
  }

  getCategoryBySlug(slug: string): Category | undefined {
    return Array.from(this.categories.values()).find((c) => c.slug === slug);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  getStats(): { posts: number; comments: number; authors: number; categories: number } {
    return {
      posts: this.posts.size,
      comments: this.comments.size,
      authors: this.authors.size,
      categories: this.categories.size,
    };
  }
}

// Singleton store instance
export const store = new BlogDataStore();
