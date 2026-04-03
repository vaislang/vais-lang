/**
 * @vaisx/db — server.ts tests
 *
 * Tests for createServerAction(), serializeResult(), deserializeResult(),
 * and withTransaction().
 *
 * All tests run against mock drivers — no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createServerAction,
  serializeResult,
  deserializeResult,
  withTransaction,
} from "../src/server.js";
import type { DatabaseClient } from "../src/types.js";
import type { DeserializeSchema } from "../src/server.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockClient(overrides: Partial<DatabaseClient> = {}): DatabaseClient {
  return {
    query: vi.fn(async () => []),
    insert: vi.fn(async () => ({ rowsAffected: 1 })),
    update: vi.fn(async () => ({ rowsAffected: 1 })),
    delete: vi.fn(async () => ({ rowsAffected: 1 })),
    transaction: vi.fn(async (fn) => fn(buildMockClient())),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

// ─── serializeResult ──────────────────────────────────────────────────────────

describe("serializeResult", () => {
  it("converts Date to ISO string", () => {
    const date = new Date("2024-01-15T10:30:00.000Z");
    expect(serializeResult(date)).toBe("2024-01-15T10:30:00.000Z");
  });

  it("converts BigInt to string", () => {
    expect(serializeResult(BigInt(12345678901234567890n))).toBe("12345678901234567890");
  });

  it("removes undefined fields from objects", () => {
    const input = { a: 1, b: undefined, c: "hello" };
    const result = serializeResult(input) as Record<string, unknown>;
    expect(result).toEqual({ a: 1, c: "hello" });
    expect("b" in result).toBe(false);
  });

  it("converts Date fields inside objects", () => {
    const date = new Date("2024-06-01T00:00:00.000Z");
    const input = { id: 1, createdAt: date, name: "Alice" };
    const result = serializeResult(input) as Record<string, unknown>;
    expect(result.createdAt).toBe("2024-06-01T00:00:00.000Z");
    expect(result.id).toBe(1);
    expect(result.name).toBe("Alice");
  });

  it("converts BigInt fields inside objects", () => {
    const input = { id: BigInt(999), value: "text" };
    const result = serializeResult(input) as Record<string, unknown>;
    expect(result.id).toBe("999");
    expect(result.value).toBe("text");
  });

  it("handles arrays of objects", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const input = [{ id: 1, ts: date }, { id: 2, ts: date }];
    const result = serializeResult(input) as Record<string, unknown>[];
    expect(result[0].ts).toBe("2024-01-01T00:00:00.000Z");
    expect(result[1].ts).toBe("2024-01-01T00:00:00.000Z");
  });

  it("passes through null as null", () => {
    expect(serializeResult(null)).toBe(null);
  });

  it("passes through primitive strings unchanged", () => {
    expect(serializeResult("hello")).toBe("hello");
  });

  it("passes through numbers unchanged", () => {
    expect(serializeResult(42)).toBe(42);
  });

  it("handles nested objects recursively", () => {
    const date = new Date("2025-03-10T12:00:00.000Z");
    const input = { user: { profile: { joinedAt: date, role: "admin" } } };
    const result = serializeResult(input) as { user: { profile: { joinedAt: string; role: string } } };
    expect(result.user.profile.joinedAt).toBe("2025-03-10T12:00:00.000Z");
    expect(result.user.profile.role).toBe("admin");
  });

  it("detects and removes circular references", () => {
    const obj: Record<string, unknown> = { id: 1 };
    obj.self = obj; // circular reference
    const result = serializeResult(obj) as Record<string, unknown>;
    expect(result.id).toBe(1);
    expect(result.self).toBe(null);
  });

  it("removes undefined values inside arrays (serialized as non-undefined equivalent)", () => {
    const input = [1, undefined, 3];
    const result = serializeResult(input) as unknown[];
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(1);
    expect(result[2]).toBe(3);
  });
});

// ─── deserializeResult ────────────────────────────────────────────────────────

describe("deserializeResult", () => {
  it("restores ISO string to Date when field is in schema.dates", () => {
    const schema: DeserializeSchema = { dates: ["createdAt"] };
    const input = { id: 1, createdAt: "2024-01-15T10:30:00.000Z" };
    const result = deserializeResult<{ id: number; createdAt: Date }>(input, schema);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2024-01-15T10:30:00.000Z");
  });

  it("restores string to BigInt when field is in schema.bigints", () => {
    const schema: DeserializeSchema = { bigints: ["amount"] };
    const input = { amount: "9007199254740993" };
    const result = deserializeResult<{ amount: bigint }>(input, schema);
    expect(typeof result.amount).toBe("bigint");
    expect(result.amount).toBe(BigInt("9007199254740993"));
  });

  it("auto-detects ISO date strings when no schema is provided", () => {
    const input = { ts: "2024-06-01T00:00:00.000Z" };
    const result = deserializeResult<{ ts: Date }>(input);
    expect(result.ts).toBeInstanceOf(Date);
  });

  it("does not convert string to BigInt without schema", () => {
    const input = { id: "12345" };
    const result = deserializeResult<{ id: string }>(input);
    expect(typeof result.id).toBe("string");
  });

  it("handles arrays of serialized objects", () => {
    const schema: DeserializeSchema = { dates: ["createdAt"] };
    const input = [
      { id: 1, createdAt: "2024-01-01T00:00:00.000Z" },
      { id: 2, createdAt: "2024-02-01T00:00:00.000Z" },
    ];
    const result = deserializeResult<{ id: number; createdAt: Date }[]>(input, schema);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[1].createdAt).toBeInstanceOf(Date);
  });

  it("passes through null unchanged", () => {
    expect(deserializeResult(null)).toBeNull();
  });

  it("passes through non-date strings unchanged when schema has dates for other fields", () => {
    const schema: DeserializeSchema = { dates: ["createdAt"] };
    const input = { name: "Alice", createdAt: "2024-01-01T00:00:00.000Z" };
    const result = deserializeResult<{ name: string; createdAt: Date }>(input, schema);
    expect(result.name).toBe("Alice");
  });
});

// ─── withTransaction ──────────────────────────────────────────────────────────

describe("withTransaction", () => {
  it("calls client.transaction with the handler", async () => {
    const txClient = buildMockClient();
    const client = buildMockClient({
      transaction: vi.fn(async (fn) => fn(txClient)),
    });

    const result = await withTransaction(client, async (tx) => {
      await tx.query("SELECT 1");
      return "done";
    });

    expect(client.transaction).toHaveBeenCalledOnce();
    expect(txClient.query).toHaveBeenCalledWith("SELECT 1");
    expect(result).toBe("done");
  });

  it("propagates errors from the handler", async () => {
    const client = buildMockClient({
      transaction: vi.fn(async (fn) => fn(buildMockClient())),
    });

    await expect(
      withTransaction(client, async () => {
        throw new Error("tx failed");
      }),
    ).rejects.toThrow("tx failed");
  });
});

// ─── createServerAction ───────────────────────────────────────────────────────

describe("createServerAction", () => {
  it("wraps a handler and serializes the result", async () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const client = buildMockClient();
    const action = createServerAction(async (_db) => ({ id: 1, createdAt: date }));
    const result = await action(client) as Record<string, unknown>;
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result.id).toBe(1);
  });

  it("runs the handler inside a transaction", async () => {
    const txClient = buildMockClient();
    const client = buildMockClient({
      transaction: vi.fn(async (fn) => fn(txClient)),
    });

    const action = createServerAction(async (db) => {
      await db.query("SELECT 1");
      return "ok";
    });

    await action(client);
    expect(client.transaction).toHaveBeenCalledOnce();
    expect(txClient.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("passes extra args to the handler", async () => {
    const client = buildMockClient();
    const handler = vi.fn(async (_db: DatabaseClient, id: number, name: string) => ({ id, name }));
    const action = createServerAction(handler);
    const result = await action(client, 42, "Bob") as Record<string, unknown>;
    expect(handler).toHaveBeenCalledWith(expect.anything(), 42, "Bob");
    expect(result).toEqual({ id: 42, name: "Bob" });
  });

  it("serializes BigInt in result", async () => {
    const client = buildMockClient();
    const action = createServerAction(async (_db) => ({ amount: BigInt(999) }));
    const result = await action(client) as Record<string, unknown>;
    expect(result.amount).toBe("999");
  });

  it("removes undefined fields from result", async () => {
    const client = buildMockClient();
    const action = createServerAction(async (_db) => ({ a: 1, b: undefined }));
    const result = await action(client) as Record<string, unknown>;
    expect("b" in result).toBe(false);
  });

  it("calls onError callback when handler throws", async () => {
    const client = buildMockClient({
      transaction: vi.fn(async (fn) => fn(buildMockClient())),
    });
    const onError = vi.fn();
    const action = createServerAction(
      async () => { throw new Error("boom"); },
      { onError },
    );

    await expect(action(client)).rejects.toThrow("boom");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("retries the handler on failure (retries: 1)", async () => {
    const client = buildMockClient();
    let callCount = 0;
    const handler = vi.fn(async (_db: DatabaseClient) => {
      callCount++;
      if (callCount === 1) throw new Error("first fail");
      return { success: true };
    });

    const action = createServerAction(handler, { retries: 1 });
    const result = await action(client) as Record<string, unknown>;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });

  it("throws after exhausting all retries", async () => {
    const client = buildMockClient();
    const onError = vi.fn();
    const action = createServerAction(
      async () => { throw new Error("always fails"); },
      { retries: 2, onError },
    );

    await expect(action(client)).rejects.toThrow("always fails");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("times out when the handler exceeds the timeout", async () => {
    const txClient = buildMockClient({
      query: vi.fn(
        () => new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("never")), 5000),
        ),
      ),
    });
    const client = buildMockClient({
      transaction: vi.fn(async (fn) => fn(txClient)),
    });

    const action = createServerAction(
      async (db) => {
        await db.query("SELECT pg_sleep(5)");
        return "done";
      },
      { timeout: 50 },
    );

    await expect(action(client)).rejects.toThrow(/timed out/);
  }, 3000);

  it("returns serialized array result", async () => {
    const date = new Date("2024-03-01T00:00:00.000Z");
    const client = buildMockClient();
    const action = createServerAction(async (_db) => [
      { id: 1, ts: date },
      { id: 2, ts: date },
    ]);
    const result = await action(client) as Record<string, unknown>[];
    expect(result[0].ts).toBe("2024-03-01T00:00:00.000Z");
    expect(result[1].ts).toBe("2024-03-01T00:00:00.000Z");
  });
});
