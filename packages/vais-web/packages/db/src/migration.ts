/**
 * Migration manager for @vaisx/db.
 *
 * Provides:
 *  - createMigration()      — define a named migration with up/down callbacks
 *  - MigrationRunner        — execute, rollback, and inspect migrations
 *  - generateMigrationSQL() — compile up/down SQL strings for a migration
 *  - diffSchemas()          — derive an auto-migration from two schema snapshots
 */

import type { CompiledSchema, SchemaColumnDef } from "./schema.js";

// ─── Migration builder types ──────────────────────────────────────────────────

/**
 * Operations available inside an up() / down() callback.
 */
export interface MigrationBuilder {
  /** Create a new table with the given column definitions. */
  createTable(
    tableName: string,
    columns: Record<string, MigrationColumnDef>,
  ): void;
  /** Drop a table (adds DROP TABLE IF EXISTS). */
  dropTable(tableName: string): void;
  /** Add a column to an existing table. */
  addColumn(
    tableName: string,
    columnName: string,
    def: MigrationColumnDef,
  ): void;
  /** Drop a column from an existing table. */
  dropColumn(tableName: string, columnName: string): void;
  /** Rename a column in an existing table. */
  renameColumn(
    tableName: string,
    oldName: string,
    newName: string,
  ): void;
  /** Return all SQL statements accumulated so far. */
  _statements(): string[];
}

/** Simplified column definition used inside migration builders. */
export interface MigrationColumnDef {
  type: string;
  primaryKey?: boolean;
  nullable?: boolean;
  default?: unknown;
  unique?: boolean;
  references?: { table: string; column?: string };
}

// ─── Migration definition ─────────────────────────────────────────────────────

/**
 * A fully-resolved migration object.
 */
export interface Migration {
  /** Human-readable migration name (e.g. "create_users_table"). */
  name: string;
  /** ISO timestamp used as the version string (set at creation time). */
  version: string;
  /** Callback that applies the migration. */
  up: (builder: MigrationBuilder) => void;
  /** Callback that reverts the migration. */
  down: (builder: MigrationBuilder) => void;
}

/** Options for createMigration(). */
export interface MigrationOptions {
  up: (builder: MigrationBuilder) => void;
  down: (builder: MigrationBuilder) => void;
  /** Override the auto-generated ISO version string. */
  version?: string;
}

// ─── Generated SQL pair ───────────────────────────────────────────────────────

/** Compiled up/down SQL for a migration. */
export interface MigrationSQL {
  up: string;
  down: string;
  version: string;
}

// ─── MigrationRunner state ────────────────────────────────────────────────────

export interface MigrationStatus {
  name: string;
  version: string;
  applied: boolean;
}

// ─── Internal builder factory ─────────────────────────────────────────────────

