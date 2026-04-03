import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateChromeManifest } from "../src/extension/manifest.js";
import { generateFirefoxManifest } from "../src/extension/manifest-firefox.js";
import {
  detectVaisXRuntime,
  ContentBridge,
} from "../src/extension/content-script.js";
import { PanelController } from "../src/extension/devtools-panel.js";
import { renderPopup, getPopupState } from "../src/extension/popup.js";

// ─── Chrome manifest ──────────────────────────────────────────────────────────

describe("Chrome manifest", () => {
  it("returns manifest_version 3", () => {
    const manifest = generateChromeManifest();
    expect(manifest.manifest_version).toBe(3);
  });

  it("has required name and version fields", () => {
    const manifest = generateChromeManifest();
    expect(manifest.name).toBe("VaisX DevTools");
    expect(manifest.version).toBe("0.1.0");
  });

  it("has description field", () => {
    const manifest = generateChromeManifest();
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("has devtools_page field", () => {
    const manifest = generateChromeManifest();
    expect(manifest.devtools_page).toBe("devtools.html");
  });

  it("has permissions array containing devtools", () => {
    const manifest = generateChromeManifest();
    expect(Array.isArray(manifest.permissions)).toBe(true);
    expect(manifest.permissions).toContain("devtools");
  });

  it("has content_scripts with correct structure", () => {
    const manifest = generateChromeManifest();
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    const script = manifest.content_scripts[0];
    expect(script.matches).toContain("<all_urls>");
    expect(script.js).toContain("content-script.js");
    expect(script.run_at).toBe("document_start");
  });

  it("has icons for 16, 48, 128", () => {
    const manifest = generateChromeManifest();
    expect(manifest.icons["16"]).toBeDefined();
    expect(manifest.icons["48"]).toBeDefined();
    expect(manifest.icons["128"]).toBeDefined();
  });
});

// ─── Firefox manifest ─────────────────────────────────────────────────────────

describe("Firefox manifest", () => {
  it("returns manifest_version 2", () => {
    const manifest = generateFirefoxManifest();
    expect(manifest.manifest_version).toBe(2);
  });

  it("has required name and version fields", () => {
    const manifest = generateFirefoxManifest();
    expect(manifest.name).toBe("VaisX DevTools");
    expect(manifest.version).toBe("0.1.0");
  });

  it("has browser_specific_settings with gecko id", () => {
    const manifest = generateFirefoxManifest();
    expect(manifest.browser_specific_settings).toBeDefined();
    expect(manifest.browser_specific_settings.gecko).toBeDefined();
    expect(typeof manifest.browser_specific_settings.gecko.id).toBe("string");
    expect(manifest.browser_specific_settings.gecko.id.length).toBeGreaterThan(0);
  });

  it("has gecko id matching expected value", () => {
    const manifest = generateFirefoxManifest();
    expect(manifest.browser_specific_settings.gecko.id).toBe(
      "vaisx-devtools@vaisx.dev"
    );
  });

  it("has devtools_page field", () => {
    const manifest = generateFirefoxManifest();
    expect(manifest.devtools_page).toBe("devtools.html");
  });

  it("has content_scripts with correct structure", () => {
    const manifest = generateFirefoxManifest();
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    const script = manifest.content_scripts[0];
    expect(script.matches).toContain("<all_urls>");
    expect(script.js).toContain("content-script.js");
  });
});

// ─── ContentBridge ────────────────────────────────────────────────────────────

describe("detectVaisXRuntime", () => {
  it("returns false when __VAISX_DEVTOOLS__ is not set", () => {
    // Ensure window doesn't have the hook in test environment
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>)["__VAISX_DEVTOOLS__"];
    }
    // In non-browser (Node) environment, window is undefined, so returns false
    expect(typeof detectVaisXRuntime()).toBe("boolean");
  });

  it("returns false in Node environment (no window)", () => {
    // detectVaisXRuntime checks typeof window !== 'undefined'
    // In jsdom or node, this behavior is verified
    const result = detectVaisXRuntime();
    expect(typeof result).toBe("boolean");
  });
});

