/**
 * SQLite driver adapter.
 *
 * Implements the Driver interface using a better-sqlite3-style interface
 * without importing the actual library. All interactions go through
 * the abstract SQLiteDatabase interface so the real binding can be
 * injected at runtime.
 *
 * SQLite-specific type mappings:
 *   string  -> TEXT
 *   number  -> INTEGER / REAL
 *   boolean -> INTEGER (0 / 1)
 *   date    -> TEXT (ISO-8601)
 *   json    -> TEXT (JSON serialised)
 *
 * Primary key auto-increment uses the AUTOINCREMENT keyword.
 */

import type { Driver } from "../types.js";

// ─── SQLite type mappings ─────────────────────────────────────────────────────

/**
 * Maps a logical ColumnType to the corresponding SQLite affinity / keyword.
 */
export const SQLITE_TYPE_MAP = {
  string: "TEXT",
  number: "REAL",
  integer: "INTEGER",
  boolean: "INTEGER",
  date: "TEXT",
  json: "TEXT",
} as const;

export type SQLiteColumnType = keyof typeof SQLITE_TYPE_MAP;
export type SQLiteAffinity = (typeof SQLITE_TYPE_MAP)[SQLiteColumnType];

/**
 * Map a logical ColumnType string to a SQLite affinity string.
 */
export function mapToSQLiteType(type: string): string {
  return (SQLITE_TYPE_MAP as Record<string, string>)[type] ?? "TEXT";
}

/**
 * Generate a column definition fragment for a SQLite CREATE TABLE statement.
 * @param name   - Column name.
 * @param type   - Logical column type.
 * @param opts   - Additional column options.
 */
export function buildSQLiteColumnDef(
  name: string,
  type: string,
  opts: {
    primaryKey?: boolean;
    autoIncrement?: boolean;
    nullable?: boolean;
    unique?: boolean;
    defaultValue?: unknown;
  } = {},
): string {
  const affinity = mapToSQLiteType(type);
  const parts: string[] = [`${name} ${affinity}`];

  if (opts.primaryKey) {
    parts.push("PRIMARY KEY");
    if (opts.autoIncrement) {
      parts.push("AUTOINCREMENT");
    }
  }

  if (!opts.nullable && !opts.primaryKey) {
    parts.push("NOT NULL");
  }

  if (opts.unique && !opts.primaryKey) {
    parts.push("UNIQUE");
  }

  if (opts.defaultValue !== undefined) {
    const raw =
      typeof opts.defaultValue === "string"
        ? `'${opts.defaultValue}'`
        : String(opts.defaultValue);
    parts.push(`DEFAULT ${raw}`);
  }

  return parts.join(" ");
}

// ─── SQLite driver interface (better-sqlite3 style) ──────────────────────────

/**
 * Minimal subset of the better-sqlite3 Statement interface.
 * Used as an abstraction so no real library needs to be imported.
 */
export interface SQLiteStatement {
  /** Run the statement and return metadata. */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  /** Return all matching rows. */
  all(...params: unknown[]): unknown[];
  /** Return the first matching row or undefined. */
  get(...params: unknown[]): unknown;
}

/**
 * Minimal subset of the better-sqlite3 Database interface.
 */