function createMigrationBuilder(): MigrationBuilder {
  const statements: string[] = [];

  function columnDDL(name: string, def: MigrationColumnDef): string {
    const parts: string[] = [name, def.type];
    if (def.primaryKey) parts.push("PRIMARY KEY");
    if (!def.nullable && !def.primaryKey) parts.push("NOT NULL");
    if (def.unique && !def.primaryKey) parts.push("UNIQUE");
    if (def.default !== undefined) {
      const dv =
        typeof def.default === "string" &&
        def.default !== "CURRENT_TIMESTAMP"
          ? `'${def.default}'`
          : String(def.default);
      parts.push(`DEFAULT ${dv}`);
    }
    if (def.references) {
      const refCol = def.references.column ?? "id";
      parts.push(`REFERENCES ${def.references.table}(${refCol})`);
    }
    return parts.join(" ");
  }

  const builder: MigrationBuilder = {
    createTable(tableName, columns) {
      const colDefs = Object.entries(columns).map(
        ([colName, def]) => `  ${columnDDL(colName, def)}`,
      );
      const fkClauses: string[] = [];
      for (const [colName, def] of Object.entries(columns)) {
        if (def.references) {
          const refCol = def.references.column ?? "id";
          fkClauses.push(
            `  FOREIGN KEY (${colName}) REFERENCES ${def.references.table}(${refCol})`,
          );
        }
      }
      const allDefs = [...colDefs, ...fkClauses];
      statements.push(
        `CREATE TABLE IF NOT EXISTS ${tableName} (\n${allDefs.join(",\n")}\n);`,
      );
    },

    dropTable(tableName) {
      statements.push(`DROP TABLE IF EXISTS ${tableName};`);
    },

    addColumn(tableName, columnName, def) {
      statements.push(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnDDL(columnName, def)};`,
      );
    },

    dropColumn(tableName, columnName) {
      statements.push(
        `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`,
      );
    },

    renameColumn(tableName, oldName, newName) {
      statements.push(
        `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName};`,
      );
    },

    _statements() {
      return [...statements];
    },
  };

  return builder;
}

// ─── createMigration ──────────────────────────────────────────────────────────

/**
 * Define a named migration.
 *
 * @example
 * ```ts
 * const m = createMigration("create_users_table", {
 *   up(b) { b.createTable("users", { id: { type: "UUID", primaryKey: true } }); },
 *   down(b) { b.dropTable("users"); },
 * });
 * ```
 */
export function createMigration(
  name: string,
  options: MigrationOptions,
): Migration {
  return {
    name,
    version: options.version ?? new Date().toISOString(),
    up: options.up,
    down: options.down,
  };
}

// ─── generateMigrationSQL ─────────────────────────────────────────────────────

/**
 * Run a migration's up and down callbacks and return the generated SQL strings.
 */
export function generateMigrationSQL(migration: Migration): MigrationSQL {
  const upBuilder = createMigrationBuilder();
  migration.up(upBuilder);

  const downBuilder = createMigrationBuilder();
  migration.down(downBuilder);

  return {
    up: upBuilder._statements().join("\n"),
    down: downBuilder._statements().join("\n"),
    version: migration.version,
  };
}

// ─── diffSchemas ──────────────────────────────────────────────────────────────

/**
 * Compute the difference between two schema snapshots and return a Migration
 * that represents the transition from `oldSchema` to `newSchema`.
 *
 * Detects:
 *  - New tables
 *  - Dropped tables
 *  - Added columns
 *  - Dropped columns
 *  - Renamed columns are NOT auto-detected (treated as drop + add)
 */
export function diffSchemas(
  oldSchema: CompiledSchema | null,
  newSchema: CompiledSchema,
): Migration {
  const name = `auto_${newSchema.name}_${Date.now()}`;
  const version = new Date().toISOString();

  function toMigrationColDef(
    col: SchemaColumnDef & { name: string },
  ): MigrationColumnDef {
    return {
      type: col.sqlType,
      primaryKey: col.primaryKey,
      nullable: col.nullable,
      default: col.default,
      unique: col.unique,
      references: col.references,
    };
  }

  // Convert columns array to a record keyed by column name
  function colRecord(
    cols: Array<SchemaColumnDef & { name: string }>,
  ): Record<string, MigrationColumnDef> {
    return Object.fromEntries(
      cols.map((c) => [c.name, toMigrationColDef(c)]),
    );
  }

  const up = (builder: MigrationBuilder): void => {
    if (!oldSchema) {
      // Creating the table from scratch
      builder.createTable(newSchema.name, colRecord(newSchema.columns));
      return;
    }

    if (oldSchema.name !== newSchema.name) {
      // Table renamed — treat as drop + create
      builder.dropTable(oldSchema.name);
      builder.createTable(newSchema.name, colRecord(newSchema.columns));
      return;
    }

    // Same table — diff columns
    const oldCols = new Map(oldSchema.columns.map((c) => [c.name, c]));
    const newCols = new Map(newSchema.columns.map((c) => [c.name, c]));

    // Added columns
    for (const [colName, col] of newCols) {
      if (!oldCols.has(colName)) {
        builder.addColumn(newSchema.name, colName, toMigrationColDef(col));
      }
    }

    // Dropped columns
    for (const colName of oldCols.keys()) {
      if (!newCols.has(colName)) {
        builder.dropColumn(newSchema.name, colName);
      }
    }
  };

  const down = (builder: MigrationBuilder): void => {
    if (!oldSchema) {
      builder.dropTable(newSchema.name);
      return;
    }

    if (oldSchema.name !== newSchema.name) {
      builder.dropTable(newSchema.name);
      builder.createTable(oldSchema.name, colRecord(oldSchema.columns));
      return;
    }

    const oldCols = new Map(oldSchema.columns.map((c) => [c.name, c]));
    const newCols = new Map(newSchema.columns.map((c) => [c.name, c]));

    // Reverse of up: drop added columns
    for (const colName of newCols.keys()) {
      if (!oldCols.has(colName)) {
        builder.dropColumn(oldSchema.name, colName);
      }
    }

    // Reverse of up: re-add dropped columns
    for (const [colName, col] of oldCols) {
      if (!newCols.has(colName)) {
        builder.addColumn(oldSchema.name, colName, toMigrationColDef(col));
      }
    }
  };

  return { name, version, up, down };
}

// ─── MigrationRunner ──────────────────────────────────────────────────────────

/**
 * Manages an ordered list of migrations and tracks which have been applied.
 *
 * This is an in-memory implementation; extend with persistence for real apps.
 */
export class MigrationRunner {
  private readonly migrations: Migration[];
  private readonly applied: Set<string> = new Set();

  constructor(migrations: Migration[] = []) {
    // Sort by version string (ISO dates sort lexicographically)
    this.migrations = [...migrations].sort((a, b) =>
      a.version.localeCompare(b.version),
    );
  }

  /** Return the list of all migrations with their applied status. */
  status(): MigrationStatus[] {
    return this.migrations.map((m) => ({
      name: m.name,
      version: m.version,
      applied: this.applied.has(m.version),
    }));
  }

  /** Return all migrations that have not yet been applied. */
  pending(): Migration[] {
    return this.migrations.filter((m) => !this.applied.has(m.version));
  }

  /**
   * Apply all pending migrations in order.
   * Returns the list of SQL strings that were "executed".
   */
  migrate(): MigrationSQL[] {
    const results: MigrationSQL[] = [];
    for (const migration of this.pending()) {
      const sql = generateMigrationSQL(migration);
      this.applied.add(migration.version);
      results.push(sql);
    }
    return results;
  }

  /**
   * Roll back the last applied migration.
   * Returns the down SQL that was "executed", or null if nothing to roll back.
   */
  rollback(): MigrationSQL | null {
    // Find the last applied migration in order
    const appliedMigrations = this.migrations.filter((m) =>
      this.applied.has(m.version),
    );

    if (appliedMigrations.length === 0) return null;

    const last = appliedMigrations[appliedMigrations.length - 1];
    const sql = generateMigrationSQL(last);
    this.applied.delete(last.version);
    return sql;
  }
}
