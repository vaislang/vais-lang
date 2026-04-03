/**
 * @vaisx/db — query.ts tests
 *
 * Covers QueryBuilder (SELECT), InsertBuilder, UpdateBuilder, DeleteBuilder:
 * - toSQL() output (sql string + params array)
 * - Chaining API (select / where / andWhere / orWhere / join / groupBy /
 *   having / orderBy / limit / offset)
 * - All comparison operators
 * - execute() delegation to a mock driver
 */

import { describe, it, expect, vi } from "vitest";
import {
  createQueryBuilder,
  insertBuilder,
  updateBuilder,
  deleteBuilder,
  QueryBuilder,
  InsertBuilder,
  UpdateBuilder,
  DeleteBuilder,
} from "../src/query.js";
import type { Driver } from "../src/types.js";

// ─── Mock driver helper ───────────────────────────────────────────────────────

function makeMockDriver(
  queryResult: unknown[] = [],
  executeResult: { rowsAffected: number; insertId?: number } = { rowsAffected: 1 },
): Driver {
  return {
    query: vi.fn().mockResolvedValue(queryResult),
    execute: vi.fn().mockResolvedValue(executeResult),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── SELECT — factory ─────────────────────────────────────────────────────────

describe("createQueryBuilder — factory", () => {
  it("returns a QueryBuilder instance", () => {
    const qb = createQueryBuilder("users");
    expect(qb).toBeInstanceOf(QueryBuilder);
  });

  it("defaults to SELECT * when no columns are specified", () => {
    const { sql } = createQueryBuilder("users").toSQL();
    expect(sql).toBe("SELECT * FROM users");
  });

  it("select(...columns) restricts the columns", () => {
    const { sql } = createQueryBuilder<{ id: number; name: string }>("users")
      .select("id", "name")
      .toSQL();
    expect(sql).toBe("SELECT id, name FROM users");
    expect(sql).not.toContain("*");
  });
});

// ─── SELECT — WHERE ───────────────────────────────────────────────────────────

describe("QueryBuilder — WHERE conditions", () => {
  it("where() adds a basic equality condition", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("active", "=", true)
      .toSQL();
    expect(sql).toBe("SELECT * FROM users WHERE active = $1");
    expect(params).toEqual([true]);
  });

  it("where() supports != operator", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("role", "!=", "admin")
      .toSQL();
    expect(sql).toContain("role != $1");
    expect(params).toEqual(["admin"]);
  });

  it("where() supports < operator", () => {
    const { sql, params } = createQueryBuilder("orders")
      .where("total", "<", 100)
      .toSQL();
    expect(sql).toContain("total < $1");
    expect(params).toEqual([100]);
  });

  it("where() supports > operator", () => {
    const { sql, params } = createQueryBuilder("orders")
      .where("total", ">", 50)
      .toSQL();
    expect(sql).toContain("total > $1");
    expect(params).toEqual([50]);
  });

  it("where() supports <= operator", () => {
    const { sql, params } = createQueryBuilder("products")
      .where("price", "<=", 99.99)
      .toSQL();
    expect(sql).toContain("price <= $1");
    expect(params).toEqual([99.99]);
  });

  it("where() supports >= operator", () => {
    const { sql, params } = createQueryBuilder("products")
      .where("stock", ">=", 1)
      .toSQL();
    expect(sql).toContain("stock >= $1");
    expect(params).toEqual([1]);
  });

  it("where() supports LIKE operator", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("email", "LIKE", "%@example.com")
      .toSQL();
    expect(sql).toContain("email LIKE $1");
    expect(params).toEqual(["%@example.com"]);
  });

  it("where() supports IN operator with an array", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("role", "IN", ["admin", "editor"])
      .toSQL();
    expect(sql).toContain("role IN ($1, $2)");
    expect(params).toEqual(["admin", "editor"]);
  });

  it("where() supports IS NULL operator (no param emitted)", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("deletedAt", "IS NULL")
      .toSQL();
    expect(sql).toContain("deletedAt IS NULL");
    expect(params).toHaveLength(0);
  });

  it("where() supports IS NOT NULL operator (no param emitted)", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("verifiedAt", "IS NOT NULL")
      .toSQL();
    expect(sql).toContain("verifiedAt IS NOT NULL");
    expect(params).toHaveLength(0);
  });

  it("andWhere() chains conditions with AND", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("active", "=", true)
      .andWhere("role", "=", "admin")
      .toSQL();
    expect(sql).toBe("SELECT * FROM users WHERE active = $1 AND role = $2");
    expect(params).toEqual([true, "admin"]);
  });

  it("orWhere() chains conditions with OR", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("role", "=", "admin")
      .orWhere("role", "=", "superadmin")
      .toSQL();
    expect(sql).toBe("SELECT * FROM users WHERE role = $1 OR role = $2");
    expect(params).toEqual(["admin", "superadmin"]);
  });

  it("mixed andWhere / orWhere chains correctly", () => {
    const { sql, params } = createQueryBuilder("posts")
      .where("published", "=", true)
      .andWhere("authorId", "=", 5)
      .orWhere("featured", "=", true)
      .toSQL();
    expect(sql).toContain("published = $1 AND authorId = $2 OR featured = $3");
    expect(params).toEqual([true, 5, true]);
  });
});

