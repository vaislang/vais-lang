/**
 * testing.ts — Test utilities for @vaisx/db
 *
 * Provides factory pattern for seed data generation, transaction rollback
 * helpers, test context management, and seeder utilities.
 *
 * Usage:
 *   const userFactory = defineFactory("users", () => ({
 *     id: seq(),
 *     email: seqEmail("user"),
 *     name: "Test User",
 *   }));
 *
 *   const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
 *   await ctx.setup();
 *   await ctx.transaction(async (client) => {
 *     const user = await userFactory.create(client);
 *   }); // auto-rollback
 *   await ctx.teardown();
 */

import type { DatabaseClient, DatabaseConfig } from "./types.js";
import { createClient } from "./client.js";

// ─── Sequence counter ─────────────────────────────────────────────────────────

let _globalSeq = 0;

/**
 * Reset the global sequence counter.
 * Call this in beforeEach/afterEach to ensure deterministic sequences.
 */
export function resetSequence(): void {
  _globalSeq = 0;
}

/**
 * Return the next sequence integer (1-based auto-increment).
 */
export function nextSeq(): number {
  return ++_globalSeq;
}

/**
 * Return a sequenced email address like "user1@example.com".
 */
export function seqEmail(prefix: string = "user", domain: string = "example.com"): string {
  return `${prefix}${nextSeq()}@${domain}`;
}

// ─── Factory types ────────────────────────────────────────────────────────────

/**
 * A function that resolves defaults — can be a plain object or a factory
 * function that returns an object.  The factory function receives the current
 * sequence number so callers can embed unique values inline.
 */
export type DefaultsResolver<T> = T | (() => T);

/**
 * The object produced by `defineFactory`.
 */
export interface Factory<T extends Record<string, unknown>> {
  /** Table name this factory targets. */
  readonly table: string;

  /**
   * Build an in-memory object without touching the database.
   * Merges factory defaults with any supplied `overrides`.
   */
  build(overrides?: Partial<T>): T;

  /**
   * Build `count` in-memory objects.
   */
  buildMany(count: number, overrides?: Partial<T>): T[];

  /**
   * INSERT one row into the database and return the full object
   * (defaults merged with overrides).
   */
  create(client: DatabaseClient, overrides?: Partial<T>): Promise<T>;

  /**
   * INSERT `count` rows into the database and return them as an array.
   */
  createMany(client: DatabaseClient, count: number, overrides?: Partial<T>): Promise<T[]>;
}

// ─── defineFactory ────────────────────────────────────────────────────────────

/**
 * Define a factory for a given table.
 *
 * @param table    - SQL table name to INSERT into.
 * @param defaults - Default field values (plain object or zero-arg factory fn).
 *
 * @example
 * const userFactory = defineFactory("users", () => ({
 *   id: nextSeq(),
 *   name: "Alice",
 *   email: seqEmail("alice"),
 * }));
 */
export function defineFactory<T extends Record<string, unknown>>(
  table: string,
  defaults: DefaultsResolver<T>,
): Factory<T> {
  function resolveDefaults(): T {
    return typeof defaults === "function"
      ? (defaults as () => T)()
      : { ...(defaults as T) };
  }

  return {
    table,

    build(overrides?: Partial<T>): T {
      return { ...resolveDefaults(), ...(overrides ?? {}) } as T;
    },

    buildMany(count: number, overrides?: Partial<T>): T[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },

    async create(client: DatabaseClient, overrides?: Partial<T>): Promise<T> {
      const data = this.build(overrides);
      await client.insert<Record<string, unknown>>(table, data as Record<string, unknown>);
      return data;
    },

    async createMany(
      client: DatabaseClient,
      count: number,
      overrides?: Partial<T>,
    ): Promise<T[]> {
      const items: T[] = [];
      for (let i = 0; i < count; i++) {
        const item = await this.create(client, overrides);
        items.push(item);
      }
      return items;
    },
  };
}

// ─── withRollback ─────────────────────────────────────────────────────────────

/**
 * Execute `fn` inside a database transaction that is always rolled back.
 *
 * This is the primary test-isolation primitive: all writes made during `fn`
 * are discarded when `withRollback` returns (whether `fn` succeeds or throws).
 *
 * @param client - The DatabaseClient to use.
 * @param fn     - Async callback that receives a transactional client.
 * @returns The value returned by `fn`.
 */
export async function withRollback<R>(
  client: DatabaseClient,
  fn: (txClient: DatabaseClient) => Promise<R>,
): Promise<R> {
  // We abuse the transaction machinery: start a real transaction,
  // run the callback, then ALWAYS rollback — even on success.
  let result: R | undefined;
  let callbackError: unknown = undefined;
  let callbackRan = false;

  try {
    await client.transaction(async (txClient) => {
      callbackRan = true;
      try {
        result = await fn(txClient);
      } catch (err) {
        callbackError = err;
      }
      // Always throw to force rollback
      throw new _RollbackSignal();
    });
  } catch (err) {
    // Suppress our own rollback signal; re-throw anything else
    if (!(err instanceof _RollbackSignal)) {
      throw err;
    }
  }

  if (!callbackRan) {
    throw new Error("[vaisx/db] withRollback: transaction callback did not execute");
  }

  if (callbackError !== undefined) {
    throw callbackError;
  }

  return result as R;
}

