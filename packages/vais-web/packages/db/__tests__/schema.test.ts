import { describe, it, expect } from "vitest";
import {
  text,
  integer,
  boolean,
  timestamp,
  json,
  uuid,
  defineSchema,
  toSQL,
} from "../src/schema.js";
import type { CompiledSchema } from "../src/schema.js";

// ─── Column helpers ───────────────────────────────────────────────────────────

describe("column helpers — basic types", () => {
  it("text() produces a TEXT column def", () => {
    const col = text()._def();
    expect(col.sqlType).toBe("TEXT");
    expect(col.type).toBe("string");
  });

  it("integer() produces an INTEGER column def", () => {
    const col = integer()._def();
    expect(col.sqlType).toBe("INTEGER");
    expect(col.type).toBe("number");
  });

  it("boolean() produces a BOOLEAN column def", () => {
    const col = boolean()._def();
    expect(col.sqlType).toBe("BOOLEAN");
    expect(col.type).toBe("boolean");
  });

  it("timestamp() produces a TIMESTAMP column def", () => {
    const col = timestamp()._def();
    expect(col.sqlType).toBe("TIMESTAMP");
    expect(col.type).toBe("date");
  });

  it("json() produces a JSON column def", () => {
    const col = json()._def();
    expect(col.sqlType).toBe("JSON");
    expect(col.type).toBe("json");
  });

  it("uuid() produces a UUID column def", () => {
    const col = uuid()._def();
    expect(col.sqlType).toBe("UUID");
    expect(col.type).toBe("string");
  });
});

// ─── Chaining ─────────────────────────────────────────────────────────────────

describe("column helpers — chaining", () => {
  it(".primaryKey() sets primaryKey flag", () => {
    expect(uuid().primaryKey()._def().primaryKey).toBe(true);
  });

  it(".nullable() sets nullable flag", () => {
    expect(text().nullable()._def().nullable).toBe(true);
  });

  it(".default() stores the default value", () => {
    expect(integer().default(42)._def().default).toBe(42);
  });

  it(".default() stores a string default value", () => {
    expect(text().default("anon")._def().default).toBe("anon");
  });

  it(".unique() sets the unique flag", () => {
    expect(text().unique()._def().unique).toBe(true);
  });

  it(".references() stores a foreign key reference", () => {
    const col = integer().references("posts", "id")._def();
    expect(col.references).toEqual({ table: "posts", column: "id" });
  });

  it(".references() stores reference without explicit column", () => {
    const col = integer().references("users")._def();
    expect(col.references?.table).toBe("users");
  });

  it("multiple chainings work on the same builder", () => {
    const col = text().nullable().unique().default("x")._def();
    expect(col.nullable).toBe(true);
    expect(col.unique).toBe(true);
    expect(col.default).toBe("x");
  });
});

// ─── defineSchema ─────────────────────────────────────────────────────────────

describe("defineSchema()", () => {
  it("returns a CompiledSchema with the correct table name", () => {
    const s = defineSchema("articles", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    expect(s.name).toBe("articles");
  });

  it("stores columns in insertion order", () => {
    const s = defineSchema("items", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("name", text());
      t.addColumn("qty", integer());
    });
    expect(s.columns.map((c) => c.name)).toEqual(["id", "name", "qty"]);
  });

  it("addTimestamps() appends createdAt and updatedAt columns", () => {
    const s = defineSchema("posts", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addTimestamps();
    });
    const names = s.columns.map((c) => c.name);
    expect(names).toContain("createdAt");
    expect(names).toContain("updatedAt");
  });

  it("addTimestamps() sets default CURRENT_TIMESTAMP", () => {
    const s = defineSchema("logs", (t) => {
      t.addTimestamps();
    });
    const createdAt = s.columns.find((c) => c.name === "createdAt");
    expect(createdAt?.default).toBe("CURRENT_TIMESTAMP");
  });

  it("addIndex() stores the index definition", () => {
    const s = defineSchema("orders", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("status", text());
      t.addIndex("idx_orders_status", ["status"]);
    });
    expect(s.indexes).toHaveLength(1);
    expect(s.indexes[0].name).toBe("idx_orders_status");
    expect(s.indexes[0].columns).toEqual(["status"]);
  });

  it("addIndex() stores a unique index", () => {
    const s = defineSchema("emails", (t) => {
      t.addColumn("email", text());
      t.addIndex("uq_emails_email", ["email"], true);
    });
    expect(s.indexes[0].unique).toBe(true);
  });
});

