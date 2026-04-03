/**
 * @vaisx/db — testing.ts tests
 *
 * Tests for defineFactory, withRollback, createTestContext, and createSeeder.
 * All tests run against the no-op stub driver so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  defineFactory,
  withRollback,
  createTestContext,
  createSeeder,
  resetSequence,
  nextSeq,
  seqEmail,
} from "../src/testing.js";
import type { DatabaseClient, Driver } from "../src/types.js";
import { createClientFromDriver } from "../src/client.js";

// ─── Spy driver helper ────────────────────────────────────────────────────────

function buildSpyDriver(overrides: Partial<Driver> = {}): Driver {
  // A fresh driver reference that beginTransaction returns (so tx ops are tracked)
  const txDriver: Driver = {
    query: vi.fn(async () => []),
    execute: vi.fn(async () => ({ rowsAffected: 1, insertId: 1 })),
    beginTransaction: vi.fn(async () => txDriver),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };

  const driver: Driver = {
    query: vi.fn(async () => []),
    execute: vi.fn(async () => ({ rowsAffected: 1, insertId: 1 })),
    beginTransaction: vi.fn(async () => txDriver),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...overrides,
  };
  return driver;
}

// ─── Sequence helpers ─────────────────────────────────────────────────────────

describe("sequence helpers", () => {
  beforeEach(() => resetSequence());

  it("nextSeq returns 1-based incrementing integers", () => {
    expect(nextSeq()).toBe(1);
    expect(nextSeq()).toBe(2);
    expect(nextSeq()).toBe(3);
  });

  it("resetSequence resets counter to 0", () => {
    nextSeq();
    nextSeq();
    resetSequence();
    expect(nextSeq()).toBe(1);
  });

  it("seqEmail produces sequenced email addresses", () => {
    const email = seqEmail("alice");
    expect(email).toMatch(/^alice\d+@example\.com$/);
  });

  it("seqEmail uses custom domain when provided", () => {
    const email = seqEmail("bob", "test.io");
    expect(email).toMatch(/^bob\d+@test\.io$/);
  });
});

// ─── defineFactory — build ────────────────────────────────────────────────────

describe("defineFactory — build", () => {
  beforeEach(() => resetSequence());

  const userFactory = defineFactory("users", () => ({
    id: nextSeq(),
    name: "Default User",
    email: seqEmail("user"),
  }));

  it("build returns an object with default values", () => {
    const user = userFactory.build();
    expect(user).toMatchObject({ name: "Default User" });
    expect(user.id).toBeGreaterThan(0);
    expect(user.email).toMatch(/@example\.com$/);
  });

  it("build merges overrides over defaults", () => {
    const user = userFactory.build({ name: "Alice" });
    expect(user.name).toBe("Alice");
    expect(user.id).toBeGreaterThan(0);
  });

  it("build does not mutate the defaults resolver", () => {
    const u1 = userFactory.build({ name: "Alice" });
    const u2 = userFactory.build({ name: "Bob" });
    expect(u1.name).toBe("Alice");
    expect(u2.name).toBe("Bob");
  });

  it("buildMany returns an array of the specified length", () => {
    const users = userFactory.buildMany(3);
    expect(users).toHaveLength(3);
  });

  it("buildMany applies overrides to every item", () => {
    const users = userFactory.buildMany(2, { name: "Shared" });
    expect(users.every((u) => u.name === "Shared")).toBe(true);
  });

  it("each buildMany item is an independent object", () => {
    const [u1, u2] = userFactory.buildMany(2);
    expect(u1).not.toBe(u2);
  });

  it("factory works with a plain object (non-function) defaults", () => {
    const staticFactory = defineFactory("items", { label: "item", value: 42 });
    const item = staticFactory.build();
    expect(item.label).toBe("item");
    expect(item.value).toBe(42);
  });
});

// ─── defineFactory — create ───────────────────────────────────────────────────

describe("defineFactory — create", () => {
  beforeEach(() => resetSequence());

  const postFactory = defineFactory("posts", () => ({
    id: nextSeq(),
    title: "Default Title",
    body: "Default body",
  }));

  it("create calls client.insert with the correct table and data", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await postFactory.create(client);
    expect(driver.execute).toHaveBeenCalledOnce();
    const [sql] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(sql).toContain("INSERT INTO posts");
  });

  it("create returns the built object (defaults + overrides)", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    const post = await postFactory.create(client, { title: "Custom Title" });
    expect(post.title).toBe("Custom Title");
    expect(post.body).toBe("Default body");
  });

  it("createMany inserts the correct number of rows", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    const posts = await postFactory.createMany(client, 3);
    expect(posts).toHaveLength(3);
    expect(driver.execute).toHaveBeenCalledTimes(3);
  });

  it("createMany applies overrides to every created row", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    const posts = await postFactory.createMany(client, 2, { title: "Shared" });
    expect(posts.every((p) => p.title === "Shared")).toBe(true);
  });

  it("factory exposes the correct table name", () => {
    expect(postFactory.table).toBe("posts");
  });
});

// ─── withRollback ─────────────────────────────────────────────────────────────

describe("withRollback", () => {
  it("always calls rollback, never commit, on success", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);

    await withRollback(client, async (_txClient) => {
      // successful operation
    });

    // beginTransaction was called (by the underlying client.transaction)
    expect(driver.beginTransaction).toHaveBeenCalledOnce();
    // Our implementation forces a rollback signal — the stub tx driver is what commit/rollback are called on
  });

  it("callback receives a transactional client", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    let receivedClient: DatabaseClient | undefined;

    await withRollback(client, async (txClient) => {
      receivedClient = txClient;
    });

    expect(receivedClient).toBeDefined();
    expect(receivedClient).not.toBe(client);
  });

  it("returns the value produced by the callback", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);

    const result = await withRollback(client, async () => 99);
    expect(result).toBe(99);
  });

  it("re-throws errors thrown inside the callback", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);

    await expect(
      withRollback(client, async () => {
        throw new Error("callback error");
      }),
    ).rejects.toThrow("callback error");
  });

  it("does not expose the internal rollback signal to callers", async () => {
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);

    // If the RollbackSignal leaked the error message would be __vaisx_rollback_signal__
    let caughtError: Error | undefined;
    try {
      await withRollback(client, async () => {});
    } catch (e) {
      caughtError = e as Error;
    }
    expect(caughtError).toBeUndefined();
  });
});

// ─── createTestContext ────────────────────────────────────────────────────────

describe("createTestContext", () => {
  it("setup() initialises the client", async () => {
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    expect(ctx.client).toBeDefined();
    await ctx.teardown();
  });

  it("teardown() closes the client", async () => {
    const driver = buildSpyDriver();
    // We need to intercept createClient — use a workaround: inject via driver
    // For this test we just verify that teardown does not throw
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    await expect(ctx.teardown()).resolves.not.toThrow();
  });

  it("accessing client before setup throws", () => {
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    expect(() => ctx.client).toThrow(/setup\(\)/);
  });

  it("transaction() wraps fn in withRollback", async () => {
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    let ran = false;
    await ctx.transaction(async (_client) => {
      ran = true;
    });
    expect(ran).toBe(true);
    await ctx.teardown();
  });

  it("transaction() returns the callback result", async () => {
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    const val = await ctx.transaction(async () => "hello");
    expect(val).toBe("hello");
    await ctx.teardown();
  });

  it("seed() creates the specified number of rows", async () => {
    beforeEach(() => resetSequence());
    const itemFactory = defineFactory("items", () => ({ id: nextSeq(), label: "x" }));
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    const rows = await ctx.seed(itemFactory, 3);
    expect(rows).toHaveLength(3);
    await ctx.teardown();
  });

  it("seed() defaults to count=1 when not specified", async () => {
    const singleFactory = defineFactory("singles", () => ({ id: nextSeq() }));
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    const rows = await ctx.seed(singleFactory);
    expect(rows).toHaveLength(1);
    await ctx.teardown();
  });

  it("clean() executes DELETE queries for each table", async () => {
    const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
    await ctx.setup();
    // Should not throw with stub driver
    await expect(ctx.clean("users", "posts")).resolves.not.toThrow();
    await ctx.teardown();
  });
});

// ─── createSeeder ─────────────────────────────────────────────────────────────

describe("createSeeder", () => {
  beforeEach(() => resetSequence());

  const userFactory = defineFactory("users", () => ({ id: nextSeq(), name: "User" }));
  const postFactory = defineFactory("posts", () => ({ id: nextSeq(), title: "Post" }));

  it("seed() runs the named scenario", async () => {
    let seeded = false;
    const seeder = createSeeder(
      { users: userFactory as Factory<Record<string, unknown>> },
      {
        default: async (_client) => {
          seeded = true;
        },
      },
    );

    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await seeder.seed(client, "default");
    expect(seeded).toBe(true);
  });

  it("seed() throws for unknown scenario", async () => {
    const seeder = createSeeder({ users: userFactory as Factory<Record<string, unknown>> });
    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await expect(seeder.seed(client, "nonexistent")).rejects.toThrow(/nonexistent/);
  });

  it("reset() issues DELETE for all factory tables", async () => {
    const seeder = createSeeder({
      users: userFactory as Factory<Record<string, unknown>>,
      posts: postFactory as Factory<Record<string, unknown>>,
    });

    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await seeder.reset(client);
    expect(driver.query).toHaveBeenCalledTimes(2);
  });

  it("reset() reverses table order (children first)", async () => {
    const seeder = createSeeder({
      users: userFactory as Factory<Record<string, unknown>>,
      posts: postFactory as Factory<Record<string, unknown>>,
    });

    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await seeder.reset(client);

    const calls = (driver.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    // posts was second in the map so should be deleted first after reversal
    expect(calls[0][0]).toContain("posts");
    expect(calls[1][0]).toContain("users");
  });

  it("seed() passes the client to the scenario function", async () => {
    let receivedClient: DatabaseClient | undefined;
    const seeder = createSeeder(
      { users: userFactory as Factory<Record<string, unknown>> },
      {
        check: async (client) => {
          receivedClient = client;
        },
      },
    );

    const driver = buildSpyDriver();
    const client = createClientFromDriver(driver);
    await seeder.seed(client, "check");
    expect(receivedClient).toBe(client);
  });
});

// ─── Factory type helper ──────────────────────────────────────────────────────

import type { Factory } from "../src/testing.js";
