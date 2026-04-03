/**
 * Driver adapters — public API.
 *
 * Re-exports all concrete driver factories plus the `createDriver()` factory
 * function that selects the right adapter based on a DatabaseConfig.
 */

export {
  createSQLiteDriver,
  mapToSQLiteType,
  buildSQLiteColumnDef,
  SQLITE_TYPE_MAP,
} from "./sqlite.js";
export type {
  SQLiteConfig,
  SQLiteDatabase,
  SQLiteStatement,
  SQLiteColumnType,
  SQLiteAffinity,
} from "./sqlite.js";

export {
  createPostgresDriver,
  mapToPostgresType,
  buildPostgresColumnDef,
  toPostgresParams,
  POSTGRES_TYPE_MAP,
} from "./postgres.js";
export type {
  PostgresConfig,
  PoolInterface,
  PoolClient,
  PoolQueryResult,
  PostgresColumnType,
  PostgresSQLType,
} from "./postgres.js";

export {
  createMySQLDriver,
  mapToMySQLType,
  buildMySQLColumnDef,
  MYSQL_TYPE_MAP,
} from "./mysql.js";
export type {
  MySQLConfig,
  MySQLConnection,
  MySQLResultSetHeader,
  MySQLColumnType,
  MySQLSQLType,
} from "./mysql.js";

// ─── Generic factory ──────────────────────────────────────────────────────────

import type { Driver, DatabaseConfig } from "../types.js";
import { createSQLiteDriver } from "./sqlite.js";
import { createPostgresDriver } from "./postgres.js";
import { createMySQLDriver } from "./mysql.js";

/**
 * Create the appropriate Driver instance from a DatabaseConfig.
 *
 * - `"sqlite"` → SQLiteDriver (uses `:memory:` if `filename` is omitted)
 * - `"postgres"` → PostgresDriver (uses mock pool if no real pool injected)
 * - `"mysql"` → MySQLDriver (uses mock connection if no real connection injected)
 *
 * @example
 * ```ts
 * const driver = createDriver({ driver: "sqlite", filename: ":memory:" });
 * const rows = await driver.query("SELECT 1");
 * await driver.close();
 * ```
 */
export function createDriver(config: DatabaseConfig): Driver {
  switch (config.driver) {
    case "sqlite":
      return createSQLiteDriver({ filename: config.filename ?? ":memory:" });

    case "postgres":
      return createPostgresDriver({ url: config.url, poolSize: config.poolSize });

    case "mysql":
      return createMySQLDriver({ url: config.url, poolSize: config.poolSize });

    default: {
      const exhaustive: never = config.driver;
      throw new Error(`[createDriver] Unknown driver type: ${String(exhaustive)}`);
    }
  }
}
