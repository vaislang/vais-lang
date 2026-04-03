/**
 * Platform utility for @vaisx/native.
 *
 * Provides:
 *   - Platform.OS      — "ios" | "android"
 *   - Platform.Version — OS version string/number
 *   - Platform.select  — platform-conditional value selector
 *   - Platform.setOS   — test helper to override the current platform
 */

export type PlatformOS = "ios" | "android";

export interface PlatformSelectSpec<T> {
  ios?: T;
  android?: T;
  default?: T;
}

// ---------------------------------------------------------------------------
// Internal state — defaults to "ios"; override via Platform.setOS() in tests.
// ---------------------------------------------------------------------------

let _currentOS: PlatformOS = "ios";
let _currentVersion: string | number = "17.0";

// ---------------------------------------------------------------------------
// Public Platform object
// ---------------------------------------------------------------------------

export const Platform = {
  /** The current target platform OS. */
  get OS(): PlatformOS {
    return _currentOS;
  },

  /** The OS version string or number. */
  get Version(): string | number {
    return _currentVersion;
  },

  /**
   * Return the value associated with the current platform.
   * Falls back to `default` if no platform-specific key is present.
   *
   * @example
   * const shadowStyle = Platform.select({
   *   ios: { shadowColor: "#000" },
   *   android: { elevation: 4 },
   *   default: {},
   * });
   */
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    if (_currentOS in spec) {
      return (spec as Record<string, T>)[_currentOS];
    }
    return spec.default;
  },

  /**
   * Check whether the current platform matches the given OS.
   */
  is(os: PlatformOS): boolean {
    return _currentOS === os;
  },

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  /**
   * Override the current platform OS.
   * Intended for use in tests only.
   */
  setOS(os: PlatformOS): void {
    _currentOS = os;
  },

  /**
   * Override the OS version.
   * Intended for use in tests only.
   */
  setVersion(version: string | number): void {
    _currentVersion = version;
  },

  /**
   * Reset Platform to defaults (ios, "17.0").
   * Intended for use in tests only.
   */
  reset(): void {
    _currentOS = "ios";
    _currentVersion = "17.0";
  },
} as const;
