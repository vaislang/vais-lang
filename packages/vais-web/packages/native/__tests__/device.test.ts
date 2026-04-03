/**
 * Tests for Device APIs: camera, location, notifications, biometrics.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from "vitest";
import { createBridge } from "../src/bridge.js";
import type { Bridge } from "../src/bridge.js";
import { createCameraAPI } from "../src/device/camera.js";
import { createLocationAPI } from "../src/device/location.js";
import { createNotificationAPI } from "../src/device/notifications.js";
import { createBiometricsAPI } from "../src/device/biometrics.js";
import type {
  CameraOptions,
  LocationOptions,
  NotificationPayload,
} from "../src/device/index.js";

// ---------------------------------------------------------------------------
// Mock bridge factory
// ---------------------------------------------------------------------------

function makeMockBridge() {
  const callNative: MockedFunction<Bridge["callNative"]> = vi
    .fn()
    .mockResolvedValue(null);
  const sendMessage = vi.fn();
  const onMessage = vi.fn().mockReturnValue(vi.fn());
  const flushMessages = vi.fn();
  const registerModule = vi.fn();
  const getModule = vi.fn();
  const emit = vi.fn();

  const listeners = new Map<string, Set<(data: unknown) => void>>();

  function on(event: string, handler: (data: unknown) => void): void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
  }

  function off(event: string, handler: (data: unknown) => void): void {
    listeners.get(event)?.delete(handler);
  }

  function _emitEvent(event: string, data: unknown): void {
    listeners.get(event)?.forEach((h) => h(data));
  }

  const destroy = vi.fn();
  const _receiveMessage = vi.fn();
  const _resolveCall = vi.fn();
  const _rejectCall = vi.fn();

  const bridge: Bridge & { _emitEvent: typeof _emitEvent } = {
    callNative,
    sendMessage,
    onMessage,
    flushMessages,
    registerModule,
    getModule,
    emit,
    on,
    off,
    destroy,
    _receiveMessage,
    _resolveCall,
    _rejectCall,
    _emitEvent,
  };

  return bridge;
}

// ===========================================================================
// Camera API
// ===========================================================================

describe("createCameraAPI", () => {
  let bridge: ReturnType<typeof makeMockBridge>;

  beforeEach(() => {
    bridge = makeMockBridge();
  });

  it("returns an object with requestPermission, takePicture, and pickImage", () => {
    const camera = createCameraAPI(bridge);
    expect(typeof camera.requestPermission).toBe("function");
    expect(typeof camera.takePicture).toBe("function");
    expect(typeof camera.pickImage).toBe("function");
  });

  it("requestPermission calls callNative with Camera.requestPermission", async () => {
    const expected = { granted: true, status: "granted" };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const camera = createCameraAPI(bridge);
    const result = await camera.requestPermission();
    expect(bridge.callNative).toHaveBeenCalledWith("Camera", "requestPermission", []);
    expect(result).toEqual(expected);
  });

  it("requestPermission returns denied status when permission not granted", async () => {
    const expected = { granted: false, status: "denied" };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const camera = createCameraAPI(bridge);
    const result = await camera.requestPermission();
    expect(result.granted).toBe(false);
    expect(result.status).toBe("denied");
  });

  it("takePicture calls callNative with Camera.takePicture and default options", async () => {
    const expected = { uri: "file://photo.jpg", width: 1920, height: 1080 };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const camera = createCameraAPI(bridge);
    const result = await camera.takePicture();
    expect(bridge.callNative).toHaveBeenCalledWith("Camera", "takePicture", [{}]);
    expect(result).toEqual(expected);
  });

  it("takePicture forwards CameraOptions to native", async () => {
    const options: CameraOptions = { quality: 0.5, facing: "front", flash: "off" };
    const expected = { uri: "file://selfie.jpg", width: 800, height: 600, base64: "abc" };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const camera = createCameraAPI(bridge);
    const result = await camera.takePicture(options);
    expect(bridge.callNative).toHaveBeenCalledWith("Camera", "takePicture", [options]);
    expect(result.base64).toBe("abc");
  });

  it("pickImage calls callNative with Camera.pickImage", async () => {
    const expected = { uri: "file://gallery.jpg", width: 640, height: 480 };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const camera = createCameraAPI(bridge);
    const result = await camera.pickImage();
    expect(bridge.callNative).toHaveBeenCalledWith("Camera", "pickImage", [{}]);
    expect(result).toEqual(expected);
  });

  it("pickImage forwards options to native", async () => {
    const options: CameraOptions = { quality: 0.9 };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      uri: "file://img.jpg",
      width: 1280,
      height: 720,
    });
    const camera = createCameraAPI(bridge);
    await camera.pickImage(options);
    expect(bridge.callNative).toHaveBeenCalledWith("Camera", "pickImage", [options]);
  });
});

// ===========================================================================
// Location API
// ===========================================================================

describe("createLocationAPI", () => {
  let bridge: ReturnType<typeof makeMockBridge>;

  beforeEach(() => {
    bridge = makeMockBridge();
  });

  it("returns an object with requestPermission, getCurrentPosition, and watchPosition", () => {
    const location = createLocationAPI(bridge);
    expect(typeof location.requestPermission).toBe("function");
    expect(typeof location.getCurrentPosition).toBe("function");
    expect(typeof location.watchPosition).toBe("function");
  });

  it("requestPermission calls callNative with Location.requestPermission", async () => {
    const expected = { granted: true };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const location = createLocationAPI(bridge);
    const result = await location.requestPermission();
    expect(bridge.callNative).toHaveBeenCalledWith("Location", "requestPermission", []);
    expect(result).toEqual(expected);
  });

  it("getCurrentPosition calls callNative with Location.getCurrentPosition", async () => {
    const expected = {
      latitude: 37.5665,
      longitude: 126.978,
      accuracy: 10,
      timestamp: Date.now(),
    };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const location = createLocationAPI(bridge);
    const result = await location.getCurrentPosition();
    expect(bridge.callNative).toHaveBeenCalledWith(
      "Location",
      "getCurrentPosition",
      [{}]
    );
    expect(result.latitude).toBeCloseTo(37.5665);
    expect(result.longitude).toBeCloseTo(126.978);
  });

  it("getCurrentPosition forwards LocationOptions", async () => {
    const options: LocationOptions = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      latitude: 0,
      longitude: 0,
      accuracy: 5,
      timestamp: 0,
    });
    const location = createLocationAPI(bridge);
    await location.getCurrentPosition(options);
    expect(bridge.callNative).toHaveBeenCalledWith(
      "Location",
      "getCurrentPosition",
      [options]
    );
  });

  it("watchPosition registers a listener and returns a cleanup function", () => {
    const callback = vi.fn();
    const location = createLocationAPI(bridge);
    const cleanup = location.watchPosition(callback);
    expect(typeof cleanup).toBe("function");
  });

  it("watchPosition invokes callback when location:update event fires", () => {
    const callback = vi.fn();
    const location = createLocationAPI(bridge);
    location.watchPosition(callback);

    const positionData = {
      latitude: 51.5074,
      longitude: -0.1278,
      accuracy: 8,
      timestamp: 1000,
    };
    bridge._emitEvent("location:update", positionData);

    expect(callback).toHaveBeenCalledWith(positionData);
  });

  it("watchPosition cleanup stops receiving events", () => {
    const callback = vi.fn();
    const location = createLocationAPI(bridge);
    const cleanup = location.watchPosition(callback);

    cleanup();

    bridge._emitEvent("location:update", {
      latitude: 0,
      longitude: 0,
      accuracy: 1,
      timestamp: 0,
    });

    expect(callback).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Notifications API
// ===========================================================================

describe("createNotificationAPI", () => {
  let bridge: ReturnType<typeof makeMockBridge>;

  beforeEach(() => {
    bridge = makeMockBridge();
  });

  it("returns an object with requestPermission, scheduleLocal, cancelNotification, onNotificationReceived", () => {
    const notifications = createNotificationAPI(bridge);
    expect(typeof notifications.requestPermission).toBe("function");
    expect(typeof notifications.scheduleLocal).toBe("function");
    expect(typeof notifications.cancelNotification).toBe("function");
    expect(typeof notifications.onNotificationReceived).toBe("function");
  });

  it("requestPermission calls callNative with Notifications.requestPermission", async () => {
    const expected = { granted: true, token: "fcm-token-xyz" };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const notifications = createNotificationAPI(bridge);
    const result = await notifications.requestPermission();
    expect(bridge.callNative).toHaveBeenCalledWith(
      "Notifications",
      "requestPermission",
      []
    );
    expect(result.granted).toBe(true);
    expect(result.token).toBe("fcm-token-xyz");
  });

  it("requestPermission returns no token when denied", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      granted: false,
    });
    const notifications = createNotificationAPI(bridge);
    const result = await notifications.requestPermission();
    expect(result.granted).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it("scheduleLocal calls callNative with Notifications.scheduleLocal and returns id", async () => {
    const payload: NotificationPayload = {
      title: "Hello",
      body: "World",
      data: { screen: "home" },
      badge: 1,
      sound: "default",
    };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      "notif-id-001"
    );
    const notifications = createNotificationAPI(bridge);
    const id = await notifications.scheduleLocal(payload);
    expect(bridge.callNative).toHaveBeenCalledWith(
      "Notifications",
      "scheduleLocal",
      [payload]
    );
    expect(id).toBe("notif-id-001");
  });

  it("cancelNotification calls callNative with Notifications.cancelNotification", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      undefined
    );
    const notifications = createNotificationAPI(bridge);
    await notifications.cancelNotification("notif-id-001");
    expect(bridge.callNative).toHaveBeenCalledWith(
      "Notifications",
      "cancelNotification",
      ["notif-id-001"]
    );
  });

  it("onNotificationReceived registers handler and returns cleanup", () => {
    const handler = vi.fn();
    const notifications = createNotificationAPI(bridge);
    const cleanup = notifications.onNotificationReceived(handler);
    expect(typeof cleanup).toBe("function");
  });

  it("onNotificationReceived calls handler when notification:received fires", () => {
    const handler = vi.fn();
    const notifications = createNotificationAPI(bridge);
    notifications.onNotificationReceived(handler);

    const incoming: NotificationPayload = { title: "Alert", body: "You have a message" };
    bridge._emitEvent("notification:received", incoming);

    expect(handler).toHaveBeenCalledWith(incoming);
  });

  it("onNotificationReceived cleanup stops events", () => {
    const handler = vi.fn();
    const notifications = createNotificationAPI(bridge);
    const cleanup = notifications.onNotificationReceived(handler);

    cleanup();

    bridge._emitEvent("notification:received", { title: "Too late", body: "Nope" });

    expect(handler).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Biometrics API
// ===========================================================================

describe("createBiometricsAPI", () => {
  let bridge: ReturnType<typeof makeMockBridge>;

  beforeEach(() => {
    bridge = makeMockBridge();
  });

  it("returns an object with isAvailable and authenticate", () => {
    const biometrics = createBiometricsAPI(bridge);
    expect(typeof biometrics.isAvailable).toBe("function");
    expect(typeof biometrics.authenticate).toBe("function");
  });

  it("isAvailable calls callNative with Biometrics.isAvailable", async () => {
    const expected = { available: true, biometryType: "faceId" as const };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.isAvailable();
    expect(bridge.callNative).toHaveBeenCalledWith("Biometrics", "isAvailable", []);
    expect(result.available).toBe(true);
    expect(result.biometryType).toBe("faceId");
  });

  it("isAvailable returns touchId type", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      available: true,
      biometryType: "touchId",
    });
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.isAvailable();
    expect(result.biometryType).toBe("touchId");
  });

  it("isAvailable returns fingerprint type for Android", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      available: true,
      biometryType: "fingerprint",
    });
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.isAvailable();
    expect(result.biometryType).toBe("fingerprint");
  });

  it("isAvailable returns none when biometry is not supported", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      available: false,
      biometryType: "none",
    });
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.isAvailable();
    expect(result.available).toBe(false);
    expect(result.biometryType).toBe("none");
  });

  it("authenticate calls callNative with Biometrics.authenticate and reason", async () => {
    const expected = { success: true };
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce(
      expected
    );
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.authenticate("Confirm your identity");
    expect(bridge.callNative).toHaveBeenCalledWith("Biometrics", "authenticate", [
      "Confirm your identity",
    ]);
    expect(result.success).toBe(true);
  });

  it("authenticate returns error message on failure", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockResolvedValueOnce({
      success: false,
      error: "User cancelled",
    });
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.authenticate("Login");
    expect(result.success).toBe(false);
    expect(result.error).toBe("User cancelled");
  });

  it("authenticate propagates bridge rejection", async () => {
    (bridge.callNative as MockedFunction<Bridge["callNative"]>).mockRejectedValueOnce(
      new Error("Biometry not enrolled")
    );
    const biometrics = createBiometricsAPI(bridge);
    await expect(biometrics.authenticate("Verify")).rejects.toThrow(
      "Biometry not enrolled"
    );
  });
});

// ===========================================================================
// Integration — real bridge with registered modules
// ===========================================================================

describe("Device APIs with real bridge and registered modules", () => {
  let bridge: Bridge;

  beforeEach(() => {
    bridge = createBridge({ batchInterval: 9999 });
  });

  afterEach(() => {
    bridge.destroy();
  });

  it("camera requestPermission resolves via registered module", async () => {
    bridge.registerModule({
      name: "Camera",
      methods: {
        requestPermission: () => ({ granted: true, status: "granted" }),
      },
    });
    const camera = createCameraAPI(bridge);
    const result = await camera.requestPermission();
    expect(result.granted).toBe(true);
    expect(result.status).toBe("granted");
  });

  it("location getCurrentPosition resolves via registered module", async () => {
    bridge.registerModule({
      name: "Location",
      methods: {
        requestPermission: () => ({ granted: true }),
        getCurrentPosition: (_opts: unknown) => ({
          latitude: 37.5665,
          longitude: 126.978,
          accuracy: 5,
          timestamp: 1000,
        }),
      },
    });
    const location = createLocationAPI(bridge);
    const pos = await location.getCurrentPosition();
    expect(pos.latitude).toBeCloseTo(37.5665);
  });

  it("notifications scheduleLocal returns id via registered module", async () => {
    bridge.registerModule({
      name: "Notifications",
      methods: {
        requestPermission: () => ({ granted: true, token: "tok" }),
        scheduleLocal: (_n: unknown) => "sched-001",
        cancelNotification: (_id: unknown) => undefined,
      },
    });
    const notifications = createNotificationAPI(bridge);
    const id = await notifications.scheduleLocal({ title: "Hi", body: "There" });
    expect(id).toBe("sched-001");
  });

  it("biometrics authenticate resolves via registered module", async () => {
    bridge.registerModule({
      name: "Biometrics",
      methods: {
        isAvailable: () => ({ available: true, biometryType: "faceId" }),
        authenticate: (_reason: unknown) => ({ success: true }),
      },
    });
    const biometrics = createBiometricsAPI(bridge);
    const result = await biometrics.authenticate("Verify payment");
    expect(result.success).toBe(true);
  });
});
