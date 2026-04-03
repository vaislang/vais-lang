/**
 * Core type definitions for @vaisx/db.
 * API inspired by Drizzle ORM, adapted for VaisX driver-agnostic architecture.
 */

// ─── Column primitives ────────────────────────────────────────────────────────

/**
 * Supported column scalar types.
 */
export type ColumnType = "string" | "number" | "boolean" | "date" | "json";

/**
 * TypeScript type mapped from a ColumnType literal.
 */
export type InferColumnType<T extends ColumnType> =
  T extends "string" ? string :
  T extends "number" ? number :
  T extends "boolean" ? boolean :
  T extends "date" ? Date :
  T extends "json" ? unknown :
  never;

/**
 * Reference to a foreign key column in another table.
 */
export interface ForeignKeyRef {
  /** Target table name. */
  table: string;
  /** Target column name (defaults to "id"). */
  column?: string;
}

/**
 * Full definition of a single column.
 */
export interface ColumnDef {
  /** Scalar type of the column. */
  type: ColumnType;
  /** Whether this column is the primary key. */
  primaryKey?: boolean;
  /** Whether NULL values are allowed (default: false). */
  nullable?: boolean;
  /** Default value expression or literal. */
  default?: unknown;
  /** Whether a UNIQUE constraint is applied. */
  unique?: boolean;
  /** Foreign key reference. */
  references?: ForeignKeyRef;
}

// ─── Schema & model ───────────────────────────────────────────────────────────

/**
 * A mapping of column names to their definitions.
 */
export type ModelSchema = Record<string, ColumnDef>;

/**
 * Infer the TypeScript shape of a row from a ModelSchema.
 */
export type InferModel<S extends ModelSchema> = {
  [K in keyof S]: S[K]["nullable"] extends true
    ? InferColumnType<S[K]["type"]> | null
    : InferColumnType<S[K]["type"]>;
};

/**
 * Full model definition passed to defineModel().
 */
export interface ModelDefinition<_T = unknown> {
  /** Table / model name (used as the SQL table name). */
  name: string;
  /** Column definitions. */
  schema: ModelSchema;
  /** Automatically add `createdAt` and `updatedAt` timestamp columns. */
  timestamps?: boolean;
}

// ─── Relations ────────────────────────────────────────────────────────────────

/**
 * Describes a relation between two models.
 */
export interface Relation {
  /** Relation cardinality. */
  type: "hasOne" | "hasMany" | "belongsTo";
  /** Name of the related model. */
  model: string;
  /** Name of the foreign key column. */
  foreignKey: string;
}

// ─── Query builder ────────────────────────────────────────────────────────────

/**
 * Join clause descriptor.
 */
export interface JoinClause {
  type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  table: string;
  on: string;
}

/**
 * Order-by clause descriptor.
 */
export interface OrderByClause {
  column: string;
  direction: "ASC" | "DESC";
}

/**
 * Fluent query builder for a model type T.
 * Calls are chainable; `execute()` resolves the query.
 */
export interface QueryBuilder<T> {
  /** Restrict the returned columns. */
  select(columns: (keyof T & string)[]): QueryBuilder<T>;
  /** Add a WHERE condition (raw SQL fragment or structured condition). */
  where(condition: string | Partial<T>): QueryBuilder<T>;
  /** Add an ORDER BY clause. */
  orderBy(column: keyof T & string, direction?: "ASC" | "DESC"): QueryBuilder<T>;
  /** Limit the number of rows returned. */
  limit(n: number): QueryBuilder<T>;
  /** Skip the first n rows. */
  offset(n: number): QueryBuilder<T>;
  /** Add a JOIN clause. */
  join(type: JoinClause["type"], table: string, on: string): QueryBuilder<T>;
  /** Execute the built query and return results. */
  execute(): Promise<T[]>;
}

// ─── Database client ──────────────────────────────────────────────────────────

/**
 * The public database client interface.
 */
export interface DatabaseClient {
  /**
   * Execute a raw SQL query.
   * @param sql  - SQL string (may contain `?` or `$N` placeholders).
   * @param params - Positional parameter values.
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Insert a row into the specified table.
   * Returns the number of affected rows (or an inserted id where supported).
   */
  insert<T extends Record<string, unknown>>(
    table: string,
    data: Partial<T>,
  ): Promise<{ rowsAffected: number; insertId?: number | bigint }>;

  /**
   * Update rows in the specified table matching `where`.
   * Returns the number of affected rows.
   */
  update<T extends Record<string, unknown>>(
    table: string,
    data: Partial<T>,
    where: Partial<T> | string,
  ): Promise<{ rowsAffected: number }>;

  /**
   * Delete rows from the specified table matching `where`.
   * Returns the number of affected rows.
   */
  delete<T extends Record<string, unknown>>(
    table: string,
    where: Partial<T> | string,
  ): Promise<{ rowsAffected: number }>;

  /**
   * Execute a set of operations inside a transaction.
   * If the callback throws, the transaction is rolled back.
   */
  transaction<R>(fn: (client: DatabaseClient) => Promise<R>): Promise<R>;

  /** Close the underlying driver connection / pool. */
  close(): Promise<void>;
}

// ─── Driver adapter ───────────────────────────────────────────────────────────

/**
 * Low-level driver interface that concrete adapters (SQLite, Postgres, MySQL)
 * must implement.  The DatabaseClient delegates to this interface.
 */
export interface Driver {
  /** Execute a query and return all result rows. */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute a statement that does not return rows. */
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; insertId?: number | bigint }>;
  /** Begin a transaction; returns a driver scoped to that transaction. */
  beginTransaction(): Promise<Driver>;
  /** Commit the current transaction. */
  commit(): Promise<void>;
  /** Roll back the current transaction. */
  rollback(): Promise<void>;
  /** Close the underlying connection/pool. */
  close(): Promise<void>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Configuration passed to createClient().
 */
export interface DatabaseConfig {
  /** Which database driver to use. */
  driver: "sqlite" | "postgres" | "mysql";
  /** Connection URL (postgres / mysql). */
  url?: string;
  /** File path for SQLite databases. */
  filename?: string;
  /** Connection pool size (postgres / mysql). */
  poolSize?: number;
}

// ─── Migrations ───────────────────────────────────────────────────────────────

/**
 * A single migration step with an up and a down SQL script.
 */
export interface MigrationStep {
  /** Monotonically increasing migration version number. */
  version: number;
  /** SQL to apply the migration. */
  up: string;
  /** SQL to reverse the migration. */
  down: string;
}