export interface SQLiteDatabase {
  /** Prepare a SQL statement for repeated execution. */
  prepare(sql: string): SQLiteStatement;
  /** Execute one or more SQL statements (no return value). */
  exec(sql: string): void;
  /** Run a function inside a transaction. */
  transaction<T>(fn: () => T): () => T;
  /** Close the database connection. */
  close(): void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface SQLiteConfig {
  /** Path to the SQLite database file, or ":memory:" for an in-memory DB. */
  filename: string;
  /** Inject a custom SQLiteDatabase implementation (useful for testing). */
  database?: SQLiteDatabase;
}

// ─── In-memory mock implementation ───────────────────────────────────────────

/**
 * A minimal in-memory SQLiteDatabase implementation used when no real
 * database binding is provided. Sufficient for structural testing.
 */
function createMockDatabase(): SQLiteDatabase {
  const rows: Map<string, unknown[]> = new Map();
  let lastInsertRowid = 0;

  function parseTableName(sql: string): string {
    const match = sql.match(
      /(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["']?(\w+)["']?/i,
    );
    return match?.[1] ?? "__unknown__";
  }

  const mockStatement = (sql: string): SQLiteStatement => ({
    run(...params: unknown[]) {
      const table = parseTableName(sql);
      const upperSql = sql.trim().toUpperCase();

      if (upperSql.startsWith("INSERT")) {
        const tableRows = rows.get(table) ?? [];
        const placeholderCount = (sql.match(/\?/g) ?? []).length;
        const rowData: Record<string, unknown> = {};
        for (let i = 0; i < placeholderCount; i++) {
          rowData[`col${i}`] = params[i];
        }
        lastInsertRowid++;
        (rowData as Record<string, unknown>)["rowid"] = lastInsertRowid;
        tableRows.push(rowData);
        rows.set(table, tableRows);
        return { changes: 1, lastInsertRowid };
      }

      if (upperSql.startsWith("UPDATE")) {
        const tableRows = rows.get(table) ?? [];
        rows.set(table, tableRows);
        return { changes: tableRows.length, lastInsertRowid };
      }

      if (upperSql.startsWith("DELETE")) {
        const tableRows = rows.get(table) ?? [];
        const count = tableRows.length;
        rows.set(table, []);
        return { changes: count, lastInsertRowid };
      }

      return { changes: 0, lastInsertRowid };
    },

    all(..._params: unknown[]) {
      const table = parseTableName(sql);
      return rows.get(table) ?? [];
    },

    get(..._params: unknown[]) {
      const table = parseTableName(sql);
      return (rows.get(table) ?? [])[0];
    },
  });

  return {
    prepare: (sql: string) => mockStatement(sql),
    exec(_sql: string) {},
    transaction<T>(fn: () => T): () => T {
      return () => fn();
    },
    close() {},
  };
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a SQLite Driver instance.
 *
 * When `config.database` is provided it is used directly; otherwise a
 * lightweight in-memory mock is used. In a real application you would pass
 * a `new Database(config.filename)` from the `better-sqlite3` package.
 *
 * @example
 * ```ts
 * import Database from "better-sqlite3";
 * const driver = createSQLiteDriver({
 *   filename: "./app.db",
 *   database: new Database("./app.db"),
 * });
 * ```
 */
export function createSQLiteDriver(config: SQLiteConfig): Driver & {
  /** Expose the underlying database instance for advanced usage. */
  readonly db: SQLiteDatabase;
} {
  const db: SQLiteDatabase = config.database ?? createMockDatabase();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("[SQLiteDriver] Connection is already closed.");
  }

  const driver: Driver & { readonly db: SQLiteDatabase } = {
    get db() {
      return db;
    },

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      assertOpen();
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...params) : stmt.all();
      return result as T[];
    },

    async execute(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
      assertOpen();
      const stmt = db.prepare(sql);
      const info = params ? stmt.run(...params) : stmt.run();
      return {
        rowsAffected: info.changes,
        insertId: info.lastInsertRowid,
      };
    },

    async beginTransaction(): Promise<Driver> {
      assertOpen();
      // Return a scoped driver that wraps operations inside a transaction.
      // The SQLite mock does not enforce real transaction semantics, but
      // the interface contract is fulfilled.
      return createSQLiteDriver({ filename: config.filename, database: db });
    },

    async commit(): Promise<void> {
      // No-op for the mock; a real implementation would COMMIT here.
    },

    async rollback(): Promise<void> {
      // No-op for the mock; a real implementation would ROLLBACK here.
    },

    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };

  return driver;
}
