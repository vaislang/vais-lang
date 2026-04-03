/**
 * MySQL driver adapter.
 *
 * Implements the Driver interface using a mysql2-style connection interface
 * without importing the actual `mysql2` library. All interactions go through
 * the abstract MySQLConnection interface so a real mysql2 connection/pool
 * can be injected at runtime.
 *
 * MySQL-specific type mappings:
 *   string  -> VARCHAR / TEXT
 *   number  -> DOUBLE / DECIMAL
 *   integer -> INT (AUTO_INCREMENT for primary keys)
 *   boolean -> TINYINT(1)
 *   date    -> DATETIME
 *   json    -> JSON
 *
 * Parameter placeholders use the ? style.
 */

import type { Driver } from "../types.js";

// ─── MySQL type mappings ──────────────────────────────────────────────────────

/**
 * Maps a logical ColumnType to the corresponding MySQL type.
 */
export const MYSQL_TYPE_MAP = {
  string: "TEXT",
  number: "DOUBLE",
  integer: "INT",
  boolean: "TINYINT(1)",
  date: "DATETIME",
  json: "JSON",
} as const;

export type MySQLColumnType = keyof typeof MYSQL_TYPE_MAP;
export type MySQLSQLType = (typeof MYSQL_TYPE_MAP)[MySQLColumnType];

/**
 * Map a logical ColumnType string to a MySQL type string.
 */
export function mapToMySQLType(type: string): string {
  return (MYSQL_TYPE_MAP as Record<string, string>)[type] ?? "TEXT";
}

/**
 * Generate a column definition fragment for a MySQL CREATE TABLE statement.
 */
