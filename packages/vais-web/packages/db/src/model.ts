/**
 * defineModel — registers a model and provides SQL DDL generation utilities.
 *
 * Usage:
 *   const UserModel = defineModel({
 *     name: "users",
 *     schema: {
 *       id:    { type: "number", primaryKey: true },
 *       email: { type: "string", unique: true, nullable: false },
 *       name:  { type: "string", nullable: true },
 *     },
 *     timestamps: true,
 *   });
 *
 *   UserModel.toCreateTableSQL();
 *   // => "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, ...)"
 */

import type { ModelDefinition, ModelSchema, ColumnDef, ColumnType } from "./types.js";

// ─── Internal registry ────────────────────────────────────────────────────────

/** Global registry: model name → ModelDefinition. */
const modelRegistry = new Map<string, ModelDefinition<unknown>>();

/**
 * Retrieve a registered model by name.  Returns undefined if not registered.
 */
export function getModel(name: string): ModelDefinition<unknown> | undefined {
  return modelRegistry.get(name);
}

/**
 * Return all registered model names.
 */
export function getRegisteredModels(): string[] {
  return [...modelRegistry.keys()];
}

/**
 * Clear the model registry.
 * Useful for test isolation.
 */
export function clearModelRegistry(): void {
  modelRegistry.clear();
}

// ─── SQL type mapping ─────────────────────────────────────────────────────────

/**
 * Map a ColumnType to its SQL data-type keyword.
 * The mapping is intentionally kept generic (ANSI SQL) so it works across
 * SQLite, PostgreSQL, and MySQL with minimal adaptation.
 */
function toSQLType(type: ColumnType): string {
  switch (type) {
    case "string":  return "TEXT";
    case "number":  return "INTEGER";
    case "boolean": return "BOOLEAN";
    case "date":    return "TIMESTAMP";
    case "json":    return "JSON";
  }
}

// ─── Column DDL builder ───────────────────────────────────────────────────────

/**
 * Build the DDL fragment for a single column definition.
 *
 * Example output: `"email TEXT NOT NULL UNIQUE"`
 */
function buildColumnDDL(name: string, col: ColumnDef): string {
  const parts: string[] = [name, toSQLType(col.type)];

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
    const defaultVal =
      typeof col.default === "string"
        ? `'${col.default}'`
        : String(col.default);
    parts.push(`DEFAULT ${defaultVal}`);
  }

  if (col.references) {
    const refCol = col.references.column ?? "id";
    parts.push(`REFERENCES ${col.references.table}(${refCol})`);
  }

  return parts.join(" ");
}

// ─── Timestamp columns ────────────────────────────────────────────────────────

const TIMESTAMP_COLUMNS: ModelSchema = {
  createdAt: {
    type: "date",
    nullable: false,
    default: "CURRENT_TIMESTAMP",
  },
  updatedAt: {
    type: "date",
    nullable: false,
    default: "CURRENT_TIMESTAMP",
  },
};

// ─── Public DDL helpers ───────────────────────────────────────────────────────

/**
 * Generate a `CREATE TABLE IF NOT EXISTS` SQL statement for the given model.
 */
export function toCreateTableSQL(model: ModelDefinition<unknown>): string {
  const schema: ModelSchema = model.timestamps
    ? { ...model.schema, ...TIMESTAMP_COLUMNS }
    : { ...model.schema };

  const columnDefs = Object.entries(schema).map(([name, col]) =>
    `  ${buildColumnDDL(name, col)}`,
  );

  // Collect foreign-key constraints as separate CONSTRAINT clauses
  const fkClauses: string[] = [];
  for (const [colName, col] of Object.entries(schema)) {
    if (col.references) {
      const refCol = col.references.column ?? "id";
      fkClauses.push(
        `  FOREIGN KEY (${colName}) REFERENCES ${col.references.table}(${refCol})`,
      );
    }
  }

  const allDefs = [...columnDefs, ...fkClauses];

  return (
    `CREATE TABLE IF NOT EXISTS ${model.name} (\n` +
    allDefs.join(",\n") +
    "\n);"
  );
}

/**
 * Generate a `DROP TABLE IF EXISTS` SQL statement for the given model.
 */
export function toDropTableSQL(model: ModelDefinition<unknown>): string {
  return `DROP TABLE IF EXISTS ${model.name};`;
}

// ─── defineModel ─────────────────────────────────────────────────────────────

/**
 * The object returned by defineModel — the registered model enriched with
 * DDL helpers and metadata accessors.
 */
export interface RegisteredModel<T> extends ModelDefinition<T> {
  /** Generate the CREATE TABLE SQL for this model. */
  toCreateTableSQL(): string;
  /** Generate the DROP TABLE SQL for this model. */
  toDropTableSQL(): string;
  /**
   * Return the effective schema (including timestamp columns when
   * `timestamps: true`).
   */
  effectiveSchema(): ModelSchema;
  /** Return the list of column names (including timestamps if enabled). */
  columnNames(): string[];
}

/**
 * Register a model definition and return an enriched model object with DDL
 * generation helpers.
 *
 * Throws if a model with the same name has already been registered.
 */
export function defineModel<T = unknown>(
  definition: ModelDefinition<T>,
): RegisteredModel<T> {
  if (modelRegistry.has(definition.name)) {
    throw new Error(
      `[vaisx/db] A model named "${definition.name}" is already registered. ` +
      `Use clearModelRegistry() between tests or choose a unique name.`,
    );
  }

  const registered: RegisteredModel<T> = {
    ...definition,

    toCreateTableSQL(): string {
      return toCreateTableSQL(definition as ModelDefinition<unknown>);
    },

    toDropTableSQL(): string {
      return toDropTableSQL(definition as ModelDefinition<unknown>);
    },

    effectiveSchema(): ModelSchema {
      return definition.timestamps
        ? { ...definition.schema, ...TIMESTAMP_COLUMNS }
        : { ...definition.schema };
    },

    columnNames(): string[] {
      return Object.keys(registered.effectiveSchema());
    },
  };

  modelRegistry.set(definition.name, registered as ModelDefinition<unknown>);
  return registered;
}
