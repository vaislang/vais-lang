/**
 * Device APIs — camera, location, notifications, biometrics.
 */

export { createCameraAPI } from "./camera.js";
export type {
  CameraAPI,
  CameraOptions,
  CameraPermissionResult,
  PictureResult,
  PickImageResult,
} from "./camera.js";

export { createLocationAPI } from "./location.js";
export type {
  LocationAPI,
  LocationOptions,
  LocationResult,
  LocationPermissionResult,
} from "./location.js";

export { createNotificationAPI } from "./notifications.js";
export type {
  NotificationAPI,
  NotificationPayload,
  NotificationPermissionResult,
} from "./notifications.js";

export { createBiometricsAPI } from "./biometrics.js";
export type {
  BiometricsAPI,
  BiometryType,
  BiometricsAvailabilityResult,
  BiometricsAuthResult,
} from "./biometrics.js";
