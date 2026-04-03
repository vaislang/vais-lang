/**
 * Location API — GPS position access via bridge.
 */

import type { Bridge } from "../bridge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationPermissionResult {
  granted: boolean;
}

export interface LocationAPI {
  getCurrentPosition(options?: LocationOptions): Promise<LocationResult>;
  watchPosition(
    callback: (position: LocationResult) => void,
    options?: LocationOptions
  ): () => void;
  requestPermission(): Promise<LocationPermissionResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocationAPI(bridge: Bridge): LocationAPI {
  async function requestPermission(): Promise<LocationPermissionResult> {
    const result = await bridge.callNative("Location", "requestPermission", []);
    return result as LocationPermissionResult;
  }

  async function getCurrentPosition(
    options: LocationOptions = {}
  ): Promise<LocationResult> {
    const result = await bridge.callNative("Location", "getCurrentPosition", [options]);
    return result as LocationResult;
  }

  function watchPosition(
    callback: (position: LocationResult) => void,
    options: LocationOptions = {}
  ): () => void {
    const watchEventName = "location:update";

    // Register a native watch session
    bridge.callNative("Location", "startWatch", [options]).catch(() => {
      // Silently ignore if bridge doesn't have the module registered
    });

    const handler = (data: unknown): void => {
      callback(data as LocationResult);
    };

    bridge.on(watchEventName, handler);

    return (): void => {
      bridge.off(watchEventName, handler);
      bridge.callNative("Location", "stopWatch", []).catch(() => {
        // Silently ignore
      });
    };
  }

  return { requestPermission, getCurrentPosition, watchPosition };
}
