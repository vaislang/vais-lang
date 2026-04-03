import { describe, it, expect, beforeEach } from "vitest";
import {
  createMigration,
  generateMigrationSQL,
  MigrationRunner,
  diffSchemas,
} from "../src/migration.js";
import { defineSchema, uuid, text, integer, boolean } from "../src/schema.js";
import type { Migration, MigrationBuilder } from "../src/migration.js";

// ─── createMigration ──────────────────────────────────────────────────────────

describe("createMigration()", () => {
  it("returns a migration with the supplied name", () => {
    const m = createMigration("create_users", {
      up: (b) => b.createTable("users", { id: { type: "UUID", primaryKey: true } }),
      down: (b) => b.dropTable("users"),
    });
    expect(m.name).toBe("create_users");
  });

  it("auto-generates a version string if not supplied", () => {
    const m = createMigration("auto_version", {
      up: () => {},
      down: () => {},
    });
    expect(typeof m.version).toBe("string");
    expect(m.version.length).toBeGreaterThan(0);
  });

  it("uses the supplied version string", () => {
    const m = createMigration("fixed_version", {
      version: "2024-01-01T00:00:00.000Z",
      up: () => {},
      down: () => {},
    });
    expect(m.version).toBe("2024-01-01T00:00:00.000Z");
  });

  it("stores the up callback", () => {
    const upFn = (b: MigrationBuilder) =>
      b.createTable("t", { id: { type: "INTEGER", primaryKey: true } });
    const m = createMigration("cb_test", { up: upFn, down: () => {} });
    expect(m.up).toBe(upFn);
  });

  it("stores the down callback", () => {
    const downFn = (b: MigrationBuilder) => b.dropTable("t");
    const m = createMigration("cb_test2", { up: () => {}, down: downFn });
    expect(m.down).toBe(downFn);
  });
});

// ─── generateMigrationSQL ─────────────────────────────────────────────────────

describe("generateMigrationSQL()", () => {
  it("generates up SQL with CREATE TABLE", () => {
    const m = createMigration("gen_create", {
      version: "2024-01-01T00:00:00.000Z",
      up: (b) =>
        b.createTable("posts", { id: { type: "UUID", primaryKey: true } }),
      down: (b) => b.dropTable("posts"),
    });
    const sql = generateMigrationSQL(m);
    expect(sql.up).toContain("CREATE TABLE IF NOT EXISTS posts");
  });

  it("generates down SQL with DROP TABLE", () => {
    const m = createMigration("gen_drop", {
      version: "2024-01-01T00:00:00.001Z",
      up: (b) =>
        b.createTable("posts", { id: { type: "UUID", primaryKey: true } }),
      down: (b) => b.dropTable("posts"),
    });
    const sql = generateMigrationSQL(m);
    expect(sql.down).toContain("DROP TABLE IF EXISTS posts");
  });

  it("includes the version in the returned object", () => {
    const m = createMigration("ver_check", {
      version: "2024-06-15T12:00:00.000Z",
      up: () => {},
      down: () => {},
    });
    expect(generateMigrationSQL(m).version).toBe("2024-06-15T12:00:00.000Z");
  });

  it("generates addColumn SQL", () => {
    const m = createMigration("add_col", {
      version: "2024-02-01T00:00:00.000Z",
      up: (b) => b.addColumn("users", "age", { type: "INTEGER", nullable: true }),
      down: (b) => b.dropColumn("users", "age"),
    });
    const sql = generateMigrationSQL(m);
    expect(sql.up).toContain("ALTER TABLE users ADD COLUMN age INTEGER");
    expect(sql.down).toContain("ALTER TABLE users DROP COLUMN age");
  });

  it("generates renameColumn SQL", () => {
    const m = createMigration("rename_col", {
      version: "2024-03-01T00:00:00.000Z",
      up: (b) => b.renameColumn("users", "name", "fullName"),
      down: (b) => b.renameColumn("users", "fullName", "name"),
    });
    const sql = generateMigrationSQL(m);
    expect(sql.up).toContain(
      "ALTER TABLE users RENAME COLUMN name TO fullName",
    );
    expect(sql.down).toContain(
      "ALTER TABLE users RENAME COLUMN fullName TO name",
    );
  });

  it("generates multiple statements when multiple operations are performed", () => {
    const m = createMigration("multi_op", {
      version: "2024-04-01T00:00:00.000Z",
      up: (b) => {
        b.createTable("tags", { id: { type: "UUID", primaryKey: true } });
        b.createTable("tag_links", {
          tagId: { type: "UUID", references: { table: "tags" } },
        });
      },
      down: (b) => {
        b.dropTable("tag_links");
        b.dropTable("tags");
      },
    });
    const sql = generateMigrationSQL(m);
    expect(sql.up.split("CREATE TABLE").length - 1).toBe(2);
    expect(sql.down.split("DROP TABLE").length - 1).toBe(2);
  });

  it("includes NOT NULL for non-nullable column in createTable", () => {
    const m = createMigration("not_null_test", {
      version: "2024-05-01T00:00:00.000Z",
      up: (b) =>
        b.createTable("items", {
          id: { type: "UUID", primaryKey: true },
          name: { type: "TEXT" }, // nullable not set → NOT NULL
        }),
      down: (b) => b.dropTable("items"),
    });
    const sql = generateMigrationSQL(m);
    expect(sql.up).toContain("NOT NULL");
  });
});