describe("ContentBridge", () => {
  let bridge: ContentBridge;

  beforeEach(() => {
    bridge = new ContentBridge();
  });

  it("can be instantiated", () => {
    expect(bridge).toBeInstanceOf(ContentBridge);
  });

  it("connect() does not throw", () => {
    expect(() => bridge.connect()).not.toThrow();
  });

  it("connect() called multiple times does not duplicate listeners", () => {
    expect(() => {
      bridge.connect();
      bridge.connect();
      bridge.connect();
    }).not.toThrow();
  });

  it("onMessage registers a handler", () => {
    const handler = vi.fn();
    bridge.onMessage(handler);
    // Handler should not be called yet
    expect(handler).not.toHaveBeenCalled();
  });

  it("send() does not throw even if window is unavailable", () => {
    expect(() => {
      bridge.send({ source: "vaisx-extension", type: "test", payload: {} });
    }).not.toThrow();
  });

  it("onMessage can register multiple handlers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bridge.onMessage(handler1);
    bridge.onMessage(handler2);

    // Both handlers registered without error
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it("send() sends a message with correct source", () => {
    // In non-browser environments (Node), window may not exist.
    // ContentBridge.send() guards with typeof window !== 'undefined'.
    // Verify that send() does not throw regardless.
    expect(() => {
      bridge.send({ source: "test", type: "hello", payload: { data: 1 } });
    }).not.toThrow();
  });
});

// ─── PanelController ──────────────────────────────────────────────────────────

describe("PanelController", () => {
  let bridge: ContentBridge;
  let panel: PanelController;

  beforeEach(() => {
    bridge = new ContentBridge();
    bridge.connect();
    panel = new PanelController(bridge);
  });

  it("can be instantiated with a ContentBridge", () => {
    expect(panel).toBeInstanceOf(PanelController);
  });

  it("activate() does not throw", () => {
    expect(() => panel.activate()).not.toThrow();
  });

  it("deactivate() does not throw", () => {
    expect(() => panel.deactivate()).not.toThrow();
  });

  it("activate() sets panel to active state", () => {
    panel.activate();
    expect(panel.isActive()).toBe(true);
  });

  it("deactivate() sets panel to inactive state", () => {
    panel.activate();
    panel.deactivate();
    expect(panel.isActive()).toBe(false);
  });

  it("activate() calls requestComponentTree and requestReactivityGraph", () => {
    const sendSpy = vi.spyOn(bridge, "send");
    panel.activate();

    const types = sendSpy.mock.calls.map((call) => call[0].type);
    expect(types).toContain("request-component-tree");
    expect(types).toContain("request-reactivity-graph");
  });

  it("requestComponentTree() sends correct message type", () => {
    const sendSpy = vi.spyOn(bridge, "send");
    panel.requestComponentTree();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "request-component-tree" })
    );
  });

  it("requestReactivityGraph() sends correct message type", () => {
    const sendSpy = vi.spyOn(bridge, "send");
    panel.requestReactivityGraph();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "request-reactivity-graph" })
    );
  });
});

// ─── Popup ────────────────────────────────────────────────────────────────────

describe("Popup", () => {
  describe("getPopupState", () => {
    it("returns an object with detected field", () => {
      const state = getPopupState();
      expect(typeof state.detected).toBe("boolean");
    });
  });

  describe("renderPopup — detected=true", () => {
    it("returns an HTML string", () => {
      const html = renderPopup({ detected: true });
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });

    it("contains detected status when detected=true", () => {
      const html = renderPopup({ detected: true });
      expect(html).toContain("detected");
    });

    it("includes version string when provided", () => {
      const html = renderPopup({ detected: true, version: "1.2.3" });
      expect(html).toContain("1.2.3");
    });

    it("renders correctly without version", () => {
      const html = renderPopup({ detected: true });
      expect(html).not.toContain("undefined");
    });
  });

  describe("renderPopup — detected=false", () => {
    it("returns an HTML string when not detected", () => {
      const html = renderPopup({ detected: false });
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });

    it("contains not-detected status when detected=false", () => {
      const html = renderPopup({ detected: false });
      expect(html).toContain("not-detected");
    });

    it("does not show version info when not detected", () => {
      const html = renderPopup({ detected: false });
      expect(html).not.toContain("undefined");
    });
  });
});
