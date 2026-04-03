/**
 * @vaisx/db — drivers.test.ts
 *
 * Tests for the SQLite, PostgreSQL, and MySQL driver adapters plus the
 * createDriver() factory. All tests run against in-memory mocks — no real
 * database library is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  // Factory
  createDriver,
  // SQLite
  createSQLiteDriver,
  mapToSQLiteType,
  buildSQLiteColumnDef,
  SQLITE_TYPE_MAP,
  // PostgreSQL
  createPostgresDriver,
  mapToPostgresType,
  buildPostgresColumnDef,
  toPostgresParams,
  POSTGRES_TYPE_MAP,
  // MySQL
  createMySQLDriver,
  mapToMySQLType,
  buildMySQLColumnDef,
  MYSQL_TYPE_MAP,
} from "../src/drivers/index.js";

import type {
  SQLiteDatabase,
  SQLiteStatement,
  PoolInterface,
  PoolQueryResult,
  MySQLConnection,
  MySQLResultSetHeader,
} from "../src/drivers/index.js";

import type { Driver } from "../src/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Build a minimal spy SQLiteDatabase. */
function buildMockSQLiteDB(overrides: Partial<SQLiteDatabase> = {}): SQLiteDatabase {
  const mockStmt: SQLiteStatement = {
    run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    all: vi.fn(() => [{ id: 1, name: "Alice" }]),
    get: vi.fn(() => ({ id: 1, name: "Alice" })),
  };

  return {
    prepare: vi.fn(() => mockStmt),
    exec: vi.fn(),
    transaction: vi.fn((fn) => fn),
    close: vi.fn(),
    ...overrides,
  };
}

