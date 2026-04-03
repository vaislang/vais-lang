/**
 * query.ts — Type-safe SQL query builder for @vaisx/db.
 *
 * Provides fluent builder APIs for SELECT, INSERT, UPDATE, and DELETE
 * statements with positional parameters ($1, $2, …) to prevent SQL injection.
 *
 * Usage:
 *   const { sql, params } = createQueryBuilder<User>("users")
 *     .select("id", "email")
 *     .where("active", "=", true)
 *     .orderBy("createdAt", "DESC")
 *     .limit(10)
 *     .toSQL();
 */

import type { Driver } from "./types.js";

// ─── Operator types ───────────────────────────────────────────────────────────

/**
 * Supported WHERE / HAVING comparison operators.
 */
export type ComparisonOperator =
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "LIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL";

/**
 * Join type.
 */
export type JoinType = "INNER" | "LEFT" | "RIGHT";

// ─── Internal condition shape ─────────────────────────────────────────────────

type ConditionConnector = "AND" | "OR";

interface WhereCondition {
  connector: ConditionConnector;
  /** Raw SQL fragment (with placeholders already substituted). */
  fragment: string;
  /** Parameter values for this condition. */
  params: unknown[];
}

// ─── toSQL result ─────────────────────────────────────────────────────────────

/**
 * The result of calling `.toSQL()` on any builder.
 */
export interface SQLResult {
  /** The SQL string with positional `$N` placeholders. */
  sql: string;
  /** The ordered parameter values that correspond to each `$N` placeholder. */
  params: unknown[];
}

// ─── Helper: build a WHERE/HAVING fragment ────────────────────────────────────

/**
 * Build the SQL fragment and params for a single condition.
 * For operators that take no value (`IS NULL`, `IS NOT NULL`) no placeholder is
 * emitted and the returned `params` array is empty.
 * For `IN` the value must be an array; each element gets its own placeholder.
 */
function buildConditionFragment(
  column: string,
  op: ComparisonOperator,
  value: unknown,
  startIndex: number,
): { fragment: string; params: unknown[] } {
  if (op === "IS NULL") {
    return { fragment: `${column} IS NULL`, params: [] };
  }
  if (op === "IS NOT NULL") {
    return { fragment: `${column} IS NOT NULL`, params: [] };
  }
  if (op === "IN") {
    const arr = Array.isArray(value) ? value : [value];
    const placeholders = arr.map((_, i) => `$${startIndex + i}`).join(", ");
    return { fragment: `${column} IN (${placeholders})`, params: arr };
  }
  // Default: single value operator
  return {
    fragment: `${column} ${op} $${startIndex}`,
    params: [value],
  };
}

// ─── QueryBuilder ─────────────────────────────────────────────────────────────

/**
 * Fluent SELECT query builder.
 * Type parameter `T` is the row shape — used to provide compile-time column
 * name suggestions.
 */
