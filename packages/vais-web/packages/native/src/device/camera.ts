/**
 * Camera API — photo capture and image picker via bridge.
 */

import type { Bridge } from "../bridge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CameraOptions {
  /** Image quality, 0.0–1.0 (default: 0.8). */
  quality?: number;
  /** Camera facing direction (default: "back"). */
  facing?: "front" | "back";
  /** Flash mode (default: "auto"). */
  flash?: "on" | "off" | "auto";
}

export interface CameraPermissionResult {
  granted: boolean;
  status: "granted" | "denied" | "undetermined" | "restricted";
}

export interface PictureResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

export interface PickImageResult {
  uri: string;
  width: number;
  height: number;
}

export interface CameraAPI {
  requestPermission(): Promise<CameraPermissionResult>;
  takePicture(options?: CameraOptions): Promise<PictureResult>;
  pickImage(options?: CameraOptions): Promise<PickImageResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCameraAPI(bridge: Bridge): CameraAPI {
  async function requestPermission(): Promise<CameraPermissionResult> {
    const result = await bridge.callNative("Camera", "requestPermission", []);
    return result as CameraPermissionResult;
  }

  async function takePicture(options: CameraOptions = {}): Promise<PictureResult> {
    const result = await bridge.callNative("Camera", "takePicture", [options]);
    return result as PictureResult;
  }

  async function pickImage(options: CameraOptions = {}): Promise<PickImageResult> {
    const result = await bridge.callNative("Camera", "pickImage", [options]);
    return result as PickImageResult;
  }

  return { requestPermission, takePicture, pickImage };
}