/** Build a minimal spy PoolInterface for PostgreSQL. */
function buildMockPool(overrides: Partial<PoolInterface> = {}): PoolInterface {
  const defaultResult: PoolQueryResult = { rows: [{ id: 1 }], rowCount: 1, command: "SELECT" };

  return {
    query: vi.fn(async () => defaultResult),
    connect: vi.fn(async () => ({
      query: vi.fn(async () => defaultResult),
      release: vi.fn(),
    })),
    end: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Build a minimal spy MySQLConnection. */
function buildMockMySQLConn(overrides: Partial<MySQLConnection> = {}): MySQLConnection {
  const header: MySQLResultSetHeader = { affectedRows: 1, insertId: 1 };

  return {
    execute: vi.fn(async () => [[{ id: 1, name: "Alice" }], []]),
    query: vi.fn(async () => [[{ id: 1 }], []]),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    ...overrides,
  };

  void header;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SQLite driver
// ═══════════════════════════════════════════════════════════════════════════════

describe("createSQLiteDriver", () => {
  it("returns an object that implements the Driver interface", () => {
    const driver = createSQLiteDriver({ filename: ":memory:" });
    expect(typeof driver.query).toBe("function");
    expect(typeof driver.execute).toBe("function");
    expect(typeof driver.beginTransaction).toBe("function");
    expect(typeof driver.commit).toBe("function");
    expect(typeof driver.rollback).toBe("function");
    expect(typeof driver.close).toBe("function");
  });

  it("exposes the underlying db instance", () => {
    const db = buildMockSQLiteDB();
    const driver = createSQLiteDriver({ filename: ":memory:", database: db });
    expect(driver.db).toBe(db);
  });

  it("query() calls db.prepare and stmt.all", async () => {
    const db = buildMockSQLiteDB();
    const driver = createSQLiteDriver({ filename: ":memory:", database: db });
    const rows = await driver.query("SELECT * FROM users", [1]);
    expect(db.prepare).toHaveBeenCalledWith("SELECT * FROM users");
    expect(rows).toEqual([{ id: 1, name: "Alice" }]);
  });

  it("execute() calls stmt.run and returns rowsAffected + insertId", async () => {
    const db = buildMockSQLiteDB();
    const driver = createSQLiteDriver({ filename: ":memory:", database: db });
    const result = await driver.execute("INSERT INTO users (name) VALUES (?)", ["Bob"]);
    expect(result.rowsAffected).toBe(1);
    expect(result.insertId).toBe(1);
  });

  it("beginTransaction() returns a new driver instance", async () => {
    const driver = createSQLiteDriver({ filename: ":memory:" });
    const txDriver = await driver.beginTransaction();
    expect(txDriver).not.toBe(driver);
    expect(typeof txDriver.query).toBe("function");
  });

  it("close() calls db.close and marks driver as closed", async () => {
    const db = buildMockSQLiteDB();
    const driver = createSQLiteDriver({ filename: ":memory:", database: db });
    await driver.close();
    expect(db.close).toHaveBeenCalledOnce();
  });

  it("query() throws after close()", async () => {
    const driver = createSQLiteDriver({ filename: ":memory:" });
    await driver.close();
    await expect(driver.query("SELECT 1")).rejects.toThrow(/closed/i);
  });

  it("double close() does not call db.close twice", async () => {
    const db = buildMockSQLiteDB();
    const driver = createSQLiteDriver({ filename: ":memory:", database: db });
    await driver.close();
    await driver.close();
    expect(db.close).toHaveBeenCalledOnce();
  });
});

// ─── SQLite type mappings ─────────────────────────────────────────────────────

describe("SQLite type mappings", () => {
  it("maps string -> TEXT", () => {
    expect(mapToSQLiteType("string")).toBe("TEXT");
    expect(SQLITE_TYPE_MAP.string).toBe("TEXT");
  });

  it("maps integer -> INTEGER", () => {
    expect(mapToSQLiteType("integer")).toBe("INTEGER");
    expect(SQLITE_TYPE_MAP.integer).toBe("INTEGER");
  });

  it("maps number -> REAL", () => {
    expect(mapToSQLiteType("number")).toBe("REAL");
    expect(SQLITE_TYPE_MAP.number).toBe("REAL");
  });

  it("maps boolean -> INTEGER (SQLite has no native bool)", () => {
    expect(mapToSQLiteType("boolean")).toBe("INTEGER");
  });

  it("maps date -> TEXT", () => {
    expect(mapToSQLiteType("date")).toBe("TEXT");
  });

  it("maps json -> TEXT", () => {
    expect(mapToSQLiteType("json")).toBe("TEXT");
  });

  it("falls back to TEXT for unknown types", () => {
    expect(mapToSQLiteType("unknown_type")).toBe("TEXT");
  });

  it("buildSQLiteColumnDef generates AUTOINCREMENT for PK columns", () => {
    const col = buildSQLiteColumnDef("id", "integer", {
      primaryKey: true,
      autoIncrement: true,
    });
    expect(col).toContain("INTEGER");
    expect(col).toContain("PRIMARY KEY");
    expect(col).toContain("AUTOINCREMENT");
  });

  it("buildSQLiteColumnDef adds NOT NULL when nullable is false", () => {
    const col = buildSQLiteColumnDef("name", "string", { nullable: false });
    expect(col).toContain("NOT NULL");
  });

  it("buildSQLiteColumnDef adds UNIQUE constraint", () => {
    const col = buildSQLiteColumnDef("email", "string", { unique: true });
    expect(col).toContain("UNIQUE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PostgreSQL driver
// ═══════════════════════════════════════════════════════════════════════════════

describe("createPostgresDriver", () => {
  it("returns an object that implements the Driver interface", () => {
    const driver = createPostgresDriver({});
    expect(typeof driver.query).toBe("function");
    expect(typeof driver.execute).toBe("function");
    expect(typeof driver.beginTransaction).toBe("function");
    expect(typeof driver.commit).toBe("function");
    expect(typeof driver.rollback).toBe("function");
    expect(typeof driver.close).toBe("function");
  });

  it("exposes the underlying pool", () => {
    const pool = buildMockPool();
    const driver = createPostgresDriver({ pool });
    expect(driver.pool).toBe(pool);
  });

  it("query() delegates to pool.query and returns rows", async () => {
    const pool = buildMockPool({
      query: vi.fn(async () => ({ rows: [{ id: 2 }], rowCount: 1, command: "SELECT" })),
    });
    const driver = createPostgresDriver({ pool });
    const rows = await driver.query("SELECT * FROM users WHERE id = $1", [2]);
    expect(pool.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [2]);
    expect(rows).toEqual([{ id: 2 }]);
  });

  it("execute() returns rowsAffected and insertId", async () => {
    const pool = buildMockPool({
      query: vi.fn(async () => ({
        rows: [{ id: 5 }],
        rowCount: 1,
        command: "INSERT",
      })),
    });
    const driver = createPostgresDriver({ pool });
    const result = await driver.execute("INSERT INTO users (name) VALUES ($1)", ["Carol"]);
    expect(result.rowsAffected).toBe(1);
    expect(result.insertId).toBe(5);
  });

  it("close() calls pool.end", async () => {
    const pool = buildMockPool();
    const driver = createPostgresDriver({ pool });
    await driver.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("query() throws after close()", async () => {
    const driver = createPostgresDriver({});
    await driver.close();
    await expect(driver.query("SELECT 1")).rejects.toThrow(/closed/i);
  });

  it("beginTransaction() calls pool.connect and returns tx driver", async () => {
    const pool = buildMockPool();
    const driver = createPostgresDriver({ pool });
    const txDriver = await driver.beginTransaction();
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(typeof txDriver.query).toBe("function");
  });
});

// ─── PostgreSQL type mappings ─────────────────────────────────────────────────

describe("PostgreSQL type mappings", () => {
  it("maps string -> TEXT", () => {
    expect(mapToPostgresType("string")).toBe("TEXT");
    expect(POSTGRES_TYPE_MAP.string).toBe("TEXT");
  });

  it("maps integer -> INTEGER (SERIAL for auto-increment)", () => {
    expect(mapToPostgresType("integer")).toBe("INTEGER");
  });

  it("maps boolean -> BOOLEAN", () => {
    expect(mapToPostgresType("boolean")).toBe("BOOLEAN");
  });

  it("maps date -> TIMESTAMP WITH TIME ZONE", () => {
    expect(mapToPostgresType("date")).toBe("TIMESTAMP WITH TIME ZONE");
    expect(POSTGRES_TYPE_MAP.date).toBe("TIMESTAMP WITH TIME ZONE");
  });

  it("maps json -> JSONB", () => {
    expect(mapToPostgresType("json")).toBe("JSONB");
    expect(POSTGRES_TYPE_MAP.json).toBe("JSONB");
  });

  it("buildPostgresColumnDef uses SERIAL for auto-increment PK", () => {
    const col = buildPostgresColumnDef("id", "integer", {
      primaryKey: true,
      serial: true,
    });
    expect(col).toContain("SERIAL");
    expect(col).toContain("PRIMARY KEY");
  });

  it("toPostgresParams converts ? to $N placeholders", () => {
    const sql = "SELECT * FROM t WHERE a = ? AND b = ?";
    expect(toPostgresParams(sql)).toBe("SELECT * FROM t WHERE a = $1 AND b = $2");
  });

  it("toPostgresParams leaves $N placeholders unchanged", () => {
    const sql = "SELECT * FROM t WHERE id = $1";
    expect(toPostgresParams(sql)).toBe(sql);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MySQL driver
// ═══════════════════════════════════════════════════════════════════════════════

describe("createMySQLDriver", () => {
  it("returns an object that implements the Driver interface", () => {
    const driver = createMySQLDriver({});
    expect(typeof driver.query).toBe("function");
    expect(typeof driver.execute).toBe("function");
    expect(typeof driver.beginTransaction).toBe("function");
    expect(typeof driver.commit).toBe("function");
    expect(typeof driver.rollback).toBe("function");
    expect(typeof driver.close).toBe("function");
  });

  it("exposes the underlying connection", () => {
    const conn = buildMockMySQLConn();
    const driver = createMySQLDriver({ connection: conn });
    expect(driver.connection).toBe(conn);
  });

  it("query() delegates to connection.execute and returns rows", async () => {
    const conn = buildMockMySQLConn({
      execute: vi.fn(async () => [[{ id: 3, name: "Dave" }], []]),
    });
    const driver = createMySQLDriver({ connection: conn });
    const rows = await driver.query<{ id: number; name: string }>(
      "SELECT * FROM users WHERE id = ?",
      [3],
    );
    expect(conn.execute).toHaveBeenCalledWith("SELECT * FROM users WHERE id = ?", [3]);
    expect(rows).toEqual([{ id: 3, name: "Dave" }]);
  });

  it("execute() returns rowsAffected and insertId from ResultSetHeader", async () => {
    const header: MySQLResultSetHeader = { affectedRows: 1, insertId: 7 };
    const conn = buildMockMySQLConn({
      execute: vi.fn(async () => [header, []]),
    });
    const driver = createMySQLDriver({ connection: conn });
    const result = await driver.execute("INSERT INTO users (name) VALUES (?)", ["Eve"]);
    expect(result.rowsAffected).toBe(1);
    expect(result.insertId).toBe(7);
  });

  it("close() calls connection.end", async () => {
    const conn = buildMockMySQLConn();
    const driver = createMySQLDriver({ connection: conn });
    await driver.close();
    expect(conn.end).toHaveBeenCalledOnce();
  });

  it("query() throws after close()", async () => {
    const driver = createMySQLDriver({});
    await driver.close();
    await expect(driver.query("SELECT 1")).rejects.toThrow(/closed/i);
  });

  it("beginTransaction() calls connection.beginTransaction and returns tx driver", async () => {
    const conn = buildMockMySQLConn();
    const driver = createMySQLDriver({ connection: conn });
    const txDriver = await driver.beginTransaction();
    expect(conn.beginTransaction).toHaveBeenCalledOnce();
    expect(typeof txDriver.query).toBe("function");
  });

  it("tx driver commit() calls connection.commit", async () => {
    const conn = buildMockMySQLConn();
    const driver = createMySQLDriver({ connection: conn });
    const txDriver = await driver.beginTransaction();
    await txDriver.commit();
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it("tx driver rollback() calls connection.rollback", async () => {
    const conn = buildMockMySQLConn();
    const driver = createMySQLDriver({ connection: conn });
    const txDriver = await driver.beginTransaction();
    await txDriver.rollback();
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});

// ─── MySQL type mappings ──────────────────────────────────────────────────────

describe("MySQL type mappings", () => {
  it("maps string -> TEXT", () => {
    expect(mapToMySQLType("string")).toBe("TEXT");
    expect(MYSQL_TYPE_MAP.string).toBe("TEXT");
  });

  it("maps integer -> INT", () => {
    expect(mapToMySQLType("integer")).toBe("INT");
    expect(MYSQL_TYPE_MAP.integer).toBe("INT");
  });

  it("maps boolean -> TINYINT(1)", () => {
    expect(mapToMySQLType("boolean")).toBe("TINYINT(1)");
    expect(MYSQL_TYPE_MAP.boolean).toBe("TINYINT(1)");
  });

  it("maps date -> DATETIME", () => {
    expect(mapToMySQLType("date")).toBe("DATETIME");
    expect(MYSQL_TYPE_MAP.date).toBe("DATETIME");
  });

  it("maps json -> JSON", () => {
    expect(mapToMySQLType("json")).toBe("JSON");
    expect(MYSQL_TYPE_MAP.json).toBe("JSON");
  });

  it("falls back to TEXT for unknown types", () => {
    expect(mapToMySQLType("unknown_type")).toBe("TEXT");
  });

  it("buildMySQLColumnDef generates AUTO_INCREMENT for PK columns", () => {
    const col = buildMySQLColumnDef("id", "integer", {
      primaryKey: true,
      autoIncrement: true,
    });
    expect(col).toContain("INT");
    expect(col).toContain("PRIMARY KEY");
    expect(col).toContain("AUTO_INCREMENT");
  });

  it("buildMySQLColumnDef adds NOT NULL when nullable is false", () => {
    const col = buildMySQLColumnDef("name", "string", { nullable: false });
    expect(col).toContain("NOT NULL");
  });

  it("buildMySQLColumnDef uses backtick-quoted column names", () => {
    const col = buildMySQLColumnDef("email", "string");
    expect(col).toMatch(/^`email`/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. createDriver() factory
// ═══════════════════════════════════════════════════════════════════════════════

describe("createDriver factory", () => {
  it("creates a SQLite driver for driver: 'sqlite'", () => {
    const driver = createDriver({ driver: "sqlite", filename: ":memory:" });
    expect(typeof driver.query).toBe("function");
  });

  it("creates a PostgreSQL driver for driver: 'postgres'", () => {
    const driver = createDriver({ driver: "postgres", url: "postgres://localhost/test" });
    expect(typeof driver.query).toBe("function");
  });

  it("creates a MySQL driver for driver: 'mysql'", () => {
    const driver = createDriver({ driver: "mysql", url: "mysql://root@localhost/test" });
    expect(typeof driver.query).toBe("function");
  });

  it("sqlite driver returns rows via query()", async () => {
    const driver = createDriver({ driver: "sqlite", filename: ":memory:" });
    const rows = await driver.query("SELECT 1");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("postgres driver returns rows via query()", async () => {
    const driver = createDriver({ driver: "postgres" });
    const rows = await driver.query("SELECT 1");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("mysql driver returns rows via query()", async () => {
    const driver = createDriver({ driver: "mysql" });
    const rows = await driver.query("SELECT 1");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("all drivers can be closed cleanly", async () => {
    const drivers: Driver[] = [
      createDriver({ driver: "sqlite", filename: ":memory:" }),
      createDriver({ driver: "postgres" }),
      createDriver({ driver: "mysql" }),
    ];
    for (const d of drivers) {
      await expect(d.close()).resolves.toBeUndefined();
    }
  });

  it("throws for an unknown driver type", () => {
    expect(() =>
      createDriver({ driver: "oracle" as "sqlite" }),
    ).toThrow(/unknown driver/i);
  });
});
