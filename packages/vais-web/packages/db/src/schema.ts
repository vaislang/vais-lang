/**
 * Declarative schema builder for @vaisx/db.
 *
 * Provides column helpers with a fluent chaining API and a defineSchema()
 * function that compiles schemas into SQL DDL statements.
 */

import type { ColumnDef, ForeignKeyRef } from "./types.js";

// ─── SQL DDL type literals ────────────────────────────────────────────────────

/** Internal SQL type literal used in DDL generation (broader than ColumnType). */
export type SQLColumnType =
  | "TEXT"
  | "INTEGER"
  | "BOOLEAN"
  | "TIMESTAMP"
  | "JSON"
  | "UUID";

// ─── Column definition extended for schema builder ───────────────────────────

/**
 * Extended column definition used internally by the schema builder.
 * Carries the raw SQL type alongside the normalised ColumnDef fields.
 */
export interface SchemaColumnDef extends ColumnDef {
  /** Raw SQL type keyword. */
  sqlType: SQLColumnType;
  /** Column name (set when the schema is compiled). */
  name?: string;
}

// ─── Fluent column builder ────────────────────────────────────────────────────

/**
 * Returned by every column helper.  Methods are chainable and mutate the
 * underlying definition in-place (builder pattern).
 */
export interface ColumnBuilder {
  /** Mark this column as the primary key. */
  primaryKey(): ColumnBuilder;
  /** Allow NULL values. */
  nullable(): ColumnBuilder;
  /** Set a default value. */
  default(val: unknown): ColumnBuilder;
  /** Add a UNIQUE constraint. */
  unique(): ColumnBuilder;
  /** Add a FOREIGN KEY reference to another table's column. */
  references(table: string, col?: string): ColumnBuilder;
  /** Return the compiled definition (used internally). */
  _def(): SchemaColumnDef;
}

function createColumnBuilder(sqlType: SQLColumnType, type: ColumnDef["type"]): ColumnBuilder {
  const def: SchemaColumnDef = { sqlType, type };

  const builder: ColumnBuilder = {
    primaryKey() {
      def.primaryKey = true;
      return builder;
    },
    nullable() {
      def.nullable = true;
      return builder;
    },
    default(val: unknown) {
      def.default = val;
      return builder;
    },
    unique() {
      def.unique = true;
      return builder;
    },
    references(table: string, col?: string) {
      def.references = { table, column: col } satisfies ForeignKeyRef;
      return builder;
    },
    _def() {
      return def;
    },
  };

  return builder;
}

// ─── Column helpers ───────────────────────────────────────────────────────────

/** TEXT column. */
export function text(): ColumnBuilder {
  return createColumnBuilder("TEXT", "string");
}

/** INTEGER column. */
export function integer(): ColumnBuilder {
  return createColumnBuilder("INTEGER", "number");
}

/** BOOLEAN column. */
export function boolean(): ColumnBuilder {
  return createColumnBuilder("BOOLEAN", "boolean");
}

/** TIMESTAMP column. */
export function timestamp(): ColumnBuilder {
  return createColumnBuilder("TIMESTAMP", "date");
}

/** JSON column. */
export function json(): ColumnBuilder {
  return createColumnBuilder("JSON", "json");
}

/** UUID column (TEXT under the hood, with UUID semantics). */
export function uuid(): ColumnBuilder {
  return createColumnBuilder("UUID", "string");
}

// ─── Index definition ─────────────────────────────────────────────────────────

export interface IndexDef {
  /** Index name. */
  name: string;
  /** Column names included in the index. */
  columns: string[];
  /** Whether the index enforces uniqueness. */
  unique?: boolean;
}

// ─── Compiled schema ──────────────────────────────────────────────────────────

/**
 * The fully-compiled schema object produced by defineSchema().
 */
export interface CompiledSchema {
  /** Table name. */
  name: string;
  /** Ordered list of column definitions. */
  columns: Array<SchemaColumnDef & { name: string }>;
  /** Indexes defined via addIndex(). */
  indexes: IndexDef[];
}

