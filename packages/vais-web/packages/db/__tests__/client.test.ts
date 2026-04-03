/**
 * @vaisx/db — client.ts tests
 *
 * Tests for createClient(), createClientFromDriver() and the stub Driver.
 * All tests run against the no-op stub driver so no real database is needed.
 */

import { describe, it, expect, vi } from "vitest";
import { createClient, createClientFromDriver } from "../src/client.js";
import type { Driver, DatabaseClient } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a spy Driver that records calls and delegates to a stub. */
function buildSpyDriver(overrides: Partial<Driver> = {}): Driver {
  const driver: Driver = {
    query: vi.fn(async () => []),
    execute: vi.fn(async () => ({ rowsAffected: 1, insertId: 42 })),
    beginTransaction: vi.fn(async () => driver),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...overrides,
  };
  return driver;
}

// ─── createClient ─────────────────────────────────────────────────────────────

describe("createClient", () => {
  it("returns a DatabaseClient for sqlite driver", () => {
    const db = createClient({ driver: "sqlite", filename: ":memory:" });
    expect(typeof db.query).toBe("function");
    expect(typeof db.insert).toBe("function");
    expect(typeof db.update).toBe("function");
    expect(typeof db.delete).toBe("function");
    expect(typeof db.transaction).toBe("function");
    expect(typeof db.close).toBe("function");
  });

  it("returns a DatabaseClient for postgres driver", () => {
    const db = createClient({ driver: "postgres", url: "postgres://localhost/test" });
    expect(typeof db.query).toBe("function");
  });

  it("returns a DatabaseClient for mysql driver", () => {
    const db = createClient({ driver: "mysql", url: "mysql://root@localhost/test" });
    expect(typeof db.query).toBe("function");
  });

  it("stub driver query returns an empty array", async () => {
    const db = createClient({ driver: "sqlite", filename: ":memory:" });
    const rows = await db.query("SELECT 1");
    expect(rows).toEqual([]);
  });
});

// ─── createClientFromDriver ───────────────────────────────────────────────────

describe("createClientFromDriver", () => {
  it("delegates query to the driver", async () => {
    const driver = buildSpyDriver({
      query: vi.fn(async () => [{ id: 1 }]),
    });
    const db = createClientFromDriver(driver);
    const rows = await db.query<{ id: number }>("SELECT * FROM users");
    expect(driver.query).toHaveBeenCalledWith("SELECT * FROM users", undefined);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("delegates query with params to the driver", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.query("SELECT * FROM users WHERE id = $1", [42]);
    expect(driver.query).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE id = $1",
      [42],
    );
  });

  it("insert builds correct SQL and calls driver.execute", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.insert("users", { name: "Alice", email: "alice@example.com" });
    const [sql, params] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO users");
    expect(sql).toContain("name");
    expect(sql).toContain("email");
    expect(params).toContain("Alice");
    expect(params).toContain("alice@example.com");
  });

  it("insert returns rowsAffected and insertId from driver", async () => {
    const driver = buildSpyDriver({
      execute: vi.fn(async () => ({ rowsAffected: 1, insertId: 99 })),
    });
    const db = createClientFromDriver(driver);
    const result = await db.insert("users", { name: "Bob" });
    expect(result.rowsAffected).toBe(1);
    expect(result.insertId).toBe(99);
  });

  it("update builds correct SQL and calls driver.execute", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.update("users", { name: "Bob" }, { id: 1 });
    const [sql] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(sql).toContain("UPDATE users");
    expect(sql).toContain("SET");
    expect(sql).toContain("WHERE");
  });

  it("update with raw WHERE string passes it through", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.update("users", { active: true }, "id > 0");
    const [sql] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(sql).toContain("WHERE id > 0");
  });

  it("delete builds correct SQL and calls driver.execute", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.delete("users", { id: 5 });
    const [sql, params] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("DELETE FROM users");
    expect(sql).toContain("WHERE");
    expect(params).toContain(5);
  });

  it("delete with raw WHERE string passes it through", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.delete("sessions", "expires_at < NOW()");
    const [sql] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(sql).toContain("WHERE expires_at < NOW()");
  });

  it("close delegates to driver.close", async () => {
    const driver = buildSpyDriver();
    const db = createClientFromDriver(driver);
    await db.close();
    expect(driver.close).toHaveBeenCalledOnce();
  });
});

// ─── transaction ──────────────────────────────────────────────────────────────

describe("transaction", () => {
  it("calls beginTransaction, commits on success, and returns callback result", async () => {
    const txDriver = buildSpyDriver();
    const driver = buildSpyDriver({
      beginTransaction: vi.fn(async () => txDriver),
    });
    const db = createClientFromDriver(driver);

    const result = await db.transaction(async (tx) => {
      await tx.query("SELECT 1");
      return 42;
    });

    expect(driver.beginTransaction).toHaveBeenCalledOnce();
    expect(txDriver.query).toHaveBeenCalledWith("SELECT 1", undefined);
    expect(txDriver.commit).toHaveBeenCalledOnce();
    expect(txDriver.rollback).not.toHaveBeenCalled();
    expect(result).toBe(42);
  });

  it("rolls back and re-throws when the callback throws", async () => {
    const txDriver = buildSpyDriver();
    const driver = buildSpyDriver({
      beginTransaction: vi.fn(async () => txDriver),
    });
    const db = createClientFromDriver(driver);

    await expect(
      db.transaction(async () => {
        throw new Error("oops");
      }),
    ).rejects.toThrow("oops");

    expect(txDriver.rollback).toHaveBeenCalledOnce();
    expect(txDriver.commit).not.toHaveBeenCalled();
  });

  it("nested transaction gets its own tx client", async () => {
    const txDriver = buildSpyDriver();
    const driver = buildSpyDriver({
      beginTransaction: vi.fn(async () => txDriver),
    });
    const db = createClientFromDriver(driver);

    let txClientRef: DatabaseClient | null = null;
    await db.transaction(async (tx) => {
      txClientRef = tx;
    });

    // The tx client should be a different object from the outer db
    expect(txClientRef).not.toBe(db);
  });
});