export class QueryBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table: string;
  private _columns: string[] = [];
  private _conditions: WhereCondition[] = [];
  private _orderBy: Array<{ column: string; direction: "ASC" | "DESC" }> = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _joins: Array<{ type: JoinType; table: string; on: string }> = [];
  private _groupBy: string[] = [];
  private _havingConditions: WhereCondition[] = [];

  constructor(table: string) {
    this._table = table;
  }

  // ── select ─────────────────────────────────────────────────────────────────

  /**
   * Restrict the columns returned by the query.
   * If never called the query defaults to `SELECT *`.
   */
  select(...columns: (keyof T & string)[]): this {
    this._columns = columns as string[];
    return this;
  }

  // ── where / andWhere / orWhere ─────────────────────────────────────────────

  /**
   * Add a WHERE condition (implicitly `AND` when chained after another).
   * The first condition on the builder is always treated as the root condition
   * (no leading `AND`/`OR` connector in the final SQL — they are joined later).
   */
  where(column: keyof T & string, op: ComparisonOperator, value?: unknown): this {
    return this._addCondition("AND", column as string, op, value);
  }

  /** Add a condition joined with AND. */
  andWhere(column: keyof T & string, op: ComparisonOperator, value?: unknown): this {
    return this._addCondition("AND", column as string, op, value);
  }

  /** Add a condition joined with OR. */
  orWhere(column: keyof T & string, op: ComparisonOperator, value?: unknown): this {
    return this._addCondition("OR", column as string, op, value);
  }

  private _addCondition(
    connector: ConditionConnector,
    column: string,
    op: ComparisonOperator,
    value: unknown,
  ): this {
    // We defer computing the final $N index until toSQL() so that we can
    // accumulate conditions first and then number them correctly.
    this._conditions.push({
      connector,
      // Store un-numbered — we'll re-process in toSQL()
      fragment: `__PENDING__:${column}:${op}`,
      params: Array.isArray(value) ? value : value !== undefined ? [value] : [],
    });
    return this;
  }

  // ── join ───────────────────────────────────────────────────────────────────

  /**
   * Add a JOIN clause.
   * @param table - The table to join.
   * @param on    - The ON condition (raw SQL, e.g. `"users.id = posts.userId"`).
   * @param type  - Join type: `"INNER"` (default), `"LEFT"`, or `"RIGHT"`.
   */
  join(table: string, on: string, type: JoinType = "INNER"): this {
    this._joins.push({ type, table, on });
    return this;
  }

  // ── groupBy / having ───────────────────────────────────────────────────────

  /** Add a GROUP BY clause. */
  groupBy(...columns: (keyof T & string)[]): this {
    this._groupBy = columns as string[];
    return this;
  }

  /** Add a HAVING condition. */
  having(column: string, op: ComparisonOperator, value?: unknown): this {
    this._havingConditions.push({
      connector: "AND",
      fragment: `__PENDING__:${column}:${op}`,
      params: Array.isArray(value) ? value : value !== undefined ? [value] : [],
    });
    return this;
  }

  // ── orderBy / limit / offset ───────────────────────────────────────────────

  /** Add an ORDER BY clause. */
  orderBy(column: keyof T & string, direction: "ASC" | "DESC" = "ASC"): this {
    this._orderBy.push({ column: column as string, direction });
    return this;
  }

  /** Limit the number of rows returned. */
  limit(n: number): this {
    this._limit = n;
    return this;
  }

  /** Skip the first `n` rows. */
  offset(n: number): this {
    this._offset = n;
    return this;
  }

  // ── toSQL ──────────────────────────────────────────────────────────────────

  /**
   * Compile the builder state into a SQL string and positional parameter array.
   */
  toSQL(): SQLResult {
    const allParams: unknown[] = [];
    let paramIndex = 1;

    // Helper: assign $N to a pending condition fragment
    function resolveConditions(conditions: WhereCondition[]): string[] {
      return conditions.map((cond) => {
        const match = /^__PENDING__:(.+):(.+)$/.exec(cond.fragment);
        if (!match) {
          // Already resolved (should not happen, but handle gracefully)
          allParams.push(...cond.params);
          return cond.fragment;
        }
        const column = match[1];
        const op = match[2] as ComparisonOperator;

        if (op === "IS NULL") {
          return `${column} IS NULL`;
        }
        if (op === "IS NOT NULL") {
          return `${column} IS NOT NULL`;
        }
        if (op === "IN") {
          const arr = cond.params;
          const placeholders = arr.map(() => `$${paramIndex++}`).join(", ");
          allParams.push(...arr);
          return `${column} IN (${placeholders})`;
        }
        // Single-value operators
        const placeholder = `$${paramIndex++}`;
        allParams.push(cond.params[0]);
        return `${column} ${op} ${placeholder}`;
      });
    }

    // SELECT
    const cols = this._columns.length > 0 ? this._columns.join(", ") : "*";
    let sql = `SELECT ${cols} FROM ${this._table}`;

    // JOINs
    for (const j of this._joins) {
      sql += ` ${j.type} JOIN ${j.table} ON ${j.on}`;
    }

    // WHERE
    if (this._conditions.length > 0) {
      const fragments = resolveConditions(this._conditions);
      const whereClause = fragments.reduce((acc, fragment, idx) => {
        if (idx === 0) return fragment;
        const connector = this._conditions[idx].connector;
        return `${acc} ${connector} ${fragment}`;
      }, "");
      sql += ` WHERE ${whereClause}`;
    }

    // GROUP BY
    if (this._groupBy.length > 0) {
      sql += ` GROUP BY ${this._groupBy.join(", ")}`;
    }

    // HAVING
    if (this._havingConditions.length > 0) {
      const fragments = resolveConditions(this._havingConditions);
      const havingClause = fragments.reduce((acc, fragment, idx) => {
        if (idx === 0) return fragment;
        const connector = this._havingConditions[idx].connector;
        return `${acc} ${connector} ${fragment}`;
      }, "");
      sql += ` HAVING ${havingClause}`;
    }

    // ORDER BY
    if (this._orderBy.length > 0) {
      const orderClauses = this._orderBy
        .map((o) => `${o.column} ${o.direction}`)
        .join(", ");
      sql += ` ORDER BY ${orderClauses}`;
    }

    // LIMIT / OFFSET
    if (this._limit !== null) {
      sql += ` LIMIT $${paramIndex++}`;
      allParams.push(this._limit);
    }
    if (this._offset !== null) {
      sql += ` OFFSET $${paramIndex++}`;
      allParams.push(this._offset);
    }

    return { sql, params: allParams };
  }

  // ── execute ────────────────────────────────────────────────────────────────

  /**
   * Execute the query against the supplied driver and return the result rows.
   */
  async execute(driver: Driver): Promise<T[]> {
    const { sql, params } = this.toSQL();
    return driver.query<T>(sql, params);
  }
}

