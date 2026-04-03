/**
 * server.ts — Server action integration with automatic DB query serialization.
 *
 * Provides:
 *  - createServerAction(handler, config?) — wraps a DB handler with auto transaction + serialization
 *  - serializeResult(data)               — converts DB results to JSON-safe form
 *  - deserializeResult(data, schema?)    — restores serialized data back to native types
 *  - withTransaction(client, handler)    — low-level transaction wrapper
 *  - ServerActionConfig                  — configuration type
 */

import type { DatabaseClient } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration options for createServerAction.
 */
export interface ServerActionConfig {
  /** Timeout in milliseconds for the action. */
  timeout?: number;
  /** Number of retry attempts on failure (default: 0). */
  retries?: number;
  /** Error callback invoked before re-throwing. */
  onError?: (error: unknown) => void;
}

/**
 * Schema hint used by deserializeResult to restore types.
 */
export interface DeserializeSchema {
  /** Column names that should be restored to Date. */
  dates?: string[];
  /** Column names that should be restored to BigInt. */
  bigints?: string[];
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize a single primitive value to a JSON-safe representation.
 */
function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === undefined) {
    return undefined;
  }
  return value;
}

/**
 * Recursively serialize data to a JSON-safe form.
 *  - Date → ISO string
 *  - BigInt → string
 *  - undefined fields are removed
 *  - Circular references are detected and removed (replaced with null)
 */
export function serializeResult<T>(data: T, _seen?: Set<unknown>): unknown {
  const seen = _seen ?? new Set<unknown>();

  if (data === null || data === undefined) {
    return data === undefined ? undefined : null;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (typeof data === "bigint") {
    return data.toString();
  }

  if (Array.isArray(data)) {
    if (seen.has(data)) {
      return null;
    }
    seen.add(data);
    const result = data.map((item) => serializeResult(item, seen));
    seen.delete(data);
    return result;
  }

  if (typeof data === "object") {
    if (seen.has(data)) {
      // Circular reference detected — remove it
      return null;
    }
    seen.add(data);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>)) {
      const val = (data as Record<string, unknown>)[key];
      if (val === undefined) {
        // Remove undefined fields
        continue;
      }
      const serialized = serializeResult(val, seen);
      if (serialized !== undefined) {
        result[key] = serialized;
      }
    }
    seen.delete(data);
    return result;
  }

  return serializeValue(data);
}

// ─── Deserialization ──────────────────────────────────────────────────────────

/**
 * ISO 8601 date string regex (UTC or offset).
 * Matches strings produced by Date.toISOString().
 */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Deserialize a single primitive value, using optional schema hints.
 */
function deserializeValue(
  value: unknown,
  key: string | null,
  schema?: DeserializeSchema,
): unknown {
  if (typeof value === "string") {
    if (key !== null && schema?.dates?.includes(key)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    if (key !== null && schema?.bigints?.includes(key)) {
      try {
        return BigInt(value);
      } catch {
        // fall through
      }
    }
    // Auto-detect ISO date strings when no schema is provided
    if (schema === undefined && ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return value;
}

/**
 * Restore a serialized DB result to native types using optional schema hints.
 *  - ISO string → Date (schema-based or auto-detected)
 *  - string → BigInt (schema-based)
 */
export function deserializeResult<T = unknown>(
  data: unknown,
  schema?: DeserializeSchema,
): T {
  if (data === null || data === undefined) {
    return data as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => deserializeResult(item, schema)) as T;
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>)) {
      const val = (data as Record<string, unknown>)[key];
      if (typeof val === "object" && val !== null) {
        result[key] = deserializeResult(val, schema);
      } else {
        result[key] = deserializeValue(val, key, schema);
      }
    }
    return result as T;
  }

  return deserializeValue(data, null, schema) as T;
}

// ─── Transaction wrapper ──────────────────────────────────────────────────────

/**
 * Execute `handler` inside a database transaction.
 * Commits on success, rolls back on error.
 */
export async function withTransaction<R>(
  client: DatabaseClient,
  handler: (tx: DatabaseClient) => Promise<R>,
): Promise<R> {
  return client.transaction(handler);
}

// ─── Server action wrapper ────────────────────────────────────────────────────

/**
 * Wrap a server-side DB handler with:
 *  - Automatic transaction management (begin → commit or rollback)
 *  - Result serialization (Date → ISO string, BigInt → string, undefined removed)
 *  - Optional timeout and retry support
 *  - Optional error callback
 *
 * @param handler - Async function that receives a DatabaseClient and any additional args.
 * @param config  - Optional configuration (timeout, retries, onError).
 * @returns A wrapped function that accepts a DatabaseClient followed by the same args.
 */
export function createServerAction<TArgs extends unknown[], TResult>(
  handler: (db: DatabaseClient, ...args: TArgs) => Promise<TResult>,
  config?: ServerActionConfig,
): (db: DatabaseClient, ...args: TArgs) => Promise<unknown> {
  const retries = config?.retries ?? 0;
  const timeout = config?.timeout;
  const onError = config?.onError;

  return async (db: DatabaseClient, ...args: TArgs): Promise<unknown> => {
    let attempt = 0;
    const maxAttempts = retries + 1;

    while (attempt < maxAttempts) {
      try {
        let resultPromise: Promise<TResult>;

        // Wrap handler in a transaction
        resultPromise = withTransaction(db, (tx) => handler(tx, ...args));

        // Apply timeout if configured
        if (timeout !== undefined && timeout > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const _setTimeout = (globalThis as any).setTimeout as (fn: () => void, ms: number) => unknown;
          const timeoutPromise = new Promise<never>((_, reject) =>
            _setTimeout(
              () => reject(new Error(`[vaisx/db] Server action timed out after ${timeout}ms`)),
              timeout,
            ),
          );
          const result = await Promise.race([resultPromise, timeoutPromise]);
          return serializeResult(result);
        }

        const result = await resultPromise;
        return serializeResult(result);
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) {
          if (onError) {
            onError(err);
          }
          throw err;
        }
        // Retry
      }
    }

    // Unreachable — satisfies TypeScript
    throw new Error("[vaisx/db] createServerAction: unexpected state");
  };
}
