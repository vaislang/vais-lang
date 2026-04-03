/**
 * Biometrics API — Face ID / Touch ID / fingerprint authentication via bridge.
 */

import type { Bridge } from "../bridge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BiometryType = "faceId" | "touchId" | "fingerprint" | "none";

export interface BiometricsAvailabilityResult {
  available: boolean;
  biometryType: BiometryType;
}

export interface BiometricsAuthResult {
  success: boolean;
  error?: string;
}

export interface BiometricsAPI {
  isAvailable(): Promise<BiometricsAvailabilityResult>;
  authenticate(reason: string): Promise<BiometricsAuthResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBiometricsAPI(bridge: Bridge): BiometricsAPI {
  async function isAvailable(): Promise<BiometricsAvailabilityResult> {
    const result = await bridge.callNative("Biometrics", "isAvailable", []);
    return result as BiometricsAvailabilityResult;
  }

  async function authenticate(reason: string): Promise<BiometricsAuthResult> {
    const result = await bridge.callNative("Biometrics", "authenticate", [reason]);
    return result as BiometricsAuthResult;
  }

  return { isAvailable, authenticate };
}
