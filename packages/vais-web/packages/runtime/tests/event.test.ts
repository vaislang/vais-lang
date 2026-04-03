import { describe, it, expect, vi } from "vitest";
import { $$listen } from "../src/event.js";
import { $$element } from "../src/dom.js";

describe("$$listen", () => {
  it("adds an event listener", () => {
    const el = $$element("button");
    const handler = vi.fn();
    $$listen(el, "click", handler);
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns a cleanup function that removes the listener", () => {
    const el = $$element("button");
    const handler = vi.fn();
    const cleanup = $$listen(el, "click", handler);
    cleanup();
    el.click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("applies preventDefault modifier", () => {
    const el = $$element("button");
    const handler = vi.fn();
    $$listen(el, "click", handler, { preventDefault: true });
    const event = new Event("click", { cancelable: true });
    el.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("applies stopPropagation modifier", () => {
    const parent = $$element("div");
    const child = $$element("button");
    parent.appendChild(child);

    const parentHandler = vi.fn();
    const childHandler = vi.fn();
    parent.addEventListener("click", parentHandler);
    $$listen(child, "click", childHandler, { stopPropagation: true });

    child.click();
    expect(childHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it("applies once modifier", () => {
    const el = $$element("button");
    const handler = vi.fn();
    $$listen(el, "click", handler, { once: true });
    el.click();
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("works without modifiers", () => {
    const el = $$element("button");
    const handler = vi.fn();
    $$listen(el, "click", handler);
    el.click();
    el.click();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("combines multiple modifiers", () => {
    const el = $$element("button");
    const handler = vi.fn();
    $$listen(el, "click", handler, {
      preventDefault: true,
      stopPropagation: true,
    });
    const event = new Event("click", { cancelable: true, bubbles: true });
    el.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
