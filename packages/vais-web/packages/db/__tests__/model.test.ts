/**
 * @vaisx/db — model.ts tests
 *
 * Tests for defineModel(), toCreateTableSQL(), toDropTableSQL() and the
 * model registry helpers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  defineModel,
  toCreateTableSQL,
  toDropTableSQL,
  getModel,
  getRegisteredModels,
  clearModelRegistry,
} from "../src/model.js";
import type { ModelDefinition } from "../src/types.js";

// Always start each test with a clean registry
beforeEach(() => clearModelRegistry());

// ─── defineModel — registration ───────────────────────────────────────────────

describe("defineModel — registration", () => {
  it("registers the model and returns a RegisteredModel", () => {
    const model = defineModel({
      name: "users",
      schema: { id: { type: "number", primaryKey: true } },
    });
    expect(model.name).toBe("users");
    expect(getModel("users")).toBeDefined();
  });

  it("throws when registering two models with the same name", () => {
    defineModel({ name: "items", schema: { id: { type: "number", primaryKey: true } } });
    expect(() =>
      defineModel({ name: "items", schema: { id: { type: "number", primaryKey: true } } }),
    ).toThrow(/already registered/);
  });

  it("getRegisteredModels lists all registered names", () => {
    defineModel({ name: "alpha", schema: { id: { type: "number" } } });
    defineModel({ name: "beta",  schema: { id: { type: "number" } } });
    expect(getRegisteredModels()).toContain("alpha");
    expect(getRegisteredModels()).toContain("beta");
  });

  it("clearModelRegistry removes all models", () => {
    defineModel({ name: "temp", schema: { id: { type: "number" } } });
    clearModelRegistry();
    expect(getRegisteredModels()).toHaveLength(0);
  });
});

// ─── toCreateTableSQL — basic ─────────────────────────────────────────────────

describe("toCreateTableSQL — basic", () => {
  it("generates CREATE TABLE IF NOT EXISTS statement", () => {
    const def: ModelDefinition = {
      name: "posts",
      schema: { id: { type: "number", primaryKey: true } },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS posts");
  });

  it("maps all ColumnTypes to the correct SQL types", () => {
    const def: ModelDefinition = {
      name: "all_types",
      schema: {
        a: { type: "string" },
        b: { type: "number" },
        c: { type: "boolean" },
        d: { type: "date" },
        e: { type: "json" },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("TEXT");
    expect(sql).toContain("INTEGER");
    expect(sql).toContain("BOOLEAN");
    expect(sql).toContain("TIMESTAMP");
    expect(sql).toContain("JSON");
  });

  it("adds PRIMARY KEY for columns with primaryKey: true", () => {
    const def: ModelDefinition = {
      name: "pk_test",
      schema: { id: { type: "number", primaryKey: true } },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("id INTEGER PRIMARY KEY");
  });

  it("adds NOT NULL for non-nullable columns (that are not PKs)", () => {
    const def: ModelDefinition = {
      name: "nn_test",
      schema: {
        id: { type: "number", primaryKey: true },
        email: { type: "string", nullable: false },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("NOT NULL");
  });

  it("adds UNIQUE for columns with unique: true", () => {
    const def: ModelDefinition = {
      name: "uq_test",
      schema: {
        id: { type: "number", primaryKey: true },
        slug: { type: "string", unique: true },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("UNIQUE");
  });

  it("adds DEFAULT clause for columns with a default value", () => {
    const def: ModelDefinition = {
      name: "def_test",
      schema: {
        id: { type: "number", primaryKey: true },
        active: { type: "boolean", default: true },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("DEFAULT true");
  });

  it("wraps string defaults in single quotes", () => {
    const def: ModelDefinition = {
      name: "str_def_test",
      schema: {
        id: { type: "number", primaryKey: true },
        role: { type: "string", default: "user" },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("DEFAULT 'user'");
  });
});

// ─── toCreateTableSQL — timestamps ────────────────────────────────────────────

describe("toCreateTableSQL — timestamps", () => {
  it("adds createdAt and updatedAt columns when timestamps: true", () => {
    const def: ModelDefinition = {
      name: "ts_test",
      schema: { id: { type: "number", primaryKey: true } },
      timestamps: true,
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("createdAt");
    expect(sql).toContain("updatedAt");
  });

  it("does not add timestamp columns when timestamps is omitted", () => {
    const def: ModelDefinition = {
      name: "no_ts_test",
      schema: { id: { type: "number", primaryKey: true } },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).not.toContain("createdAt");
    expect(sql).not.toContain("updatedAt");
  });
});

// ─── toCreateTableSQL — foreign keys ─────────────────────────────────────────

describe("toCreateTableSQL — foreign keys", () => {
  it("adds REFERENCES clause for referenced columns", () => {
    const def: ModelDefinition = {
      name: "comments",
      schema: {
        id: { type: "number", primaryKey: true },
        userId: { type: "number", references: { table: "users", column: "id" } },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("REFERENCES users(id)");
  });

  it("defaults to 'id' when references.column is omitted", () => {
    const def: ModelDefinition = {
      name: "likes",
      schema: {
        id: { type: "number", primaryKey: true },
        postId: { type: "number", references: { table: "posts" } },
      },
    };
    const sql = toCreateTableSQL(def);
    expect(sql).toContain("REFERENCES posts(id)");
  });
});

// ─── toDropTableSQL ───────────────────────────────────────────────────────────

describe("toDropTableSQL", () => {
  it("generates DROP TABLE IF EXISTS statement", () => {
    const def: ModelDefinition = {
      name: "users",
      schema: { id: { type: "number", primaryKey: true } },
    };
    const sql = toDropTableSQL(def);
    expect(sql).toBe("DROP TABLE IF EXISTS users;");
  });
});

// ─── RegisteredModel helpers ──────────────────────────────────────────────────

describe("RegisteredModel — helpers", () => {
  it("toCreateTableSQL() on the model instance produces the same output", () => {
    const model = defineModel({
      name: "widgets",
      schema: {
        id: { type: "number", primaryKey: true },
        label: { type: "string" },
      },
    });
    const fromInstance = model.toCreateTableSQL();
    const fromHelper   = toCreateTableSQL(model);
    expect(fromInstance).toBe(fromHelper);
  });

  it("toDropTableSQL() on the model instance produces the same output", () => {
    const model = defineModel({
      name: "gadgets",
      schema: { id: { type: "number", primaryKey: true } },
    });
    expect(model.toDropTableSQL()).toBe("DROP TABLE IF EXISTS gadgets;");
  });

  it("effectiveSchema() includes timestamp columns when timestamps: true", () => {
    const model = defineModel({
      name: "articles",
      schema: { id: { type: "number", primaryKey: true } },
      timestamps: true,
    });
    const schema = model.effectiveSchema();
    expect(schema).toHaveProperty("createdAt");
    expect(schema).toHaveProperty("updatedAt");
  });

  it("columnNames() returns all column names including timestamps", () => {
    const model = defineModel({
      name: "notes",
      schema: {
        id:    { type: "number", primaryKey: true },
        title: { type: "string" },
      },
      timestamps: true,
    });
    const cols = model.columnNames();
    expect(cols).toContain("id");
    expect(cols).toContain("title");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});
