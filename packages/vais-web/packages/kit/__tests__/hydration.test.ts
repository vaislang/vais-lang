import { describe, it, expect, vi, beforeEach } from "vitest";
import { findHydrationTargets } from "../src/hydration/markers.js";
import { deserializeState, serializeState } from "../src/hydration/state.js";
import { createEventQueue } from "../src/hydration/queue.js";
import { hydrate, hydrateAll } from "../src/hydration/hydrate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createElement(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

// ---------------------------------------------------------------------------
// markers.ts — findHydrationTargets
// ---------------------------------------------------------------------------

describe("findHydrationTargets", () => {
  it("finds elements with data-vx attribute", () => {
    const root = createElement(`
      <button data-vx="c0" data-vx-state="">Click</button>
    `);
    const targets = findHydrationTargets(root);
    expect(targets).toHaveLength(1);
    expect(targets[0].componentId).toBe("c0");
  });

  it("parses componentId and events from data-vx with colon format", () => {
    const root = createElement(`
      <button data-vx="c0:click,input" data-vx-state="">Click</button>
    `);
    const targets = findHydrationTargets(root);
    expect(targets[0].componentId).toBe("c0");
    expect(targets[0].events).toEqual(["click", "input"]);
  });

  it("parses componentId-only data-vx (no colon)", () => {
    const root = createElement(`
      <div data-vx="mycomp" data-vx-state=""></div>
    `);
    const targets = findHydrationTargets(root);
    expect(targets[0].componentId).toBe("mycomp");
    expect(targets[0].events).toEqual([]);
  });

  it("extracts stateBase64 from data-vx-state", () => {
    const stateBase64 = btoa(JSON.stringify({ count: 0 }));
    const root = createElement(`
      <button data-vx="c0:click" data-vx-state="${stateBase64}">Click</button>
    `);
    const targets = findHydrationTargets(root);
    expect(targets[0].stateBase64).toBe(stateBase64);
  });

  it("finds multiple hydration targets", () => {
    const root = createElement(`
      <div>
        <button data-vx="c0:click" data-vx-state="">A</button>
        <input data-vx="c1:input" data-vx-state="">
        <span data-vx="c2" data-vx-state="">B</span>
      </div>
    `);
    const targets = findHydrationTargets(root);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.componentId)).toEqual(["c0", "c1", "c2"]);
  });

  it("returns empty array when no data-vx elements exist", () => {
    const root = createElement(`<div><p>no hydration here</p></div>`);
    const targets = findHydrationTargets(root);
    expect(targets).toHaveLength(0);
  });

  it("handles single event in colon format", () => {
    const root = createElement(`
      <button data-vx="btn:click" data-vx-state=""></button>
    `);
    const targets = findHydrationTargets(root);
    expect(targets[0].events).toEqual(["click"]);
  });
});

// ---------------------------------------------------------------------------
// state.ts — deserializeState / serializeState
// ---------------------------------------------------------------------------

describe("deserializeState", () => {
  it("decodes base64 and parses JSON correctly", () => {
    const state = { count: 0, user: "alice" };
    const base64 = btoa(JSON.stringify(state));
    expect(deserializeState(base64)).toEqual(state);
  });

  it("returns empty object for empty string", () => {
    expect(deserializeState("")).toEqual({});
  });

  it("returns empty object for invalid base64", () => {
    expect(deserializeState("!!!invalid!!!")).toEqual({});
  });

  it("returns empty object for valid base64 but invalid JSON", () => {
    const notJson = btoa("this is not json");
    expect(deserializeState(notJson)).toEqual({});
  });

  it("returns empty object when decoded JSON is not an object", () => {
    const arrayBase64 = btoa(JSON.stringify([1, 2, 3]));
    expect(deserializeState(arrayBase64)).toEqual({});
  });
});

