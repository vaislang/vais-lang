/**
 * PostgreSQL driver adapter.
 *
 * Implements the Driver interface using a pg-style connection pool interface
 * without importing the actual `pg` library. All interactions go through
 * the abstract PoolInterface so a real pg.Pool can be injected at runtime.
 *
 * PostgreSQL-specific type mappings:
 *   string  -> TEXT / VARCHAR
 *   number  -> NUMERIC / FLOAT8
 *   integer -> INTEGER / SERIAL (auto-increment)
 *   boolean -> BOOLEAN
 *   date    -> TIMESTAMP WITH TIME ZONE
 *   json    -> JSONB
 *
 * Parameter placeholders use the $1, $2, ... style.
 */

import type { Driver } from "../types.js";

// ─── PostgreSQL type mappings ─────────────────────────────────────────────────

/**
 * Maps a logical ColumnType to the corresponding PostgreSQL type.
 */
export const POSTGRES_TYPE_MAP = {
  string: "TEXT",
  number: "NUMERIC",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  date: "TIMESTAMP WITH TIME ZONE",
  json: "JSONB",
} as const;

export type PostgresColumnType = keyof typeof POSTGRES_TYPE_MAP;
export type PostgresSQLType = (typeof POSTGRES_TYPE_MAP)[PostgresColumnType];

/**
 * Map a logical ColumnType string to a PostgreSQL type string.
 */
export function mapToPostgresType(type: string): string {
  return (POSTGRES_TYPE_MAP as Record<string, string>)[type] ?? "TEXT";
}

/**
 * Generate a column definition fragment for a PostgreSQL CREATE TABLE statement.
 */