// ─── Schema builder ───────────────────────────────────────────────────────────

/**
 * Builder interface passed to the defineSchema() callback.
 */
export interface SchemaBuilder {
  /** Add a column to the schema. */
  addColumn(name: string, col: ColumnBuilder): void;
  /**
   * Add `createdAt` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) and
   * `updatedAt` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) columns.
   */
  addTimestamps(): void;
  /** Register an index on one or more columns. */
  addIndex(name: string, columns: string[], unique?: boolean): void;
}

/**
 * Define a declarative schema.
 *
 * @example
 * ```ts
 * const users = defineSchema("users", (t) => {
 *   t.addColumn("id",    uuid().primaryKey());
 *   t.addColumn("email", text().unique());
 *   t.addColumn("age",   integer().nullable());
 *   t.addTimestamps();
 *   t.addIndex("idx_users_email", ["email"], true);
 * });
 * ```
 */
export function defineSchema(
  name: string,
  builder: (t: SchemaBuilder) => void,
): CompiledSchema {
  const columns: Array<SchemaColumnDef & { name: string }> = [];
  const indexes: IndexDef[] = [];

  const t: SchemaBuilder = {
    addColumn(colName: string, col: ColumnBuilder) {
      const def = col._def();
      columns.push({ ...def, name: colName });
    },

    addTimestamps() {
      const tsBase: Omit<SchemaColumnDef, "name"> = {
        sqlType: "TIMESTAMP",
        type: "date",
        nullable: false,
        default: "CURRENT_TIMESTAMP",
      };
      columns.push({ ...tsBase, name: "createdAt" });
      columns.push({ ...tsBase, name: "updatedAt" });
    },

    addIndex(idxName: string, cols: string[], unique = false) {
      indexes.push({ name: idxName, columns: cols, unique });
    },
  };

  builder(t);

  return { name, columns, indexes };
}

// ─── DDL generation ───────────────────────────────────────────────────────────

/**
 * Build the DDL fragment for a single column.
 */
function buildColumnDDL(col: SchemaColumnDef & { name: string }): string {
  const parts: string[] = [col.name, col.sqlType];

  if (col.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  if (!col.nullable && !col.primaryKey) {
    parts.push("NOT NULL");
  }

  if (col.unique && !col.primaryKey) {
    parts.push("UNIQUE");
  }

  if (col.default !== undefined) {
    const dv =
      typeof col.default === "string" && col.default !== "CURRENT_TIMESTAMP"
        ? `'${col.default}'`
        : String(col.default);
    parts.push(`DEFAULT ${dv}`);
  }

  if (col.references) {
    const refCol = col.references.column ?? "id";
    parts.push(`REFERENCES ${col.references.table}(${refCol})`);
  }

  return parts.join(" ");
}

/**
 * Generate `CREATE TABLE` DDL SQL from a compiled schema.
 *
 * @example
 * ```ts
 * const sql = toSQL(users);
 * // => "CREATE TABLE IF NOT EXISTS users (\n  id UUID PRIMARY KEY,\n  ..."
 * ```
 */
export function toSQL(schema: CompiledSchema): string {
  const colDefs = schema.columns.map((c) => `  ${buildColumnDDL(c)}`);

  // Separate FOREIGN KEY constraint clauses
  const fkClauses: string[] = [];
  for (const col of schema.columns) {
    if (col.references) {
      const refCol = col.references.column ?? "id";
      fkClauses.push(
        `  FOREIGN KEY (${col.name}) REFERENCES ${col.references.table}(${refCol})`,
      );
    }
  }

  const allDefs = [...colDefs, ...fkClauses];

  const createTable =
    `CREATE TABLE IF NOT EXISTS ${schema.name} (\n` +
    allDefs.join(",\n") +
    "\n);";

  const indexStatements = schema.indexes.map((idx) => {
    const unique = idx.unique ? "UNIQUE " : "";
    return `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${schema.name} (${idx.columns.join(", ")});`;
  });

  return [createTable, ...indexStatements].join("\n");
}