describe("serializeState", () => {
  it("serializes a state object to base64 JSON", () => {
    const state = { count: 5 };
    const result = serializeState(state);
    expect(result).toBe(btoa(JSON.stringify(state)));
  });

  it("round-trips through serialize then deserialize", () => {
    const state = { name: "test", value: 42, nested: { a: 1 } };
    expect(deserializeState(serializeState(state))).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// queue.ts — createEventQueue
// ---------------------------------------------------------------------------

describe("createEventQueue", () => {
  it("captures and replays events on the target element", () => {
    const queue = createEventQueue();
    const el = document.createElement("button");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    const handler = vi.fn();
    el.addEventListener("click", handler);

    queue.capture(el, event);
    queue.replay(el);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replays multiple events in order", () => {
    const queue = createEventQueue();
    const el = document.createElement("input");
    const results: string[] = [];

    el.addEventListener("focus", () => results.push("focus"));
    el.addEventListener("input", () => results.push("input"));

    queue.capture(el, new Event("focus", { bubbles: false }));
    queue.capture(el, new Event("input", { bubbles: true }));
    queue.replay(el);

    expect(results).toEqual(["focus", "input"]);
  });

  it("does not replay after clear()", () => {
    const queue = createEventQueue();
    const el = document.createElement("button");
    const handler = vi.fn();
    el.addEventListener("click", handler);

    queue.capture(el, new MouseEvent("click"));
    queue.clear();
    queue.replay(el);

    expect(handler).not.toHaveBeenCalled();
  });

  it("replay removes events from the queue (no double replay)", () => {
    const queue = createEventQueue();
    const el = document.createElement("button");
    const handler = vi.fn();
    el.addEventListener("click", handler);

    queue.capture(el, new MouseEvent("click"));
    queue.replay(el);
    queue.replay(el); // second replay should do nothing

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replay on element with no captured events does nothing", () => {
    const queue = createEventQueue();
    const el = document.createElement("div");
    const handler = vi.fn();
    el.addEventListener("click", handler);

    // No capture — just replay
    expect(() => queue.replay(el)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hydrate.ts — hydrate / hydrateAll
// ---------------------------------------------------------------------------

describe("hydrate", () => {
  beforeEach(() => {
    // Reset document body before each test
    document.body.innerHTML = "";
  });

  it("mounts the component on the matching element", async () => {
    const stateBase64 = btoa(JSON.stringify({ count: 0 }));
    document.body.innerHTML = `
      <button data-vx="c0:click" data-vx-state="${stateBase64}">Click</button>
    `;

    const mountFn = vi.fn();
    await hydrate("c0", async () => ({ default: mountFn }));

    expect(mountFn).toHaveBeenCalledTimes(1);
    const [el, state] = mountFn.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(el.tagName).toBe("BUTTON");
    expect(state).toEqual({ count: 0 });
  });

  it("removes data-vx and data-vx-state attributes after hydration", async () => {
    document.body.innerHTML = `
      <div data-vx="c1" data-vx-state="${btoa(JSON.stringify({}))}">content</div>
    `;

    await hydrate("c1", async () => ({ default: vi.fn() }));

    const el = document.querySelector("div");
    expect(el?.hasAttribute("data-vx")).toBe(false);
    expect(el?.hasAttribute("data-vx-state")).toBe(false);
  });

  it("does nothing when no matching element is found", async () => {
    document.body.innerHTML = `<div data-vx="c2" data-vx-state="">content</div>`;
    const mountFn = vi.fn();

    // Hydrate for a different componentId
    await hydrate("nonexistent", async () => ({ default: mountFn }));

    expect(mountFn).not.toHaveBeenCalled();
  });

  it("deserializes state and passes it to the mount function", async () => {
    const state = { name: "world", count: 99 };
    document.body.innerHTML = `
      <span data-vx="greet" data-vx-state="${btoa(JSON.stringify(state))}">Hello</span>
    `;

    let receivedState: Record<string, unknown> | undefined;
    await hydrate("greet", async () => ({
      default: (_el: HTMLElement, s?: Record<string, unknown>) => {
        receivedState = s;
        return {};
      },
    }));

    expect(receivedState).toEqual(state);
  });
});

describe("hydrateAll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("hydrates all matching components", async () => {
    document.body.innerHTML = `
      <button data-vx="comp-a:click" data-vx-state="${btoa(JSON.stringify({ a: 1 }))}">A</button>
      <div data-vx="comp-b" data-vx-state="${btoa(JSON.stringify({ b: 2 }))}">B</div>
    `;

    const mountA = vi.fn();
    const mountB = vi.fn();

    await hydrateAll({
      "comp-a": async () => ({ default: mountA }),
      "comp-b": async () => ({ default: mountB }),
    });

    expect(mountA).toHaveBeenCalledTimes(1);
    expect(mountB).toHaveBeenCalledTimes(1);
  });

  it("removes data-vx attributes from all hydrated elements", async () => {
    document.body.innerHTML = `
      <button data-vx="x" data-vx-state="${btoa(JSON.stringify({}))}">X</button>
      <span data-vx="y" data-vx-state="${btoa(JSON.stringify({}))}">Y</span>
    `;

    await hydrateAll({
      x: async () => ({ default: vi.fn() }),
      y: async () => ({ default: vi.fn() }),
    });

    const remaining = document.querySelectorAll("[data-vx]");
    expect(remaining).toHaveLength(0);
  });

  it("skips elements whose componentId is not in modules map", async () => {
    document.body.innerHTML = `
      <div data-vx="known" data-vx-state="${btoa(JSON.stringify({}))}">Known</div>
      <div data-vx="unknown" data-vx-state="${btoa(JSON.stringify({}))}">Unknown</div>
    `;

    const mountFn = vi.fn();
    await hydrateAll({
      known: async () => ({ default: mountFn }),
    });

    expect(mountFn).toHaveBeenCalledTimes(1);
    // The unknown element should still have its data-vx attribute
    const unknownEl = document.querySelector('[data-vx="unknown"]');
    expect(unknownEl).not.toBeNull();
  });
});
