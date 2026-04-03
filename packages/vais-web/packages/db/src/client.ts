/**
 * createClient — creates a DatabaseClient instance backed by a driver adapter.
 *
 * Usage:
 *   const db = createClient({ driver: "sqlite", filename: ":memory:" });
 *   await db.query("SELECT 1");
 *   await db.close();
 *
 * To use a real driver, supply a custom Driver implementation via the
 * `createClientFromDriver()` escape-hatch.
 */

import type { DatabaseConfig, DatabaseClient, Driver } from "./types.js";

// ─── No-op / stub driver ─────────────────────────────────────────────────────

/**
 * Stub driver used when no real driver implementation is provided.
 * All operations succeed immediately with empty/no-op results.
 * Replace this with a real adapter (e.g. better-sqlite3, pg, mysql2).
 */
function createStubDriver(): Driver {
  return {
    async query<T = unknown>(_sql: string, _params?: unknown[]): Promise<T[]> {
      return [];
    },

    async execute(
      _sql: string,
      _params?: unknown[],
    ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
      return { rowsAffected: 0 };
    },

    async beginTransaction(): Promise<Driver> {
      // Return a new stub driver scoped to this transaction
      return createStubDriver();
    },

    async commit(): Promise<void> {
      // no-op
    },

    async rollback(): Promise<void> {
      // no-op
    },

    async close(): Promise<void> {
      // no-op
    },
  };
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Build a driver from a DatabaseConfig.
 * Currently returns the stub driver for all backends.
 * Real adapters should be provided at the application level via
 * `createClientFromDriver()`.
 */
function buildDriver(config: DatabaseConfig): Driver {
  switch (config.driver) {
    case "sqlite":
    case "postgres":
    case "mysql":
      // Placeholder — real adapter injection happens at app level.
      return createStubDriver();
    default: {
      const exhaustive: never = config.driver;
      throw new Error(`[vaisx/db] Unknown driver: ${String(exhaustive)}`);
    }
  }
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────

/**
 * Build a parameterised INSERT statement.
 * Returns the SQL string and the ordered parameter values.
 */
function buildInsertSQL(
  table: string,
  data: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const keys = Object.keys(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const columns = keys.join(", ");
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
  return { sql, params: keys.map((k) => data[k]) };
}

/**
 * Build a parameterised UPDATE statement.
 * `where` can be a plain object (equality conditions) or a raw SQL fragment.
 */
function buildUpdateSQL(
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown> | string,
): { sql: string; params: unknown[] } {
  const dataKeys = Object.keys(data);
  const params: unknown[] = dataKeys.map((k) => data[k]);
  let paramIndex = dataKeys.length + 1;

  const setClauses = dataKeys.map((k, i) => `${k} = $${i + 1}`).join(", ");

  let whereClause: string;
  if (typeof where === "string") {
    whereClause = where;
  } else {
    const whereKeys = Object.keys(where);
    whereClause = whereKeys
      .map((k) => {
        const placeholder = `$${paramIndex++}`;
        params.push((where as Record<string, unknown>)[k]);
        return `${k} = ${placeholder}`;
      })
      .join(" AND ");
  }

  const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`;
  return { sql, params };
}

/**
 * Build a parameterised DELETE statement.
 */
function buildDeleteSQL(
  table: string,
  where: Record<string, unknown> | string,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let whereClause: string;

  if (typeof where === "string") {
    whereClause = where;
  } else {
    const whereKeys = Object.keys(where);
    whereClause = whereKeys
      .map((k, i) => {
        params.push((where as Record<string, unknown>)[k]);
        return `${k} = $${i + 1}`;
      })
      .join(" AND ");
  }

  const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
  return { sql, params };
}

// ─── Client builder ───────────────────────────────────────────────────────────

/**
 * Create a DatabaseClient from a Driver instance.
 * This is the low-level escape-hatch for injecting custom adapters.
 */
export function createClientFromDriver(driver: Driver): DatabaseClient {
  const client: DatabaseClient = {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      return driver.query<T>(sql, params);
    },

    async insert<T extends Record<string, unknown>>(
      table: string,
      data: Partial<T>,
    ): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
      const { sql, params } = buildInsertSQL(table, data as Record<string, unknown>);
      return driver.execute(sql, params);
    },

    async update<T extends Record<string, unknown>>(
      table: string,
      data: Partial<T>,
      where: Partial<T> | string,
    ): Promise<{ rowsAffected: number }> {
      const { sql, params } = buildUpdateSQL(
        table,
        data as Record<string, unknown>,
        where as Record<string, unknown> | string,
      );
      return driver.execute(sql, params);
    },

    async delete<T extends Record<string, unknown>>(
      table: string,
      where: Partial<T> | string,
    ): Promise<{ rowsAffected: number }> {
      const { sql, params } = buildDeleteSQL(
        table,
        where as Record<string, unknown> | string,
      );
      return driver.execute(sql, params);
    },

    async transaction<R>(fn: (client: DatabaseClient) => Promise<R>): Promise<R> {
      const txDriver = await driver.beginTransaction();
      const txClient = createClientFromDriver(txDriver);
      try {
        const result = await fn(txClient);
        await txDriver.commit();
        return result;
      } catch (err) {
        await txDriver.rollback();
        throw err;
      }
    },

    async close(): Promise<void> {
      return driver.close();
    },
  };

  return client;
}

/**
 * Create a DatabaseClient from a DatabaseConfig.
 *
 * For real usage supply a proper Driver via `createClientFromDriver()`.
 * The default stub driver is useful for unit tests and type checking.
 */
export function createClient(config: DatabaseConfig): DatabaseClient {
  const driver = buildDriver(config);
  return createClientFromDriver(driver);
}
