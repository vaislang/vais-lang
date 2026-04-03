/**
 * Notifications API — push/local notification management via bridge.
 */

import type { Bridge } from "../bridge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string;
}

export interface NotificationPermissionResult {
  granted: boolean;
  /** FCM/APNs device token, present when permission is granted. */
  token?: string;
}

export interface NotificationAPI {
  requestPermission(): Promise<NotificationPermissionResult>;
  scheduleLocal(notification: NotificationPayload): Promise<string>;
  cancelNotification(id: string): Promise<void>;
  onNotificationReceived(
    handler: (notification: NotificationPayload) => void
  ): () => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNotificationAPI(bridge: Bridge): NotificationAPI {
  async function requestPermission(): Promise<NotificationPermissionResult> {
    const result = await bridge.callNative("Notifications", "requestPermission", []);
    return result as NotificationPermissionResult;
  }

  async function scheduleLocal(notification: NotificationPayload): Promise<string> {
    const result = await bridge.callNative("Notifications", "scheduleLocal", [
      notification,
    ]);
    return result as string;
  }

  async function cancelNotification(id: string): Promise<void> {
    await bridge.callNative("Notifications", "cancelNotification", [id]);
  }

  function onNotificationReceived(
    handler: (notification: NotificationPayload) => void
  ): () => void {
    const eventName = "notification:received";

    const bridgeHandler = (data: unknown): void => {
      handler(data as NotificationPayload);
    };

    bridge.on(eventName, bridgeHandler);

    return (): void => {
      bridge.off(eventName, bridgeHandler);
    };
  }

  return {
    requestPermission,
    scheduleLocal,
    cancelNotification,
    onNotificationReceived,
  };
}