// ─── InsertBuilder ────────────────────────────────────────────────────────────

/**
 * Fluent INSERT query builder.
 */
export class InsertBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table: string;
  private _data: Partial<T> = {};
  private _returning: string[] = [];

  constructor(table: string) {
    this._table = table;
  }

  /**
   * Set the row data to insert.
   */
  values(data: Partial<T>): this {
    this._data = { ...data };
    return this;
  }

  /**
   * Specify which columns to include in a RETURNING clause.
   * (Supported by PostgreSQL; silently ignored by drivers that do not support it.)
   */
  returning(...columns: (keyof T & string)[]): this {
    this._returning = columns as string[];
    return this;
  }

  /**
   * Compile the builder state into a SQL string and positional parameter array.
   */
  toSQL(): SQLResult {
    const keys = Object.keys(this._data) as (keyof T & string)[];
    if (keys.length === 0) {
      throw new Error("[vaisx/db] InsertBuilder: no values provided — call .values(data) first.");
    }

    const params: unknown[] = keys.map((k) => (this._data as Record<string, unknown>)[k]);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

    let sql = `INSERT INTO ${this._table} (${columns}) VALUES (${placeholders})`;

    if (this._returning.length > 0) {
      sql += ` RETURNING ${this._returning.join(", ")}`;
    }

    return { sql, params };
  }

  /**
   * Execute the insert against the supplied driver.
   */
  async execute(driver: Driver): Promise<{ rowsAffected: number; insertId?: number | bigint }> {
    const { sql, params } = this.toSQL();
    return driver.execute(sql, params);
  }
}

// ─── UpdateBuilder ────────────────────────────────────────────────────────────

/**
 * Fluent UPDATE query builder.
 */
export class UpdateBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table: string;
  private _data: Partial<T> = {};
  private _conditions: Array<{
    connector: ConditionConnector;
    column: string;
    op: ComparisonOperator;
    params: unknown[];
  }> = [];

  constructor(table: string) {
    this._table = table;
  }

  /**
   * Set the columns/values to update.
   */
  set(data: Partial<T>): this {
    this._data = { ...data };
    return this;
  }

  /**
   * Add a WHERE condition.
   */
  where(column: keyof T & string, op: ComparisonOperator, value?: unknown): this {
    this._conditions.push({
      connector: "AND",
      column: column as string,
      op,
      params: Array.isArray(value) ? value : value !== undefined ? [value] : [],
    });
    return this;
  }

  /**
   * Compile the builder state into a SQL string and positional parameter array.
   */
  toSQL(): SQLResult {
    const dataKeys = Object.keys(this._data) as (keyof T & string)[];
    if (dataKeys.length === 0) {
      throw new Error("[vaisx/db] UpdateBuilder: no data provided — call .set(data) first.");
    }

    const params: unknown[] = dataKeys.map((k) => (this._data as Record<string, unknown>)[k]);
    let paramIndex = dataKeys.length + 1;

    const setClauses = dataKeys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    let sql = `UPDATE ${this._table} SET ${setClauses}`;

    if (this._conditions.length > 0) {
      const fragments = this._conditions.map((cond) => {
        if (cond.op === "IS NULL") return `${cond.column} IS NULL`;
        if (cond.op === "IS NOT NULL") return `${cond.column} IS NOT NULL`;
        if (cond.op === "IN") {
          const placeholders = cond.params.map(() => `$${paramIndex++}`).join(", ");
          params.push(...cond.params);
          return `${cond.column} IN (${placeholders})`;
        }
        const placeholder = `$${paramIndex++}`;
        params.push(cond.params[0]);
        return `${cond.column} ${cond.op} ${placeholder}`;
      });

      const whereClause = fragments.reduce((acc, frag, idx) => {
        if (idx === 0) return frag;
        return `${acc} ${this._conditions[idx].connector} ${frag}`;
      }, "");

      sql += ` WHERE ${whereClause}`;
    }

    return { sql, params };
  }

  /**
   * Execute the update against the supplied driver.
   */
  async execute(driver: Driver): Promise<{ rowsAffected: number }> {
    const { sql, params } = this.toSQL();
    return driver.execute(sql, params);
  }
}