// ─── SELECT — JOIN ────────────────────────────────────────────────────────────

describe("QueryBuilder — JOIN clauses", () => {
  it("join() defaults to INNER JOIN", () => {
    const { sql } = createQueryBuilder("posts")
      .join("users", "users.id = posts.userId")
      .toSQL();
    expect(sql).toContain("INNER JOIN users ON users.id = posts.userId");
  });

  it("join() with explicit LEFT type", () => {
    const { sql } = createQueryBuilder("posts")
      .join("comments", "comments.postId = posts.id", "LEFT")
      .toSQL();
    expect(sql).toContain("LEFT JOIN comments ON comments.postId = posts.id");
  });

  it("join() with explicit RIGHT type", () => {
    const { sql } = createQueryBuilder("employees")
      .join("departments", "departments.id = employees.deptId", "RIGHT")
      .toSQL();
    expect(sql).toContain("RIGHT JOIN departments ON departments.id = employees.deptId");
  });

  it("multiple joins are all included", () => {
    const { sql } = createQueryBuilder("orders")
      .join("customers", "customers.id = orders.customerId", "LEFT")
      .join("products", "products.id = orders.productId", "INNER")
      .toSQL();
    expect(sql).toContain("LEFT JOIN customers");
    expect(sql).toContain("INNER JOIN products");
  });

  it("JOIN appears before WHERE in the SQL", () => {
    const { sql } = createQueryBuilder("posts")
      .join("users", "users.id = posts.userId")
      .where("posts.published", "=", true)
      .toSQL();
    const joinIndex = sql.indexOf("JOIN");
    const whereIndex = sql.indexOf("WHERE");
    expect(joinIndex).toBeLessThan(whereIndex);
  });
});

// ─── SELECT — ORDER BY / LIMIT / OFFSET ──────────────────────────────────────

describe("QueryBuilder — ORDER BY / LIMIT / OFFSET", () => {
  it("orderBy() adds ASC by default", () => {
    const { sql } = createQueryBuilder("users").orderBy("name").toSQL();
    expect(sql).toContain("ORDER BY name ASC");
  });

  it("orderBy() respects explicit DESC direction", () => {
    const { sql } = createQueryBuilder("users").orderBy("createdAt", "DESC").toSQL();
    expect(sql).toContain("ORDER BY createdAt DESC");
  });

  it("multiple orderBy() calls are combined", () => {
    const { sql } = createQueryBuilder("users")
      .orderBy("lastName", "ASC")
      .orderBy("firstName", "ASC")
      .toSQL();
    expect(sql).toContain("ORDER BY lastName ASC, firstName ASC");
  });

  it("limit() adds a LIMIT clause with a positional param", () => {
    const { sql, params } = createQueryBuilder("users").limit(10).toSQL();
    expect(sql).toContain("LIMIT $1");
    expect(params).toContain(10);
  });

  it("offset() adds an OFFSET clause with a positional param", () => {
    const { sql, params } = createQueryBuilder("users").offset(20).toSQL();
    expect(sql).toContain("OFFSET $1");
    expect(params).toContain(20);
  });

  it("limit + offset param indices are correct after WHERE params", () => {
    const { sql, params } = createQueryBuilder("users")
      .where("active", "=", true)
      .limit(5)
      .offset(10)
      .toSQL();
    // active = $1, LIMIT $2, OFFSET $3
    expect(sql).toContain("LIMIT $2");
    expect(sql).toContain("OFFSET $3");
    expect(params).toEqual([true, 5, 10]);
  });
});