export function buildMySQLColumnDef(
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
  const sqlType = mapToMySQLType(type);
  const parts: string[] = [`\`${name}\` ${sqlType}`];

  if (!opts.nullable && !opts.primaryKey) {
    parts.push("NOT NULL");
  }

  if (opts.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  // MySQL uses AUTO_INCREMENT keyword (not AUTOINCREMENT)
  if (opts.autoIncrement) {
    parts.push("AUTO_INCREMENT");
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

// ─── MySQL connection interface (mysql2 style) ────────────────────────────────

/**
 * Result metadata returned by a MySQL execute/query call.
 */
export interface MySQLResultSetHeader {
  affectedRows: number;
  insertId: number;
  changedRows?: number;
}

/**
 * Minimal subset of the mysql2 Connection / Pool interface.
 */
export interface MySQLConnection {
  /** Execute a parameterised query and return [rows, fields]. */
  execute<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<[T[] | MySQLResultSetHeader, unknown]>;
  /** Execute a raw query (no parameter escaping). */
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<[T[] | MySQLResultSetHeader, unknown]>;
  /** Begin a transaction. */
  beginTransaction(): Promise<void>;
  /** Commit the current transaction. */
  commit(): Promise<void>;
  /** Roll back the current transaction. */
  rollback(): Promise<void>;
  /** Release the connection back to the pool (pool connections only). */
  release?(): void;
  /** Close / destroy the connection. */
  end(): Promise<void>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface MySQLConfig {
  /** MySQL connection URL, e.g. "mysql://user:pass@host/db". */
  url?: string;
  /** Connection pool size (default: 10). */
  poolSize?: number;
  /** Inject a custom MySQLConnection implementation (useful for testing). */
  connection?: MySQLConnection;
}

// ─── In-memory mock connection ────────────────────────────────────────────────

/**
 * Lightweight in-memory connection mock used when no real mysql2 binding is
 * provided.
 */
function createMockConnection(): MySQLConnection {
  const tables: Map<string, unknown[]> = new Map();
  let lastInsertId = 0;
  let inTransaction = false;

  function parseTableName(sql: string): string {
    const match = sql.match(
      /(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+[`"']?(\w+)[`"']?/i,
    );
    return match?.[1] ?? "__unknown__";
  }

  async function runSQL<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<[T[] | MySQLResultSetHeader, unknown]> {
    const upper = sql.trim().toUpperCase();
    const table = parseTableName(sql);

    if (upper.startsWith("INSERT")) {
      const tableRows = tables.get(table) ?? [];
      const colCount = params?.length ?? 0;
      const row: Record<string, unknown> = {};
      for (let i = 0; i < colCount; i++) {
        row[`col${i}`] = params![i];
      }
      lastInsertId++;
      row["id"] = lastInsertId;
      tableRows.push(row);
      tables.set(table, tableRows);
      const header: MySQLResultSetHeader = { affectedRows: 1, insertId: lastInsertId };
      return [header, []];
    }

    if (upper.startsWith("UPDATE")) {
      const tableRows = tables.get(table) ?? [];
      const header: MySQLResultSetHeader = {
        affectedRows: tableRows.length,
        insertId: 0,
        changedRows: tableRows.length,
      };
      return [header, []];
    }

    if (upper.startsWith("DELETE")) {
      const tableRows = tables.get(table) ?? [];
      const count = tableRows.length;
      tables.set(table, []);
      const header: MySQLResultSetHeader = { affectedRows: count, insertId: 0 };
      return [header, []];
    }

    if (upper.startsWith("SELECT")) {
      const tableRows = (tables.get(table) ?? []) as T[];
      return [tableRows, []];
    }

    const header: MySQLResultSetHeader = { affectedRows: 0, insertId: 0 };
    return [header, []];
  }

  return {
    execute: runSQL,
    query: runSQL,
    async beginTransaction() {
      inTransaction = true;
    },
    async commit() {
      inTransaction = false;
    },
    async rollback() {
      inTransaction = false;
    },
    async end() {},
  };

  void inTransaction; // suppress unused variable warning
}

// ─── Helper: detect if result is a ResultSetHeader ───────────────────────────

function isResultSetHeader(value: unknown): value is MySQLResultSetHeader {
  return (
    typeof value === "object" &&
    value !== null &&
    "affectedRows" in value &&
    "insertId" in value
  );
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a MySQL Driver instance.
 *
 * When `config.connection` is provided it is used directly; otherwise a
 * lightweight in-memory mock is used. In a real application you would pass
 * a connection/pool from the `mysql2/promise` package.
 *
 * @example
 * ```ts
 * import mysql from "mysql2/promise";
 * const conn = await mysql.createConnection({ uri: config.url });
 * const driver = createMySQLDriver({ url: config.url, connection: conn });
 * ```
 */
export function createMySQLDriver(config: MySQLConfig): Driver & {
  /** Expose the underlying connection for advanced usage. */
  readonly connection: MySQLConnection;
} {
  const connection: MySQLConnection = config.connection ?? createMockConnection();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("[MySQLDriver] Connection is already closed.");
  }

  const driver: Driver & { readonly connection: MySQLConnection } = {
    get connection() {
      return connection;
    },

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      assertOpen();
      const [result] = await connection.execute<T>(sql, params);
      if (Array.isArray(result)) {
        return result as T[];
      }
      return [];
    },

    async execute(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
      assertOpen();
      const [result] = await connection.execute(sql, params);
      if (isResultSetHeader(result)) {
        return {
          rowsAffected: result.affectedRows,
          insertId: result.insertId,
        };
      }
      return { rowsAffected: 0 };
    },

    async beginTransaction(): Promise<Driver> {
      assertOpen();
      await connection.beginTransaction();

      let txEnded = false;

      function assertTxOpen(): void {
        if (txEnded) throw new Error("[MySQLDriver] Transaction is already closed.");
      }

      const txDriver: Driver = {
        async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
          assertTxOpen();
          const [result] = await connection.execute<T>(sql, params);
          if (Array.isArray(result)) return result as T[];
          return [];
        },

        async execute(
          sql: string,
          params?: unknown[],
        ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
          assertTxOpen();
          const [result] = await connection.execute(sql, params);
          if (isResultSetHeader(result)) {
            return { rowsAffected: result.affectedRows, insertId: result.insertId };
          }
          return { rowsAffected: 0 };
        },

        async beginTransaction(): Promise<Driver> {
          // Nested transactions: return self (real impl would use SAVEPOINT).
          return txDriver;
        },

        async commit(): Promise<void> {
          assertTxOpen();
          txEnded = true;
          await connection.commit();
        },

        async rollback(): Promise<void> {
          assertTxOpen();
          txEnded = true;
          await connection.rollback();
        },

        async close(): Promise<void> {
          if (!txEnded) {
            txEnded = true;
            connection.release?.();
          }
        },
      };

      return txDriver;
    },

    async commit(): Promise<void> {
      // No-op on the connection-level driver.
    },

    async rollback(): Promise<void> {
      // No-op on the connection-level driver.
    },

    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        await connection.end();
      }
    },
  };

  return driver;
}