// ─── MigrationRunner ──────────────────────────────────────────────────────────

describe("MigrationRunner", () => {
  let migrations: Migration[];

  beforeEach(() => {
    migrations = [
      createMigration("create_users", {
        version: "2024-01-01T00:00:00.000Z",
        up: (b) =>
          b.createTable("users", { id: { type: "UUID", primaryKey: true } }),
        down: (b) => b.dropTable("users"),
      }),
      createMigration("create_posts", {
        version: "2024-01-02T00:00:00.000Z",
        up: (b) =>
          b.createTable("posts", { id: { type: "UUID", primaryKey: true } }),
        down: (b) => b.dropTable("posts"),
      }),
    ];
  });

  it("status() returns all migrations as not applied initially", () => {
    const runner = new MigrationRunner(migrations);
    const statuses = runner.status();
    expect(statuses.every((s) => !s.applied)).toBe(true);
  });

  it("pending() returns all migrations when none are applied", () => {
    const runner = new MigrationRunner(migrations);
    expect(runner.pending()).toHaveLength(2);
  });

  it("migrate() applies all pending migrations", () => {
    const runner = new MigrationRunner(migrations);
    const results = runner.migrate();
    expect(results).toHaveLength(2);
  });

  it("migrate() marks migrations as applied", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    expect(runner.pending()).toHaveLength(0);
  });

  it("pending() is empty after migrate()", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    expect(runner.pending().length).toBe(0);
  });

  it("status() shows applied=true after migrate()", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    expect(runner.status().every((s) => s.applied)).toBe(true);
  });

  it("rollback() reverts the last migration", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    const result = runner.rollback();
    expect(result).not.toBeNull();
    expect(result?.down).toContain("DROP TABLE IF EXISTS posts");
  });

  it("rollback() returns null when nothing is applied", () => {
    const runner = new MigrationRunner(migrations);
    expect(runner.rollback()).toBeNull();
  });

  it("rollback() makes the last migration pending again", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    runner.rollback();
    expect(runner.pending()).toHaveLength(1);
  });

  it("migrate() returns empty array when all migrations are already applied", () => {
    const runner = new MigrationRunner(migrations);
    runner.migrate();
    expect(runner.migrate()).toHaveLength(0);
  });

  it("runner sorts migrations by version", () => {
    // Supply in reverse order
    const reversed = [...migrations].reverse();
    const runner = new MigrationRunner(reversed);
    const results = runner.migrate();
    // First result should be the earlier migration
    expect(results[0].up).toContain("users");
  });
});

// ─── diffSchemas ──────────────────────────────────────────────────────────────

describe("diffSchemas()", () => {
  it("creates a table when oldSchema is null", () => {
    const newS = defineSchema("brands", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("name", text());
    });
    const migration = diffSchemas(null, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.up).toContain("CREATE TABLE IF NOT EXISTS brands");
  });

  it("down SQL drops the table when oldSchema is null", () => {
    const newS = defineSchema("widgets", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const migration = diffSchemas(null, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.down).toContain("DROP TABLE IF EXISTS widgets");
  });

  it("generates addColumn for new columns", () => {
    const oldS = defineSchema("products", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const newS = defineSchema("products", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("price", integer());
    });
    const migration = diffSchemas(oldS, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.up).toContain("ADD COLUMN price");
  });

  it("generates dropColumn for removed columns", () => {
    const oldS = defineSchema("catalog", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("sku", text());
    });
    const newS = defineSchema("catalog", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const migration = diffSchemas(oldS, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.up).toContain("DROP COLUMN sku");
  });

  it("down reverses addColumn with dropColumn", () => {
    const oldS = defineSchema("inventory", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const newS = defineSchema("inventory", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("qty", integer());
    });
    const migration = diffSchemas(oldS, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.down).toContain("DROP COLUMN qty");
  });

  it("down reverses dropColumn with addColumn", () => {
    const oldS = defineSchema("events", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("location", text());
    });
    const newS = defineSchema("events", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const migration = diffSchemas(oldS, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.down).toContain("ADD COLUMN location");
  });

  it("handles no-op diff (identical schemas)", () => {
    const s = defineSchema("static_table", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    // Pass the same schema as both old and new — column sets are equal
    const oldS = defineSchema("static_table_old", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    // Simulate same-name diff
    const oldClone = { ...oldS, name: "static_table" };
    const migration = diffSchemas(oldClone, s);
    const sql = generateMigrationSQL(migration);
    // No statements in up or down (empty strings)
    expect(sql.up.trim()).toBe("");
    expect(sql.down.trim()).toBe("");
  });

  it("generates a migration with a non-empty version", () => {
    const newS = defineSchema("ver_check", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const migration = diffSchemas(null, newS);
    expect(migration.version.length).toBeGreaterThan(0);
  });

  it("includes boolean column type in generated SQL", () => {
    const oldS = defineSchema("settings", (t) => {
      t.addColumn("id", uuid().primaryKey());
    });
    const newS = defineSchema("settings", (t) => {
      t.addColumn("id", uuid().primaryKey());
      t.addColumn("enabled", boolean().default(true));
    });
    const migration = diffSchemas(oldS, newS);
    const sql = generateMigrationSQL(migration);
    expect(sql.up).toContain("enabled BOOLEAN");
  });
});