// ─── toSQL ────────────────────────────────────────────────────────────────────

describe("toSQL()", () => {
  it("generates CREATE TABLE IF NOT EXISTS", () => {
    const s = defineSchema("users", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    expect(toSQL(s)).toMatch(/^CREATE TABLE IF NOT EXISTS users/);
  });

  it("includes PRIMARY KEY for pk column", () => {
    const s = defineSchema("pktable", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    expect(toSQL(s)).toContain("PRIMARY KEY");
  });

  it("includes NOT NULL for non-nullable non-pk column", () => {
    const s = defineSchema("nn_test", (t) => {
      t.addColumn("name", text());
    });
    expect(toSQL(s)).toContain("NOT NULL");
  });

  it("omits NOT NULL for nullable column", () => {
    const s = defineSchema("null_test", (t) => {
      t.addColumn("bio", text().nullable());
    });
    const sql = toSQL(s);
    expect(sql).not.toContain("NOT NULL");
  });

  it("includes UNIQUE for unique column", () => {
    const s = defineSchema("uq_test", (t) => {
      t.addColumn("email", text().unique());
    });
    expect(toSQL(s)).toContain("UNIQUE");
  });

  it("includes DEFAULT for column with default value", () => {
    const s = defineSchema("def_test", (t) => {
      t.addColumn("active", boolean().default(true));
    });
    expect(toSQL(s)).toContain("DEFAULT true");
  });

  it("wraps string defaults in single quotes", () => {
    const s = defineSchema("str_def", (t) => {
      t.addColumn("role", text().default("user"));
    });
    expect(toSQL(s)).toContain("DEFAULT 'user'");
  });

  it("includes REFERENCES clause for foreign key column", () => {
    const s = defineSchema("comments", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("postId", uuid().references("posts", "id"));
    });
    expect(toSQL(s)).toContain("REFERENCES posts(id)");
  });

  it("generates CREATE INDEX statement for an index", () => {
    const s = defineSchema("indexed", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("email", text());
      t.addIndex("idx_indexed_email", ["email"]);
    });
    expect(toSQL(s)).toContain(
      "CREATE INDEX IF NOT EXISTS idx_indexed_email ON indexed (email);",
    );
  });

  it("generates CREATE UNIQUE INDEX for a unique index", () => {
    const s = defineSchema("uq_indexed", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("slug", text());
      t.addIndex("uq_slug", ["slug"], true);
    });
    expect(toSQL(s)).toContain("CREATE UNIQUE INDEX");
  });

  it("handles a full realistic schema without throwing", () => {
    const s = defineSchema("full_test", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("title", text().unique());
      t.addColumn("count", integer().default(0));
      t.addColumn("meta", json().nullable());
      t.addColumn("active", boolean().default(true));
      t.addColumn("publishedAt", timestamp().nullable());
      t.addColumn("authorId", uuid().references("authors", "id"));
      t.addTimestamps();
      t.addIndex("idx_full_title", ["title"]);
    });
    const sql = toSQL(s);
    expect(typeof sql).toBe("string");
    expect(sql.length).toBeGreaterThan(0);
  }) satisfies void;
});

// Ensure the schema type is accessible
describe("CompiledSchema type check", () => {
  it("compiled schema has expected shape", () => {
    const s: CompiledSchema = defineSchema("type_check", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    expect(s).toHaveProperty("name");
    expect(s).toHaveProperty("columns");
    expect(s).toHaveProperty("indexes");
  });
});
