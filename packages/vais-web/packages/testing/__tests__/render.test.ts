import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "../src/render.js";
import type { ComponentFactory } from "../src/render.js";

// ---------------------------------------------------------------------------
// Minimal component factory helpers used across tests
//
// VaisX components have the signature `(target: HTMLElement) => ComponentInstance`.
// The function mounts its DOM into the target directly and returns an instance
// with optional `$$destroy` / `$$update` hooks.
// ---------------------------------------------------------------------------

/** Creates a simple component that appends a <p> with textContent. */
function makeTextComponent(text: string): ComponentFactory {
  return (target: HTMLElement) => {
    const p = document.createElement("p");
    p.textContent = text;
    target.appendChild(p);
    return {
      $$destroy() {
        // no-op for simple component
      },
    };
  };
}

/**
 * Creates a component that renders a `label` prop.
 * Since VaisX top-level components don't take props directly, callers pass
 * props by wrapping the factory in a closure before handing it to render().
 */
function makePropsComponent(label: string | undefined): ComponentFactory {
  return (target: HTMLElement) => {
    const el = document.createElement("div");
    el.textContent = String(label ?? "default");
    el.setAttribute("data-testid", "props-el");
    target.appendChild(el);
    return { $$destroy() {} };
  };
}

/** Component that tracks $$destroy calls. */
function makeTrackableComponent(onDestroy: () => void): ComponentFactory {
  return (target: HTMLElement) => {
    const div = document.createElement("div");
    div.textContent = "trackable";
    target.appendChild(div);
    return { $$destroy: onDestroy };
  };
}

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("render()", () => {
  it("mounts component into a container appended to document.body", () => {
    const { container } = render(makeTextComponent("Hello"));
    expect(document.body.contains(container)).toBe(true);
  });

  it("returns container with the rendered content", () => {
    const { container } = render(makeTextComponent("World"));
    expect(container.querySelector("p")?.textContent).toBe("World");
  });

  it("accepts a custom container element", () => {
    const custom = document.createElement("section");
    document.body.appendChild(custom);
    const { container } = render(makeTextComponent("custom"), { container: custom });
    expect(container).toBe(custom);
    expect(container.querySelector("p")?.textContent).toBe("custom");
  });

  it("supports passing props via a closure wrapper", () => {
    const { getByTestId } = render(makePropsComponent("my-label"));
    expect(getByTestId("props-el").textContent).toBe("my-label");
  });

  it("uses 'default' label when the closure omits props", () => {
    const { getByTestId } = render(makePropsComponent(undefined));
    expect(getByTestId("props-el").textContent).toBe("default");
  });

  it("unmount() calls $$destroy on the component instance", () => {
    const spy = vi.fn();
    const { unmount } = render(makeTrackableComponent(spy));
    expect(spy).not.toHaveBeenCalled();
    unmount();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("unmount() removes the container from document.body", () => {
    const { container, unmount } = render(makeTextComponent("bye"));
    expect(document.body.contains(container)).toBe(true);
    unmount();
    expect(document.body.contains(container)).toBe(false);
  });

  it("debug() outputs innerHTML to the console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { debug } = render(makeTextComponent("debug-test"));
    debug();
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.flat().join(" ");
    expect(output).toContain("debug-test");
    spy.mockRestore();
  });
});

describe("cleanup()", () => {
  it("removes all mounted containers from the document", () => {
    const { container: c1 } = render(makeTextComponent("a"));
    const { container: c2 } = render(makeTextComponent("b"));
    expect(document.body.contains(c1)).toBe(true);
    expect(document.body.contains(c2)).toBe(true);
    cleanup();
    expect(document.body.contains(c1)).toBe(false);
    expect(document.body.contains(c2)).toBe(false);
  });

  it("is idempotent — safe to call multiple times", () => {
    render(makeTextComponent("x"));
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it("calls $$destroy on all tracked component instances", () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    render(makeTrackableComponent(spy1));
    render(makeTrackableComponent(spy2));
    expect(spy1).not.toHaveBeenCalled();
    expect(spy2).not.toHaveBeenCalled();
    cleanup();
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
  });
});