/** Internal sentinel used to force a rollback inside `withRollback`. */
class _RollbackSignal extends Error {
  constructor() {
    super("__vaisx_rollback_signal__");
    this.name = "_RollbackSignal";
  }
}

// ─── TestContext ──────────────────────────────────────────────────────────────

/**
 * Configuration for `createTestContext`.
 */
export interface TestContextConfig extends DatabaseConfig {
  /** Optional SQL statements to run during setup (e.g. CREATE TABLE …). */
  setupSQL?: string[];
}

/**
 * A managed test context that wraps a DatabaseClient lifecycle.
 */
export interface TestContext {
  /** The underlying database client (available after `setup()`). */
  readonly client: DatabaseClient;

  /** Connect to the database and run any `setupSQL` statements. */
  setup(): Promise<void>;

  /** Close the database connection. */
  teardown(): Promise<void>;

  /**
   * Run `fn` inside a transaction that is always rolled back on completion.
   * Equivalent to `withRollback(ctx.client, fn)`.
   */
  transaction<R>(fn: (client: DatabaseClient) => Promise<R>): Promise<R>;

  /**
   * Insert seed data using a factory.
   *
   * @param factory - A Factory produced by `defineFactory`.
   * @param count   - Number of rows to create (default: 1).
   * @param overrides - Field overrides applied to every created row.
   */
  seed<T extends Record<string, unknown>>(
    factory: Factory<T>,
    count?: number,
    overrides?: Partial<T>,
  ): Promise<T[]>;

  /**
   * DELETE all rows from the given tables (in the order supplied).
   */
  clean(...tables: string[]): Promise<void>;
}

/**
 * Create a managed test context.
 *
 * @example
 * const ctx = createTestContext({ driver: "sqlite", filename: ":memory:" });
 * beforeAll(() => ctx.setup());
 * afterAll(() => ctx.teardown());
 */
export function createTestContext(config: TestContextConfig): TestContext {
  let _client: DatabaseClient | undefined;

  function getClient(): DatabaseClient {
    if (!_client) {
      throw new Error(
        "[vaisx/db] TestContext: call setup() before using the client.",
      );
    }
    return _client;
  }

  const ctx: TestContext = {
    get client(): DatabaseClient {
      return getClient();
    },

    async setup(): Promise<void> {
      _client = createClient(config);
      for (const sql of config.setupSQL ?? []) {
        await _client.query(sql);
      }
    },

    async teardown(): Promise<void> {
      if (_client) {
        await _client.close();
        _client = undefined;
      }
    },

    async transaction<R>(fn: (client: DatabaseClient) => Promise<R>): Promise<R> {
      return withRollback(getClient(), fn);
    },

    async seed<T extends Record<string, unknown>>(
      factory: Factory<T>,
      count: number = 1,
      overrides?: Partial<T>,
    ): Promise<T[]> {
      return factory.createMany(getClient(), count, overrides);
    },

    async clean(...tables: string[]): Promise<void> {
      const client = getClient();
      for (const table of tables) {
        await client.query(`DELETE FROM ${table}`);
      }
    },
  };

  return ctx;
}

// ─── Seeder ───────────────────────────────────────────────────────────────────

/**
 * A named scenario: a function that receives a DatabaseClient and seeds data.
 */
export type ScenarioFn = (client: DatabaseClient) => Promise<void>;

/**
 * A map of scenario names to their seed functions.
 */
export type ScenarioMap = Record<string, ScenarioFn>;

/**
 * The object returned by `createSeeder`.
 */
export interface Seeder {
  /**
   * Run a named scenario's seed function.
   *
   * @param client   - The DatabaseClient to use.
   * @param scenario - Key of the scenario to run.
   */
  seed(client: DatabaseClient, scenario: string): Promise<void>;

  /**
   * TRUNCATE all tables registered with the seeder.
   * Order is reversed to respect foreign-key constraints.
   */
  reset(client: DatabaseClient): Promise<void>;
}

/**
 * Create a seeder from a map of factories and optional scenarios.
 *
 * @param factories - Record of table-name → Factory (used to derive table list for reset).
 * @param scenarios - Named seed scenarios.
 *
 * @example
 * const seeder = createSeeder(
 *   { users: userFactory, posts: postFactory },
 *   {
 *     default: async (client) => {
 *       await userFactory.create(client, { name: "Alice" });
 *     },
 *   },
 * );
 */
export function createSeeder(
  factories: Record<string, Factory<Record<string, unknown>>>,
  scenarios: ScenarioMap = {},
): Seeder {
  return {
    async seed(client: DatabaseClient, scenario: string): Promise<void> {
      const fn = scenarios[scenario];
      if (!fn) {
        throw new Error(
          `[vaisx/db] Seeder: unknown scenario "${scenario}". ` +
          `Available: ${Object.keys(scenarios).join(", ") || "(none)"}`,
        );
      }
      await fn(client);
    },

    async reset(client: DatabaseClient): Promise<void> {
      // Reverse order helps with FK constraints (children before parents)
      const tables = Object.values(factories)
        .map((f) => f.table)
        .reverse();
      for (const table of tables) {
        await client.query(`DELETE FROM ${table}`);
      }
    },
  };
}
