/**
 * Tests for the NativeRenderer (createElement / render / diff / patch).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  configure,
  createElement,
  render,
  diff,
  patch,
  getTree,
  resetRenderer,
  getConfig,
} from "../src/renderer.js";
import type { BridgeInterface, NativeElement } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBridge(): BridgeInterface & { messages: Array<{ type: string; payload: unknown }> } {
  const messages: Array<{ type: string; payload: unknown }> = [];
  return {
    messages,
    sendMessage(type, payload) { messages.push({ type, payload }); },
    onMessage: vi.fn(),
    callNative: vi.fn().mockResolvedValue(null),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetRenderer();
});

// ---------------------------------------------------------------------------
// createElement
// ---------------------------------------------------------------------------

describe("createElement", () => {
  it("returns a NativeElement with the correct type", () => {
    const el = createElement("View", null);
    expect(el.type).toBe("View");
  });

  it("spreads props and strips key/ref into the element", () => {
    const ref = { current: null };
    const el = createElement("Text", { key: "k1", ref, color: "#fff" }, "hello");
    expect(el.key).toBe("k1");
    expect(el.ref).toBe(ref);
    expect(el.props["color"]).toBe("#fff");
    expect(el.props["key"]).toBeUndefined();
    expect(el.props["ref"]).toBeUndefined();
  });

  it("normalises children — undefined/false/true become null", () => {
    const el = createElement("View", null, undefined as unknown as null, false as unknown as null, "text", null);
    expect(el.children).toHaveLength(4);
    expect(el.children[0]).toBeNull();
    expect(el.children[1]).toBeNull();
    expect(el.children[2]).toBe("text");
    expect(el.children[3]).toBeNull();
  });

  it("handles nested NativeElement children", () => {
    const child = createElement("Text", null, "hi");
    const parent = createElement("View", null, child);
    expect((parent.children[0] as NativeElement).type).toBe("Text");
  });

  it("accepts numeric key", () => {
    const el = createElement("View", { key: 42 });
    expect(el.key).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// configure / getConfig
// ---------------------------------------------------------------------------

describe("configure", () => {
  it("stores the renderer config", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });
    const cfg = getConfig();
    expect(cfg?.platform).toBe("ios");
    expect(cfg?.bridge).toBe(bridge);
  });

  it("resets config after resetRenderer()", () => {
    const bridge = makeBridge();
    configure({ platform: "android", bridge });
    resetRenderer();
    expect(getConfig()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

describe("render", () => {
  it("returns a positive handle", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });
    const el = createElement("View", null);
    const handle = render(el);
    expect(handle).toBeGreaterThan(0);
  });

  it("stores the tree retrievable via getTree()", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });
    const el = createElement("View", { style: {} }, createElement("Text", null, "hello"));
    const handle = render(el);
    const stored = getTree(handle);
    expect(stored?.type).toBe("View");
  });

  it("sends a render message to the bridge", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });
    render(createElement("View", null));
    const renderMsgs = bridge.messages.filter((m) => m.type === "render");
    expect(renderMsgs.length).toBeGreaterThan(0);
  });

  it("re-uses the provided container handle", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });
    const el = createElement("View", null);
    const handle = render(el, 99);
    expect(handle).toBe(99);
    expect(getTree(99)?.type).toBe("View");
  });
});

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

describe("diff", () => {
  it("returns no patches when both trees are null", () => {
    expect(diff(null, null)).toHaveLength(0);
  });

  it("returns a CREATE patch when oldTree is null", () => {
    const el = createElement("View", null);
    const patches = diff(null, el);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.type).toBe("CREATE");
    expect(patches[0]!.element).toBe(el);
  });

  it("returns a DELETE patch when newTree is null", () => {
    const el = createElement("View", null);
    const patches = diff(el, null);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.type).toBe("DELETE");
  });

  it("returns a REPLACE patch when element types differ", () => {
    const old = createElement("View", null);
    const next = createElement("Text", null);
    const patches = diff(old, next);
    expect(patches[0]!.type).toBe("REPLACE");
    expect(patches[0]!.element?.type).toBe("Text");
  });

  it("returns an UPDATE patch when props change", () => {
    const old = createElement("View", { color: "red" });
    const next = createElement("View", { color: "blue" });
    const patches = diff(old, next);
    expect(patches.some((p) => p.type === "UPDATE")).toBe(true);
    const update = patches.find((p) => p.type === "UPDATE");
    expect(update?.props?.["color"]).toBe("blue");
  });

  it("returns no patches when trees are structurally identical", () => {
    const a = createElement("View", { flex: 1 }, createElement("Text", null, "hi"));
    const b = createElement("View", { flex: 1 }, createElement("Text", null, "hi"));
    // Note: "hi" children are primitives, no UPDATE expected at the View or Text level.
    const patches = diff(a, b);
    expect(patches.filter((p) => p.type === "UPDATE" || p.type === "REPLACE")).toHaveLength(0);
  });

  it("detects child additions", () => {
    const old = createElement("View", null);
    const next = createElement("View", null, createElement("Text", null, "new"));
    const patches = diff(old, next);
    expect(patches.some((p) => p.type === "CREATE")).toBe(true);
  });

  it("detects child removals", () => {
    const old = createElement("View", null, createElement("Text", null, "bye"));
    const next = createElement("View", null);
    const patches = diff(old, next);
    expect(patches.some((p) => p.type === "DELETE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// patch
// ---------------------------------------------------------------------------

describe("patch", () => {
  it("applies a CREATE patch to a null tree", () => {
    const bridge = makeBridge();
    configure({ platform: "android", bridge });

    const handle = render(null);
    const newEl = createElement("Text", null, "created");
    patch(handle, [{ type: "CREATE", path: [], element: newEl }]);

    expect(getTree(handle)?.type).toBe("Text");
  });

  it("applies a DELETE patch", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });

    const el = createElement("View", null);
    const handle = render(el);
    patch(handle, [{ type: "DELETE", path: [] }]);

    expect(getTree(handle)).toBeNull();
  });

  it("applies an UPDATE patch to props", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });

    const el = createElement("View", { color: "red" });
    const handle = render(el);
    patch(handle, [{ type: "UPDATE", path: [], props: { color: "blue" } }]);

    expect(getTree(handle)?.props["color"]).toBe("blue");
  });

  it("sends a patch message to the bridge", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });

    const el = createElement("View", { x: 1 });
    const handle = render(el);
    bridge.messages.length = 0; // reset

    patch(handle, [{ type: "UPDATE", path: [], props: { x: 2 } }]);
    expect(bridge.messages.some((m) => m.type === "patch")).toBe(true);
  });

  it("is a no-op for empty patch list", () => {
    const bridge = makeBridge();
    configure({ platform: "ios", bridge });

    const el = createElement("View", { x: 1 });
    const handle = render(el);
    const before = getTree(handle);
    patch(handle, []);
    expect(getTree(handle)).toBe(before);
  });
});