export function buildPostgresColumnDef(
  name: string,
  type: string,
  opts: {
    primaryKey?: boolean;
    serial?: boolean;
    nullable?: boolean;
    unique?: boolean;
    defaultValue?: unknown;
  } = {},
): string {
  // SERIAL is the PostgreSQL auto-increment type (replaces INTEGER + AUTOINCREMENT)
  const pgType = opts.serial ? "SERIAL" : mapToPostgresType(type);
  const parts: string[] = [`${name} ${pgType}`];

  if (opts.primaryKey) {
    parts.push("PRIMARY KEY");
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

/**
 * Convert positional ? placeholders to PostgreSQL $N style.
 * If the SQL already uses $N placeholders it is returned unchanged.
 */
export function toPostgresParams(sql: string): string {
  if (sql.includes("$1")) return sql; // already using $N style
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// ─── Connection pool interface (pg style) ─────────────────────────────────────

/**
 * Result set returned by a pool query.
 */
export interface PoolQueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
  command: string;
}

/**
 * A single client checked out from the pool.
 */
export interface PoolClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<PoolQueryResult<T>>;
  release(err?: boolean | Error): void;
}

/**
 * Minimal subset of the pg.Pool interface.
 */
export interface PoolInterface {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<PoolQueryResult<T>>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface PostgresConfig {
  /** PostgreSQL connection URL, e.g. "postgres://user:pass@host/db". */
  url?: string;
  /** Connection pool size (default: 10). */
  poolSize?: number;
  /** Inject a custom pool implementation (useful for testing). */
  pool?: PoolInterface;
}

// ─── In-memory mock pool ──────────────────────────────────────────────────────

/**
 * Lightweight in-memory pool mock. Used when no real pg.Pool is provided.
 */
function createMockPool(): PoolInterface {
  const tables: Map<string, unknown[]> = new Map();
  let rowCount = 0;

  function parseTableName(sql: string): string {
    const match = sql.match(
      /(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["']?(\w+)["']?/i,
    );
    return match?.[1] ?? "__unknown__";
  }

  async function runQuery<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<PoolQueryResult<T>> {
    const upper = sql.trim().toUpperCase();
    const table = parseTableName(sql);

    if (upper.startsWith("INSERT")) {
      const tableRows = tables.get(table) ?? [];
      const colCount = params?.length ?? 0;
      const row: Record<string, unknown> = {};
      for (let i = 0; i < colCount; i++) {
        row[`col${i}`] = params![i];
      }
      rowCount++;
      row["id"] = rowCount;
      tableRows.push(row);
      tables.set(table, tableRows);
      return { rows: [row] as T[], rowCount: 1, command: "INSERT" };
    }

    if (upper.startsWith("UPDATE")) {
      const tableRows = tables.get(table) ?? [];
      return { rows: [] as T[], rowCount: tableRows.length, command: "UPDATE" };
    }

    if (upper.startsWith("DELETE")) {
      const tableRows = tables.get(table) ?? [];
      const count = tableRows.length;
      tables.set(table, []);
      return { rows: [] as T[], rowCount: count, command: "DELETE" };
    }

    if (upper.startsWith("SELECT")) {
      const tableRows = tables.get(table) ?? [];
      return { rows: tableRows as T[], rowCount: tableRows.length, command: "SELECT" };
    }

    return { rows: [], rowCount: 0, command: "OTHER" };
  }

  const mockClient: PoolClient = {
    query: runQuery,
    release() {},
  };

  return {
    query: runQuery,
    async connect() {
      return mockClient;
    },
    async end() {},
  };
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a PostgreSQL Driver instance backed by a connection pool.
 *
 * When `config.pool` is provided it is used directly; otherwise a lightweight
 * in-memory mock pool is used. In a real application you would pass a
 * `new Pool({ connectionString: config.url })` from the `pg` package.
 *
 * @example
 * ```ts
 * import { Pool } from "pg";
 * const driver = createPostgresDriver({
 *   url: "postgres://user:pass@host/db",
 *   pool: new Pool({ connectionString: "postgres://user:pass@host/db" }),
 * });
 * ```
 */
export function createPostgresDriver(config: PostgresConfig): Driver & {
  /** Expose the underlying pool for advanced usage (e.g. pool.connect()). */
  readonly pool: PoolInterface;
} {
  const pool: PoolInterface = config.pool ?? createMockPool();
  let ended = false;

  function assertOpen(): void {
    if (ended) throw new Error("[PostgresDriver] Connection pool is already closed.");
  }

  const driver: Driver & { readonly pool: PoolInterface } = {
    get pool() {
      return pool;
    },

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      assertOpen();
      const normalised = toPostgresParams(sql);
      const result = await pool.query<T>(normalised, params);
      return result.rows;
    },

    async execute(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
      assertOpen();
      const normalised = toPostgresParams(sql);
      const result = await pool.query(normalised, params);
      // For INSERT ... RETURNING id the first row may contain the id
      const firstRow = result.rows[0] as Record<string, unknown> | undefined;
      const insertId =
        firstRow?.["id"] !== undefined ? Number(firstRow["id"]) : undefined;
      return {
        rowsAffected: result.rowCount ?? 0,
        insertId,
      };
    },

    async beginTransaction(): Promise<Driver> {
      assertOpen();
      const client = await pool.connect();
      await client.query("BEGIN");

      let txEnded = false;

      function assertTxOpen(): void {
        if (txEnded) throw new Error("[PostgresDriver] Transaction is already closed.");
      }

      const txDriver: Driver = {
        async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
          assertTxOpen();
          const normalised = toPostgresParams(sql);
          const result = await client.query<T>(normalised, params);
          return result.rows;
        },

        async execute(
          sql: string,
          params?: unknown[],
        ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
          assertTxOpen();
          const normalised = toPostgresParams(sql);
          const result = await client.query(normalised, params);
          const firstRow = result.rows[0] as Record<string, unknown> | undefined;
          const insertId =
            firstRow?.["id"] !== undefined ? Number(firstRow["id"]) : undefined;
          return { rowsAffected: result.rowCount ?? 0, insertId };
        },

        async beginTransaction(): Promise<Driver> {
          // Nested transactions use SAVEPOINT in real pg; return self here.
          return txDriver;
        },

        async commit(): Promise<void> {
          assertTxOpen();
          await client.query("COMMIT");
          txEnded = true;
          client.release();
        },

        async rollback(): Promise<void> {
          assertTxOpen();
          await client.query("ROLLBACK");
          txEnded = true;
          client.release();
        },

        async close(): Promise<void> {
          if (!txEnded) {
            txEnded = true;
            client.release();
          }
        },
      };

      return txDriver;
    },

    async commit(): Promise<void> {
      // No-op on the pool-level driver; commit is called on the tx driver.
    },

    async rollback(): Promise<void> {
      // No-op on the pool-level driver; rollback is called on the tx driver.
    },

    async close(): Promise<void> {
      if (!ended) {
        ended = true;
        await pool.end();
      }
    },
  };

  return driver;
}
