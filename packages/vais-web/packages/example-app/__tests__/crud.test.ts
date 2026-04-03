/**
 * CRUD operations tests for posts and comments.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BlogDataStore } from "../src/data.js";

// Fresh store for each test
let store: BlogDataStore;
beforeEach(() => {
  store = new BlogDataStore();
});

// ── Posts CRUD ─────────────────────────────────────────────────────────────────

describe("Posts — Read", () => {
  it("getAllPosts returns seed posts sorted newest-first", () => {
    const posts = store.getAllPosts();
    expect(posts.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        posts[i]!.createdAt.getTime(),
      );
    }
  });

  it("getPostById returns the correct post", () => {
    const post = store.getPostById("post-1");
    expect(post).toBeDefined();
    expect(post!.id).toBe("post-1");
    expect(post!.title).toBe("Getting Started with VaisX");
  });

  it("getPostById returns undefined for unknown id", () => {
    expect(store.getPostById("non-existent")).toBeUndefined();
  });

  it("getPostsByCategory filters posts by category", () => {
    const post = store.getPostById("post-1");
    expect(post).toBeDefined();
    const posts = store.getPostsByCategory(post!.category.id);
    expect(posts.every((p) => p.category.id === post!.category.id)).toBe(true);
  });

  it("getPostsByAuthor filters posts by author", () => {
    const post = store.getPostById("post-1");
    expect(post).toBeDefined();
    const posts = store.getPostsByAuthor(post!.author.id);
    expect(posts.every((p) => p.author.id === post!.author.id)).toBe(true);
  });

  it("getPaginatedPosts returns correct page slice", () => {
    const result = store.getPaginatedPosts({ page: 1, pageSize: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBeGreaterThanOrEqual(5);
    expect(result.totalPages).toBe(Math.ceil(result.total / 2));
  });

  it("getPaginatedPosts page 2 returns different items than page 1", () => {
    const page1 = store.getPaginatedPosts({ page: 1, pageSize: 2 });
    const page2 = store.getPaginatedPosts({ page: 2, pageSize: 2 });
    const ids1 = new Set(page1.items.map((p) => p.id));
    const ids2 = new Set(page2.items.map((p) => p.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });
});

describe("Posts — Create", () => {
  it("createPost adds a new post to the store", () => {
    const initialCount = store.getAllPosts().length;
    store.createPost({
      title: "New Test Post",
      content: "Content for the new test post.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(store.getAllPosts()).toHaveLength(initialCount + 1);
  });

  it("createPost returns the created post with correct fields", () => {
    const post = store.createPost({
      title: "Hello VaisX",
      content: "Testing the data store.",
      categoryId: "cat-2",
      authorId: "author-2",
    });
    expect(post.id).toBeTruthy();
    expect(post.title).toBe("Hello VaisX");
    expect(post.content).toBe("Testing the data store.");
    expect(post.author.id).toBe("author-2");
    expect(post.category.id).toBe("cat-2");
    expect(post.comments).toHaveLength(0);
    expect(post.createdAt).toBeInstanceOf(Date);
    expect(post.updatedAt).toBeInstanceOf(Date);
  });

  it("createPost throws when author not found", () => {
    expect(() =>
      store.createPost({
        title: "Post",
        content: "Content",
        categoryId: "cat-1",
        authorId: "non-existent-author",
      }),
    ).toThrow("Author not found");
  });

  it("createPost throws when category not found", () => {
    expect(() =>
      store.createPost({
        title: "Post",
        content: "Content",
        categoryId: "non-existent-cat",
        authorId: "author-1",
      }),
    ).toThrow("Category not found");
  });
});

describe("Posts — Update", () => {
  it("updatePost changes title and content", () => {
    const updated = store.updatePost("post-1", {
      title: "Updated Title",
      content: "Updated content.",
    });
    expect(updated).toBeDefined();
    expect(updated!.title).toBe("Updated Title");
    expect(updated!.content).toBe("Updated content.");
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(updated!.createdAt.getTime());
  });

  it("updatePost returns undefined for unknown id", () => {
    expect(store.updatePost("non-existent", { title: "X" })).toBeUndefined();
  });

  it("updatePost preserves other fields", () => {
    const original = store.getPostById("post-1")!;
    const updated = store.updatePost("post-1", { title: "New Title" });
    expect(updated!.author.id).toBe(original.author.id);
    expect(updated!.category.id).toBe(original.category.id);
    expect(updated!.createdAt.getTime()).toBe(original.createdAt.getTime());
  });
});

describe("Posts — Delete", () => {
  it("deletePost removes the post and returns true", () => {
    const before = store.getAllPosts().length;
    const result = store.deletePost("post-1");
    expect(result).toBe(true);
    expect(store.getAllPosts()).toHaveLength(before - 1);
    expect(store.getPostById("post-1")).toBeUndefined();
  });

  it("deletePost returns false for unknown id", () => {
    expect(store.deletePost("non-existent")).toBe(false);
  });

  it("deletePost also removes associated comments", () => {
    // post-1 has seeded comments
    const result = store.deletePost("post-1");
    expect(result).toBe(true);
    const comments = store.getCommentsByPost("post-1");
    expect(comments).toHaveLength(0);
  });
});

// ── Comments CRUD ──────────────────────────────────────────────────────────────

describe("Comments — Read", () => {
  it("getCommentsByPost returns comments for a given post", () => {
    const comments = store.getCommentsByPost("post-1");
    expect(comments.length).toBeGreaterThan(0);
    expect(comments.every((c) => c.postId === "post-1")).toBe(true);
  });

  it("getCommentsByPost returns comments sorted oldest-first", () => {
    const comments = store.getCommentsByPost("post-1");
    for (let i = 1; i < comments.length; i++) {
      expect(comments[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        comments[i - 1]!.createdAt.getTime(),
      );
    }
  });

  it("getCommentsByPost returns empty array for post with no comments", () => {
    const newPost = store.createPost({
      title: "Empty Post",
      content: "No comments yet.",
      categoryId: "cat-1",
      authorId: "author-1",
    });
    expect(store.getCommentsByPost(newPost.id)).toHaveLength(0);
  });
});

describe("Comments — Create", () => {
  it("createComment adds a comment to the post", () => {
    const before = store.getCommentsByPost("post-1").length;
    store.createComment({ postId: "post-1", author: "Tester", content: "Great article!" });
    expect(store.getCommentsByPost("post-1")).toHaveLength(before + 1);
  });

  it("createComment returns the created comment", () => {
    const comment = store.createComment({
      postId: "post-1",
      author: "Jane",
      content: "Very helpful, thanks!",
    });
    expect(comment.id).toBeTruthy();
    expect(comment.postId).toBe("post-1");
    expect(comment.author).toBe("Jane");
    expect(comment.content).toBe("Very helpful, thanks!");
    expect(comment.createdAt).toBeInstanceOf(Date);
  });

  it("createComment throws for non-existent postId", () => {
    expect(() =>
      store.createComment({ postId: "ghost-post", author: "X", content: "Y" }),
    ).toThrow("Post not found");
  });
});

describe("Comments — Delete", () => {
  it("deleteComment removes the comment and returns true", () => {
    const comment = store.createComment({
      postId: "post-1",
      author: "Delete Me",
      content: "Temporary comment.",
    });
    const before = store.getCommentsByPost("post-1").length;
    const result = store.deleteComment(comment.id);
    expect(result).toBe(true);
    expect(store.getCommentsByPost("post-1")).toHaveLength(before - 1);
  });

  it("deleteComment returns false for unknown id", () => {
    expect(store.deleteComment("non-existent-comment")).toBe(false);
  });
});

// ── Authors & Categories ───────────────────────────────────────────────────────

describe("Authors & Categories", () => {
  it("getAllAuthors returns seeded authors", () => {
    const authors = store.getAllAuthors();
    expect(authors.length).toBeGreaterThanOrEqual(3);
  });

  it("getAuthorById returns the correct author", () => {
    const author = store.getAuthorById("author-1");
    expect(author).toBeDefined();
    expect(author!.name).toBe("Alice Kim");
  });

  it("getAllCategories returns seeded categories", () => {
    const cats = store.getAllCategories();
    expect(cats.length).toBeGreaterThanOrEqual(3);
  });

  it("getCategoryBySlug finds category by slug", () => {
    const cat = store.getCategoryBySlug("technology");
    expect(cat).toBeDefined();
    expect(cat!.name).toBe("Technology");
  });

  it("getStats returns correct counts", () => {
    const stats = store.getStats();
    expect(stats.posts).toBeGreaterThanOrEqual(5);
    expect(stats.authors).toBeGreaterThanOrEqual(3);
    expect(stats.categories).toBeGreaterThanOrEqual(3);
    expect(stats.comments).toBeGreaterThanOrEqual(3);
  });
});