// ─── DeleteBuilder ────────────────────────────────────────────────────────────

/**
 * Fluent DELETE query builder.
 */
export class DeleteBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table: string;
  private _conditions: Array<{
    connector: ConditionConnector;
    column: string;
    op: ComparisonOperator;
    params: unknown[];
  }> = [];

  constructor(table: string) {
    this._table = table;
  }

  /**
   * Add a WHERE condition.
   */
  where(column: keyof T & string, op: ComparisonOperator, value?: unknown): this {
    this._conditions.push({
      connector: "AND",
      column: column as string,
      op,
      params: Array.isArray(value) ? value : value !== undefined ? [value] : [],
    });
    return this;
  }

  /**
   * Compile the builder state into a SQL string and positional parameter array.
   */
  toSQL(): SQLResult {
    let sql = `DELETE FROM ${this._table}`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (this._conditions.length > 0) {
      const fragments = this._conditions.map((cond) => {
        if (cond.op === "IS NULL") return `${cond.column} IS NULL`;
        if (cond.op === "IS NOT NULL") return `${cond.column} IS NOT NULL`;
        if (cond.op === "IN") {
          const placeholders = cond.params.map(() => `$${paramIndex++}`).join(", ");
          params.push(...cond.params);
          return `${cond.column} IN (${placeholders})`;
        }
        const placeholder = `$${paramIndex++}`;
        params.push(cond.params[0]);
        return `${cond.column} ${cond.op} ${placeholder}`;
      });

      const whereClause = fragments.reduce((acc, frag, idx) => {
        if (idx === 0) return frag;
        return `${acc} ${this._conditions[idx].connector} ${frag}`;
      }, "");

      sql += ` WHERE ${whereClause}`;
    }

    return { sql, params };
  }

  /**
   * Execute the delete against the supplied driver.
   */
  async execute(driver: Driver): Promise<{ rowsAffected: number }> {
    const { sql, params } = this.toSQL();
    return driver.execute(sql, params);
  }
}

// ─── Factory functions ────────────────────────────────────────────────────────

/**
 * Create a new SELECT query builder for the given table.
 *
 * @example
 * const { sql, params } = createQueryBuilder<User>("users")
 *   .select("id", "name")
 *   .where("active", "=", true)
 *   .limit(20)
 *   .toSQL();
 */
export function createQueryBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
>(tableName: string): QueryBuilder<T> {
  return new QueryBuilder<T>(tableName);
}

/**
 * Create a new INSERT query builder for the given table.
 *
 * @example
 * const { sql, params } = insertBuilder<User>("users")
 *   .values({ name: "Alice", email: "alice@example.com" })
 *   .returning("id")
 *   .toSQL();
 */
export function insertBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
>(tableName: string): InsertBuilder<T> {
  return new InsertBuilder<T>(tableName);
}

/**
 * Create a new UPDATE query builder for the given table.
 *
 * @example
 * const { sql, params } = updateBuilder<User>("users")
 *   .set({ name: "Bob" })
 *   .where("id", "=", 1)
 *   .toSQL();
 */
export function updateBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
>(tableName: string): UpdateBuilder<T> {
  return new UpdateBuilder<T>(tableName);
}

/**
 * Create a new DELETE query builder for the given table.
 *
 * @example
 * const { sql, params } = deleteBuilder<User>("users")
 *   .where("id", "=", 1)
 *   .toSQL();
 */
export function deleteBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
>(tableName: string): DeleteBuilder<T> {
  return new DeleteBuilder<T>(tableName);
}