// ─── SELECT — GROUP BY / HAVING ───────────────────────────────────────────────

describe("QueryBuilder — GROUP BY / HAVING", () => {
  it("groupBy() adds a GROUP BY clause", () => {
    const { sql } = createQueryBuilder("orders")
      .groupBy("customerId")
      .toSQL();
    expect(sql).toContain("GROUP BY customerId");
  });

  it("groupBy() with multiple columns", () => {
    const { sql } = createQueryBuilder("sales")
      .groupBy("region", "year")
      .toSQL();
    expect(sql).toContain("GROUP BY region, year");
  });

  it("having() adds a HAVING clause with positional param", () => {
    const { sql, params } = createQueryBuilder("orders")
      .groupBy("customerId")
      .having("total", ">", 500)
      .toSQL();
    expect(sql).toContain("HAVING total > $1");
    expect(params).toContain(500);
  });
});

// ─── SELECT — execute() ───────────────────────────────────────────────────────

describe("QueryBuilder — execute()", () => {
  it("execute() calls driver.query with correct sql and params", async () => {
    const driver = makeMockDriver([{ id: 1 }]);
    const result = await createQueryBuilder("users")
      .where("id", "=", 1)
      .execute(driver);

    expect(driver.query).toHaveBeenCalledOnce();
    const [calledSql, calledParams] = (driver.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledSql).toContain("WHERE id = $1");
    expect(calledParams).toEqual([1]);
    expect(result).toEqual([{ id: 1 }]);
  });
});

// ─── INSERT ───────────────────────────────────────────────────────────────────

