/**
 * state.ts — State deserialization from base64
 */

/**
 * Deserialize a base64-encoded JSON string into a plain object.
 * Returns {} on any error (invalid base64, invalid JSON, etc.)
 */
export function deserializeState(base64: string): Record<string, unknown> {
  if (!base64) return {};

  try {
    const json = atob(base64);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Serialize a plain object to a base64-encoded JSON string.
 */
export function serializeState(state: Record<string, unknown>): string {
  return btoa(JSON.stringify(state));
}
