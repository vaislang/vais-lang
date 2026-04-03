/**
 * @vaisx/db — Public API
 *
 * Re-exports all public APIs from the db package.
 */

// ─── Model factory & DDL helpers ──────────────────────────────────────────────
export {
  defineModel,
  toCreateTableSQL,
  toDropTableSQL,
  getModel,
  getRegisteredModels,
  clearModelRegistry,
} from "./model.js";
export type { RegisteredModel } from "./model.js";

// ─── Database client ──────────────────────────────────────────────────────────
export { createClient, createClientFromDriver } from "./client.js";

// ─── Query builder ────────────────────────────────────────────────────────────
export {
  createQueryBuilder,
  insertBuilder,
  updateBuilder,
  deleteBuilder,
  QueryBuilder,
  InsertBuilder,
  UpdateBuilder,
  DeleteBuilder,
} from "./query.js";
export type { SQLResult, ComparisonOperator, JoinType } from "./query.js";

// ─── Declarative schema builder ───────────────────────────────────────────────
export {
  text,
  integer,
  boolean,
  timestamp,
  json,
  uuid,
  defineSchema,
  toSQL,
} from "./schema.js";
export type {
  SQLColumnType,
  SchemaColumnDef,
  ColumnBuilder,
  IndexDef,
  CompiledSchema,
  SchemaBuilder,
} from "./schema.js";

// ─── Migration manager ────────────────────────────────────────────────────────
export {
  createMigration,
  generateMigrationSQL,
  diffSchemas,
  MigrationRunner,
} from "./migration.js";
export type {
  MigrationColumnDef,
  MigrationBuilder,
  Migration,
  MigrationOptions,
  MigrationSQL,
  MigrationStatus,
} from "./migration.js";

// ─── Driver adapters ──────────────────────────────────────────────────────────
export {
  createDriver,
  createSQLiteDriver,
  createPostgresDriver,
  createMySQLDriver,
  mapToSQLiteType,
  buildSQLiteColumnDef,
  SQLITE_TYPE_MAP,
  mapToPostgresType,
  buildPostgresColumnDef,
  toPostgresParams,
  POSTGRES_TYPE_MAP,
  mapToMySQLType,
  buildMySQLColumnDef,
  MYSQL_TYPE_MAP,
} from "./drivers/index.js";
export type {
  SQLiteConfig,
  SQLiteDatabase,
  SQLiteStatement,
  SQLiteColumnType,
  SQLiteAffinity,
  PostgresConfig,
  PoolInterface,
  PoolClient,
  PoolQueryResult,
  PostgresColumnType,
  PostgresSQLType,
  MySQLConfig,
  MySQLConnection,
  MySQLResultSetHeader,
  MySQLColumnType,
  MySQLSQLType,
} from "./drivers/index.js";

// ─── Server action integration ────────────────────────────────────────────────
export {
  createServerAction,
  serializeResult,
  deserializeResult,
  withTransaction,
} from "./server.js";
export type { ServerActionConfig, DeserializeSchema } from "./server.js";

// ─── Testing utilities ────────────────────────────────────────────────────────
export {
  defineFactory,
  withRollback,
  createTestContext,
  createSeeder,
  resetSequence,
  nextSeq,
  seqEmail,
} from "./testing.js";
export type {
  Factory,
  DefaultsResolver,
  TestContextConfig,
  TestContext,
  ScenarioFn,
  ScenarioMap,
  Seeder,
} from "./testing.js";

// ─── Type definitions ─────────────────────────────────────────────────────────
export type {
  // Column primitives
  ColumnType,
  ColumnDef,
  ForeignKeyRef,
  InferColumnType,
  // Schema & model
  ModelSchema,
  ModelDefinition,
  InferModel,
  // Relations
  Relation,
  // Query builder (legacy interface types)
  JoinClause,
  OrderByClause,
  // Database client
  DatabaseClient,
  Driver,
  // Configuration
  DatabaseConfig,
  // Migrations
  MigrationStep,
} from "./types.js";