describe("insertBuilder — toSQL()", () => {
  it("returns an InsertBuilder instance", () => {
    expect(insertBuilder("users")).toBeInstanceOf(InsertBuilder);
  });

  it("generates a basic INSERT statement", () => {
    const { sql, params } = insertBuilder("users")
      .values({ name: "Alice", email: "alice@example.com" })
      .toSQL();
    expect(sql).toContain("INSERT INTO users");
    expect(sql).toContain("name");
    expect(sql).toContain("email");
    expect(params).toContain("Alice");
    expect(params).toContain("alice@example.com");
  });

  it("uses positional $N placeholders for values", () => {
    const { sql } = insertBuilder("users")
      .values({ name: "Bob" })
      .toSQL();
    expect(sql).toContain("$1");
  });

  it("adds RETURNING clause when returning() is called", () => {
    const { sql } = insertBuilder("users")
      .values({ name: "Carol" })
      .returning("id", "createdAt")
      .toSQL();
    expect(sql).toContain("RETURNING id, createdAt");
  });

  it("throws when no values are provided", () => {
    expect(() => insertBuilder("users").toSQL()).toThrow(/no values provided/i);
  });

  it("execute() calls driver.execute with correct sql and params", async () => {
    const driver = makeMockDriver([], { rowsAffected: 1, insertId: 42 });
    const result = await insertBuilder("users")
      .values({ name: "Dave" })
      .execute(driver);

    expect(driver.execute).toHaveBeenCalledOnce();
    expect(result.rowsAffected).toBe(1);
    expect(result.insertId).toBe(42);
  });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

describe("updateBuilder — toSQL()", () => {
  it("returns an UpdateBuilder instance", () => {
    expect(updateBuilder("users")).toBeInstanceOf(UpdateBuilder);
  });

  it("generates a basic UPDATE statement", () => {
    const { sql, params } = updateBuilder("users")
      .set({ name: "Alice Updated" })
      .where("id", "=", 1)
      .toSQL();
    expect(sql).toContain("UPDATE users SET name = $1");
    expect(sql).toContain("WHERE id = $2");
    expect(params).toEqual(["Alice Updated", 1]);
  });

  it("SET clause uses correct $N indices for multiple columns", () => {
    const { sql, params } = updateBuilder("users")
      .set({ name: "X", email: "x@x.com" })
      .where("id", "=", 99)
      .toSQL();
    // SET name=$1, email=$2 WHERE id=$3
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(params).toHaveLength(3);
  });

  it("UPDATE with IS NULL WHERE condition emits no extra param", () => {
    const { sql, params } = updateBuilder("users")
      .set({ verified: true })
      .where("deletedAt", "IS NULL")
      .toSQL();
    expect(sql).toContain("WHERE deletedAt IS NULL");
    // Only the SET param should be in params
    expect(params).toEqual([true]);
  });

  it("throws when no data is provided to set()", () => {
    expect(() => updateBuilder("users").where("id", "=", 1).toSQL()).toThrow(/no data provided/i);
  });

  it("execute() calls driver.execute with correct sql and params", async () => {
    const driver = makeMockDriver();
    await updateBuilder("users").set({ active: false }).where("id", "=", 3).execute(driver);
    expect(driver.execute).toHaveBeenCalledOnce();
    const [calledSql, calledParams] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledSql).toContain("UPDATE users");
    expect(calledParams).toEqual([false, 3]);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("deleteBuilder — toSQL()", () => {
  it("returns a DeleteBuilder instance", () => {
    expect(deleteBuilder("users")).toBeInstanceOf(DeleteBuilder);
  });

  it("generates a basic DELETE statement", () => {
    const { sql, params } = deleteBuilder("users")
      .where("id", "=", 5)
      .toSQL();
    expect(sql).toBe("DELETE FROM users WHERE id = $1");
    expect(params).toEqual([5]);
  });

  it("DELETE with no WHERE generates bare DELETE", () => {
    const { sql, params } = deleteBuilder("sessions").toSQL();
    expect(sql).toBe("DELETE FROM sessions");
    expect(params).toHaveLength(0);
  });

  it("DELETE with IN operator", () => {
    const { sql, params } = deleteBuilder("logs")
      .where("level", "IN", ["debug", "trace"])
      .toSQL();
    expect(sql).toContain("level IN ($1, $2)");
    expect(params).toEqual(["debug", "trace"]);
  });

  it("DELETE with IS NOT NULL condition", () => {
    const { sql, params } = deleteBuilder("tokens")
      .where("expiredAt", "IS NOT NULL")
      .toSQL();
    expect(sql).toBe("DELETE FROM tokens WHERE expiredAt IS NOT NULL");
    expect(params).toHaveLength(0);
  });

  it("execute() calls driver.execute with correct sql and params", async () => {
    const driver = makeMockDriver();
    await deleteBuilder("users").where("id", "=", 7).execute(driver);
    expect(driver.execute).toHaveBeenCalledOnce();
    const [calledSql, calledParams] = (driver.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledSql).toBe("DELETE FROM users WHERE id = $1");
    expect(calledParams).toEqual([7]);
  });
});

// ─── Integration: complex SELECT ─────────────────────────────────────────────

describe("QueryBuilder — complex query integration", () => {
  it("combines select + join + where + groupBy + having + orderBy + limit + offset", () => {
    const { sql, params } = createQueryBuilder("orders")
      .select("customerId", "total")
      .join("customers", "customers.id = orders.customerId", "LEFT")
      .where("orders.status", "=", "completed")
      .groupBy("customerId")
      .having("total", ">", 1000)
      .orderBy("total", "DESC")
      .limit(5)
      .offset(0)
      .toSQL();

    expect(sql).toContain("SELECT customerId, total FROM orders");
    expect(sql).toContain("LEFT JOIN customers ON customers.id = orders.customerId");
    expect(sql).toContain("WHERE orders.status = $1");
    expect(sql).toContain("GROUP BY customerId");
    expect(sql).toContain("HAVING total > $2");
    expect(sql).toContain("ORDER BY total DESC");
    expect(sql).toContain("LIMIT $3");
    expect(sql).toContain("OFFSET $4");
    expect(params).toEqual(["completed", 1000, 5, 0]);
  });

  it("param indices are contiguous across WHERE + HAVING + LIMIT + OFFSET", () => {
    const { params } = createQueryBuilder("sales")
      .where("region", "=", "US")
      .andWhere("year", ">=", 2020)
      .groupBy("region")
      .having("revenue", ">", 500000)
      .limit(10)
      .offset(20)
      .toSQL();

    expect(params).toEqual(["US", 2020, 500000, 10, 20]);
  });
});
