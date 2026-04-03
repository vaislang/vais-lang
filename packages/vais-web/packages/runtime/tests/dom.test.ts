import { describe, it, expect } from "vitest";
import {
  $$element,
  $$text,
  $$append,
  $$attr,
  $$set_text,
  $$anchor,
  $$create_fragment,
  $$insert_before,
  $$remove_fragment,
  $$spread,
} from "../src/dom.js";

describe("$$element", () => {
  it("creates an HTML element with the given tag", () => {
    const div = $$element("div");
    expect(div).toBeInstanceOf(HTMLDivElement);
    expect(div.tagName).toBe("DIV");
  });

  it("creates different element types", () => {
    expect($$element("button")).toBeInstanceOf(HTMLButtonElement);
    expect($$element("input")).toBeInstanceOf(HTMLInputElement);
    expect($$element("span")).toBeInstanceOf(HTMLSpanElement);
  });
});

describe("$$text", () => {
  it("creates a text node with string content", () => {
    const t = $$text("hello");
    expect(t).toBeInstanceOf(Text);
    expect(t.data).toBe("hello");
  });

  it("converts numbers to string", () => {
    expect($$text(42).data).toBe("42");
  });

  it("converts booleans to string", () => {
    expect($$text(true).data).toBe("true");
    expect($$text(false).data).toBe("false");
  });

  it("treats null as empty string", () => {
    expect($$text(null).data).toBe("");
  });

  it("treats undefined as empty string", () => {
    expect($$text(undefined).data).toBe("");
  });
});

describe("$$append", () => {
  it("appends a child to a parent", () => {
    const parent = $$element("div");
    const child = $$element("span");
    $$append(parent, child);
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(child);
  });

  it("appends text node to element", () => {
    const el = $$element("p");
    const t = $$text("hello");
    $$append(el, t);
    expect(el.textContent).toBe("hello");
  });

  it("appends fragment children to element", () => {
    const el = $$element("div");
    const frag = $$create_fragment();
    $$append(frag, $$element("span"));
    $$append(frag, $$element("p"));
    $$append(el, frag);
    expect(el.children.length).toBe(2);
  });
});

describe("$$attr", () => {
  it("sets a string attribute", () => {
    const el = $$element("div");
    $$attr(el, "class", "container");
    expect(el.getAttribute("class")).toBe("container");
  });

  it("sets a numeric attribute as string", () => {
    const el = $$element("div");
    $$attr(el, "tabindex", 0);
    expect(el.getAttribute("tabindex")).toBe("0");
  });

  it("sets boolean true as empty string attribute", () => {
    const el = $$element("div");
    $$attr(el, "hidden", true);
    expect(el.getAttribute("hidden")).toBe("");
  });

  it("removes attribute when value is null", () => {
    const el = $$element("div");
    $$attr(el, "class", "x");
    $$attr(el, "class", null);
    expect(el.hasAttribute("class")).toBe(false);
  });

  it("removes attribute when value is false", () => {
    const el = $$element("div");
    $$attr(el, "hidden", true);
    $$attr(el, "hidden", false);
    expect(el.hasAttribute("hidden")).toBe(false);
  });

  it("sets special property directly (value)", () => {
    const el = $$element("input") as HTMLInputElement;
    $$attr(el, "value", "test");
    expect(el.value).toBe("test");
  });

  it("sets special property directly (checked)", () => {
    const el = $$element("input") as HTMLInputElement;
    el.type = "checkbox";
    $$attr(el, "checked", true);
    expect(el.checked).toBe(true);
  });
});

describe("$$set_text", () => {
  it("updates text node content", () => {
    const t = $$text("old");
    $$set_text(t, "new");
    expect(t.data).toBe("new");
  });

  it("converts numbers", () => {
    const t = $$text("0");
    $$set_text(t, 42);
    expect(t.data).toBe("42");
  });

  it("treats null as empty string", () => {
    const t = $$text("x");
    $$set_text(t, null);
    expect(t.data).toBe("");
  });

  it("skips update if value unchanged", () => {
    const t = $$text("same");
    // Verify the optimization: data should remain "same" without triggering a DOM write
    $$set_text(t, "same");
    expect(t.data).toBe("same");

    // Verify it does update when changed
    $$set_text(t, "different");
    expect(t.data).toBe("different");
  });
});

describe("$$anchor", () => {
  it("creates a comment node", () => {
    const a = $$anchor();
    expect(a).toBeInstanceOf(Comment);
    expect(a.data).toBe("");
  });
});

describe("$$create_fragment", () => {
  it("creates a DocumentFragment", () => {
    const frag = $$create_fragment();
    expect(frag).toBeInstanceOf(DocumentFragment);
  });
});

describe("$$insert_before", () => {
  it("inserts node before anchor", () => {
    const parent = $$element("div");
    const anchor = $$anchor();
    $$append(parent, anchor);
    const span = $$element("span");
    $$insert_before(parent, span, anchor);
    expect(parent.firstChild).toBe(span);
    expect(parent.lastChild).toBe(anchor);
  });
});

describe("$$remove_fragment", () => {
  it("removes node from parent", () => {
    const parent = $$element("div");
    const child = $$element("span");
    $$append(parent, child);
    expect(parent.children.length).toBe(1);
    $$remove_fragment(child);
    expect(parent.children.length).toBe(0);
  });

  it("does nothing if node has no parent", () => {
    const orphan = $$element("div");
    expect(() => $$remove_fragment(orphan)).not.toThrow();
  });
});

describe("$$spread", () => {
  it("spreads string attributes", () => {
    const el = $$element("div");
    $$spread(el, { class: "box", id: "main" });
    expect(el.getAttribute("class")).toBe("box");
    expect(el.getAttribute("id")).toBe("main");
  });

  it("spreads event handlers (onXxx)", () => {
    const el = $$element("button");
    let clicked = false;
    $$spread(el, { onClick: () => { clicked = true; } });
    el.click();
    expect(clicked).toBe(true);
  });

  it("spreads boolean attributes", () => {
    const el = $$element("div");
    $$spread(el, { hidden: true });
    expect(el.getAttribute("hidden")).toBe("");
  });
});
