/**
 * @vaisx/db — types.ts tests
 *
 * These tests verify that the structural types behave as expected at runtime
 * and that TypeScript-level inference works correctly through type assertions.
 */

import { describe, it, expect } from "vitest";
import type {
  ColumnType,
  ColumnDef,
  ModelSchema,
  ModelDefinition,
  DatabaseConfig,
  MigrationStep,
  Relation,
  QueryBuilder,
  DatabaseClient,
  Driver,
  InferModel,
} from "../src/types.js";

// ─── ColumnType ───────────────────────────────────────────────────────────────

describe("ColumnType", () => {
  it("accepts all valid column type literals", () => {
    const types: ColumnType[] = ["string", "number", "boolean", "date", "json"];
    expect(types).toHaveLength(5);
  });
});

// ─── ColumnDef ────────────────────────────────────────────────────────────────

describe("ColumnDef", () => {
  it("creates a minimal column definition with only type", () => {
    const col: ColumnDef = { type: "string" };
    expect(col.type).toBe("string");
    expect(col.primaryKey).toBeUndefined();
    expect(col.nullable).toBeUndefined();
  });

  it("creates a fully specified column definition", () => {
    const col: ColumnDef = {
      type: "number",
      primaryKey: true,
      nullable: false,
      default: 0,
      unique: true,
      references: { table: "other_table", column: "id" },
    };
    expect(col.primaryKey).toBe(true);
    expect(col.unique).toBe(true);
    expect(col.references?.table).toBe("other_table");
  });

  it("references column defaults to undefined (optional)", () => {
    const col: ColumnDef = {
      type: "string",
      references: { table: "users" },
    };
    expect(col.references?.column).toBeUndefined();
  });
});

// ─── ModelSchema ─────────────────────────────────────────────────────────────

describe("ModelSchema", () => {
  it("can be constructed as a plain Record", () => {
    const schema: ModelSchema = {
      id: { type: "number", primaryKey: true },
      name: { type: "string", nullable: false },
      active: { type: "boolean", default: true },
    };
    expect(Object.keys(schema)).toHaveLength(3);
    expect(schema["id"]!.primaryKey).toBe(true);
  });
});

// ─── ModelDefinition ─────────────────────────────────────────────────────────

describe("ModelDefinition", () => {
  it("accepts name, schema and optional timestamps flag", () => {
    const def: ModelDefinition = {
      name: "products",
      schema: {
        id: { type: "number", primaryKey: true },
        label: { type: "string" },
      },
      timestamps: true,
    };
    expect(def.name).toBe("products");
    expect(def.timestamps).toBe(true);
  });

  it("timestamps defaults to undefined (not required)", () => {
    const def: ModelDefinition = {
      name: "tags",
      schema: { id: { type: "number", primaryKey: true } },
    };
    expect(def.timestamps).toBeUndefined();
  });
});

// ─── DatabaseConfig ───────────────────────────────────────────────────────────

describe("DatabaseConfig", () => {
  it("accepts sqlite config with filename", () => {
    const config: DatabaseConfig = { driver: "sqlite", filename: ":memory:" };
    expect(config.driver).toBe("sqlite");
    expect(config.filename).toBe(":memory:");
  });

  it("accepts postgres config with url", () => {
    const config: DatabaseConfig = {
      driver: "postgres",
      url: "postgres://localhost/mydb",
      poolSize: 5,
    };
    expect(config.driver).toBe("postgres");
    expect(config.poolSize).toBe(5);
  });

  it("accepts mysql config", () => {
    const config: DatabaseConfig = {
      driver: "mysql",
      url: "mysql://root:pass@localhost/mydb",
    };
    expect(config.driver).toBe("mysql");
  });
});

// ─── MigrationStep ───────────────────────────────────────────────────────────

describe("MigrationStep", () => {
  it("holds up, down and version fields", () => {
    const step: MigrationStep = {
      version: 1,
      up: "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      down: "DROP TABLE users;",
    };
    expect(step.version).toBe(1);
    expect(step.up).toContain("CREATE TABLE");
    expect(step.down).toContain("DROP TABLE");
  });
});

// ─── Relation ─────────────────────────────────────────────────────────────────

describe("Relation", () => {
  it("represents hasMany relation", () => {
    const rel: Relation = {
      type: "hasMany",
      model: "Post",
      foreignKey: "userId",
    };
    expect(rel.type).toBe("hasMany");
    expect(rel.foreignKey).toBe("userId");
  });

  it("represents belongsTo relation", () => {
    const rel: Relation = {
      type: "belongsTo",
      model: "User",
      foreignKey: "userId",
    };
    expect(rel.type).toBe("belongsTo");
  });
});

// ─── InferModel (compile-time) ────────────────────────────────────────────────

describe("InferModel type inference", () => {
  it("infers row shape from a schema at runtime via type assertion", () => {
    // We verify that the type-level inference is correct by checking that
    // a value that satisfies InferModel can be constructed without TS errors.
    type UserSchema = {
      id: { type: "number"; primaryKey: true };
      name: { type: "string"; nullable: false };
      bio: { type: "string"; nullable: true };
    };

    // This would be a compile error if the types were wrong.
    const user: InferModel<UserSchema> = {
      id: 1,
      name: "Alice",
      bio: null,
    };

    expect(user.id).toBe(1);
    expect(user.name).toBe("Alice");
    expect(user.bio).toBeNull();
  });
});

// ─── Interface shapes (structural) ───────────────────────────────────────────

describe("QueryBuilder interface shape", () => {
  it("all required methods are present on a conforming object", () => {
    // Build a minimal conforming stub
    const qb: QueryBuilder<{ id: number; name: string }> = {
      select: (_cols) => qb,
      where: (_cond) => qb,
      orderBy: (_col, _dir) => qb,
      limit: (_n) => qb,
      offset: (_n) => qb,
      join: (_type, _table, _on) => qb,
      execute: async () => [],
    };

    expect(typeof qb.select).toBe("function");
    expect(typeof qb.where).toBe("function");
    expect(typeof qb.orderBy).toBe("function");
    expect(typeof qb.limit).toBe("function");
    expect(typeof qb.offset).toBe("function");
    expect(typeof qb.join).toBe("function");
    expect(typeof qb.execute).toBe("function");
  });
});

describe("DatabaseClient interface shape", () => {
  it("all required methods are present on a conforming object", () => {
    const client: DatabaseClient = {
      query: async () => [],
      insert: async () => ({ rowsAffected: 0 }),
      update: async () => ({ rowsAffected: 0 }),
      delete: async () => ({ rowsAffected: 0 }),
      transaction: async (fn) => fn(client),
      close: async () => {},
    };

    expect(typeof client.query).toBe("function");
    expect(typeof client.insert).toBe("function");
    expect(typeof client.update).toBe("function");
    expect(typeof client.delete).toBe("function");
    expect(typeof client.transaction).toBe("function");
    expect(typeof client.close).toBe("function");
  });
});

describe("Driver interface shape", () => {
  it("all required methods are present on a conforming object", () => {
    const driver: Driver = {
      query: async () => [],
      execute: async () => ({ rowsAffected: 0 }),
      beginTransaction: async () => driver,
      commit: async () => {},
      rollback: async () => {},
      close: async () => {},
    };

    expect(typeof driver.query).toBe("function");
    expect(typeof driver.execute).toBe("function");
    expect(typeof driver.beginTransaction).toBe("function");
    expect(typeof driver.commit).toBe("function");
    expect(typeof driver.rollback).toBe("function");
    expect(typeof driver.close).toBe("function");
  });
});
