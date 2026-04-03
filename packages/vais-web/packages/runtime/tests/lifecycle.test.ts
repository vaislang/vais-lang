import { describe, it, expect, vi } from "vitest";
import { $$mount, $$destroy } from "../src/lifecycle.js";
import { $$element, $$text, $$append } from "../src/dom.js";
import type { ComponentInstance } from "../src/lifecycle.js";

describe("$$mount", () => {
  it("calls component function with target and returns instance", () => {
    const target = $$element("div");
    const instance = $$mount(target, (t) => {
      const p = $$element("p");
      $$append(p, $$text("hello"));
      $$append(t, p);
      return {};
    });
    expect(target.innerHTML).toBe("<p>hello</p>");
    expect(instance).toBeDefined();
  });

  it("returns instance with $$update and $$destroy", () => {
    const target = $$element("div");
    const update = vi.fn();
    const destroy = vi.fn();
    const instance = $$mount(target, () => ({
      $$update: update,
      $$destroy: destroy,
    }));
    expect(instance.$$update).toBe(update);
    expect(instance.$$destroy).toBe(destroy);
  });
});

describe("$$destroy", () => {
  it("calls $$destroy on the instance", () => {
    const destroyFn = vi.fn();
    const instance: ComponentInstance = { $$destroy: destroyFn };
    $$destroy(instance);
    expect(destroyFn).toHaveBeenCalledTimes(1);
  });

  it("does nothing if instance is null", () => {
    expect(() => $$destroy(null)).not.toThrow();
  });

  it("does nothing if instance is undefined", () => {
    expect(() => $$destroy(undefined)).not.toThrow();
  });

  it("does nothing if instance has no $$destroy", () => {
    expect(() => $$destroy({})).not.toThrow();
  });
});
