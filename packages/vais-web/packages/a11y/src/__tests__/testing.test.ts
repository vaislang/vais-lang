/**
 * @vaisx/a11y — Testing utility tests
 *
 * 25+ tests covering all query helpers and the toBeAccessible matcher.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getByRole,
  getAllByRole,
  queryByRole,
  queryAllByRole,
  getByLabelText,
  getAllByLabelText,
  queryByLabelText,
  queryAllByLabelText,
  getByAltText,
  getAllByAltText,
  queryByAltText,
  getByTitle,
  queryByTitle,
  getRoles,
  isInaccessible,
  toBeAccessible,
} from "../testing.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function render(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

// Clean up DOM between tests
beforeEach(() => {
  document.body.innerHTML = "";
});

// ─── getByRole ────────────────────────────────────────────────────────────────

describe("getByRole", () => {
  it("finds a button element by role", () => {
    const c = render("<button>Submit</button>");
    const el = getByRole(c, "button");
    expect(el.tagName.toLowerCase()).toBe("button");
  });

  it("finds an anchor element by role=link", () => {
    const c = render('<a href="/about">About</a>');
    const el = getByRole(c, "link");
    expect(el.tagName.toLowerCase()).toBe("a");
  });

  it("finds a heading by role=heading", () => {
    const c = render("<h2>Section Title</h2>");
    const el = getByRole(c, "heading");
    expect(el.tagName.toLowerCase()).toBe("h2");
  });

  it("finds a heading filtered by level", () => {
    const c = render("<h1>Page Title</h1><h2>Section</h2>");
    const el = getByRole(c, "heading", { level: 1 });
    expect(el.tagName.toLowerCase()).toBe("h1");
  });

  it("finds element by role filtered by accessible name (string)", () => {
    const c = render('<button aria-label="Close dialog">X</button>');
    const el = getByRole(c, "button", { name: "Close dialog" });
    expect(el).toBeDefined();
  });

  it("finds element by role filtered by accessible name (regex)", () => {
    const c = render("<button>Save Changes</button>");
    const el = getByRole(c, "button", { name: /save/i });
    expect(el.textContent).toMatch(/Save/);
  });

  it("throws when no matching element found", () => {
    const c = render("<div>no button here</div>");
    expect(() => getByRole(c, "button")).toThrow(/unable to find/i);
  });

  it("throws when multiple elements match (getByRole expects exactly one)", () => {
    const c = render("<button>A</button><button>B</button>");
    expect(() => getByRole(c, "button")).toThrow(/found 2/i);
  });

  it("finds a checkbox by role and checked=false", () => {
    const c = render('<input type="checkbox" id="opt" /><label for="opt">Option</label>');
    const el = getByRole(c, "checkbox", { checked: false });
    expect(el.tagName.toLowerCase()).toBe("input");
  });

  it("finds an element with explicit role attribute", () => {
    const c = render('<div role="dialog" aria-label="Settings">...</div>');
    const el = getByRole(c, "dialog");
    expect(el.getAttribute("role")).toBe("dialog");
  });

  it("finds element with aria-selected=true", () => {
    const c = render('<li role="option" aria-selected="true">Apple</li>');
    const el = getByRole(c, "option", { selected: true });
    expect(el.textContent).toBe("Apple");
  });

  it("excludes aria-hidden elements by default", () => {
    const c = render('<button aria-hidden="true">Hidden</button>');
    expect(() => getByRole(c, "button")).toThrow();
  });

  it("includes aria-hidden elements when hidden:true is passed", () => {
    const c = render('<button aria-hidden="true">Hidden</button>');
    const el = getByRole(c, "button", { hidden: true });
    expect(el).toBeDefined();
  });
});

// ─── getAllByRole ──────────────────────────────────────────────────────────────

describe("getAllByRole", () => {
  it("returns all matching elements", () => {
    const c = render("<button>A</button><button>B</button><button>C</button>");
    const els = getAllByRole(c, "button");
    expect(els).toHaveLength(3);
  });

  it("throws when no elements match", () => {
    const c = render("<div>nothing</div>");
    expect(() => getAllByRole(c, "button")).toThrow(/unable to find/i);
  });

  it("filters by name using getAllByRole", () => {
    const c = render('<button aria-label="A">A</button><button aria-label="B">B</button>');
    const els = getAllByRole(c, "button", { name: "A" });
    expect(els).toHaveLength(1);
    expect(els[0]?.getAttribute("aria-label")).toBe("A");
  });
});

// ─── queryByRole / queryAllByRole ─────────────────────────────────────────────

describe("queryByRole / queryAllByRole", () => {
  it("queryByRole returns null when no match", () => {
    const c = render("<div>nothing</div>");
    expect(queryByRole(c, "button")).toBeNull();
  });

  it("queryByRole returns element when found", () => {
    const c = render("<button>Click</button>");
    const el = queryByRole(c, "button");
    expect(el).not.toBeNull();
    expect(el?.tagName.toLowerCase()).toBe("button");
  });

  it("queryByRole throws when multiple found", () => {
    const c = render("<button>A</button><button>B</button>");
    expect(() => queryByRole(c, "button")).toThrow(/found 2/i);
  });

  it("queryAllByRole returns empty array when no match", () => {
    const c = render("<div>nothing</div>");
    expect(queryAllByRole(c, "button")).toEqual([]);
  });

  it("queryAllByRole never throws", () => {
    const c = render("<span>safe</span>");
    expect(() => queryAllByRole(c, "button")).not.toThrow();
  });
});

// ─── getByLabelText / queryByLabelText ────────────────────────────────────────

describe("getByLabelText", () => {
  it("finds input associated via <label for>", () => {
    const c = render('<label for="email">Email</label><input id="email" type="email" />');
    const el = getByLabelText(c, "Email");
    expect(el.tagName.toLowerCase()).toBe("input");
  });

  it("finds input with aria-label", () => {
    const c = render('<input aria-label="Search query" type="search" />');
    const el = getByLabelText(c, "Search query");
    expect(el.tagName.toLowerCase()).toBe("input");
  });

  it("finds input with aria-labelledby", () => {
    const c = render('<span id="lbl">Username</span><input aria-labelledby="lbl" />');
    const el = getByLabelText(c, "Username");
    expect(el.tagName.toLowerCase()).toBe("input");
  });

  it("finds input with label using regex", () => {
    const c = render('<label for="pw">Password</label><input id="pw" type="password" />');
    const el = getByLabelText(c, /password/i);
    expect(el.getAttribute("type")).toBe("password");
  });

  it("throws when no label text matches", () => {
    const c = render('<input aria-label="other" />');
    expect(() => getByLabelText(c, "Nonexistent")).toThrow(/unable to find/i);
  });

  it("queryByLabelText returns null when not found", () => {
    const c = render("<input />");
    expect(queryByLabelText(c, "Missing label")).toBeNull();
  });

  it("queryAllByLabelText returns all matches", () => {
    const c = render(
      '<input aria-label="Tag" /><input aria-label="Tag" />'
    );
    const els = queryAllByLabelText(c, "Tag");
    expect(els).toHaveLength(2);
  });

  it("getAllByLabelText throws when no match", () => {
    const c = render("<div></div>");
    expect(() => getAllByLabelText(c, "Missing")).toThrow(/unable to find/i);
  });
});

// ─── getByAltText ─────────────────────────────────────────────────────────────

describe("getByAltText", () => {
  it("finds an img by alt text", () => {
    const c = render('<img src="logo.png" alt="Company Logo" />');
    const el = getByAltText(c, "Company Logo");
    expect(el.tagName.toLowerCase()).toBe("img");
  });

  it("finds by alt using regex", () => {
    const c = render('<img src="hero.png" alt="Hero banner image" />');
    const el = getByAltText(c, /hero/i);
    expect(el).toBeDefined();
  });

  it("throws when no alt text matches", () => {
    const c = render('<img src="x.png" alt="other" />');
    expect(() => getByAltText(c, "nonexistent")).toThrow(/unable to find/i);
  });

  it("queryByAltText returns null when not found", () => {
    const c = render('<img src="x.png" alt="icon" />');
    expect(queryByAltText(c, "missing")).toBeNull();
  });

  it("getAllByAltText returns all matching images", () => {
    const c = render('<img alt="icon" /><img alt="icon" />');
    expect(getAllByAltText(c, "icon")).toHaveLength(2);
  });
});

// ─── getByTitle ───────────────────────────────────────────────────────────────

describe("getByTitle", () => {
  it("finds an element by title attribute", () => {
    const c = render('<abbr title="World Health Organization">WHO</abbr>');
    const el = getByTitle(c, "World Health Organization");
    expect(el.tagName.toLowerCase()).toBe("abbr");
  });

  it("finds by title using regex", () => {
    const c = render('<button title="Close the modal">X</button>');
    const el = getByTitle(c, /close/i);
    expect(el).toBeDefined();
  });

  it("queryByTitle returns null when not found", () => {
    const c = render("<button>No title</button>");
    expect(queryByTitle(c, "missing")).toBeNull();
  });

  it("throws when no title matches", () => {
    const c = render('<span title="hello">hi</span>');
    expect(() => getByTitle(c, "nonexistent")).toThrow(/unable to find/i);
  });
});

// ─── getRoles ─────────────────────────────────────────────────────────────────

describe("getRoles", () => {
  it("returns a Map with role keys", () => {
    const c = render("<button>Click</button><nav>Nav</nav>");
    const roleMap = getRoles(c);
    expect(roleMap instanceof Map).toBe(true);
  });

  it("maps button role to button elements", () => {
    const c = render("<button>A</button><button>B</button>");
    const roleMap = getRoles(c);
    expect(roleMap.get("button")).toHaveLength(2);
  });

  it("maps navigation role to nav elements", () => {
    const c = render("<nav aria-label='Main'>...</nav>");
    const roleMap = getRoles(c);
    const navEls = roleMap.get("navigation");
    expect(navEls).toBeDefined();
    expect(navEls!.length).toBeGreaterThanOrEqual(1);
  });

  it("includes explicit role attributes in the map", () => {
    const c = render('<div role="tabpanel">content</div>');
    const roleMap = getRoles(c);
    expect(roleMap.get("tabpanel")).toHaveLength(1);
  });
});

// ─── isInaccessible ───────────────────────────────────────────────────────────

describe("isInaccessible", () => {
  it("returns false for a normal visible element", () => {
    const c = render("<button>Visible</button>");
    const btn = c.querySelector("button")!;
    expect(isInaccessible(btn)).toBe(false);
  });

  it("returns true when aria-hidden=true is on the element", () => {
    const c = render('<button aria-hidden="true">Hidden</button>');
    expect(isInaccessible(c.querySelector("button")!)).toBe(true);
  });

  it("returns true when aria-hidden=true is on an ancestor", () => {
    const c = render('<div aria-hidden="true"><button>Deep</button></div>');
    expect(isInaccessible(c.querySelector("button")!)).toBe(true);
  });

  it("returns true when hidden attribute is present", () => {
    const c = render("<button hidden>Hidden</button>");
    expect(isInaccessible(c.querySelector("button")!)).toBe(true);
  });

  it("returns true when display:none is set via inline style", () => {
    const c = render('<div style="display:none"><button>Hidden</button></div>');
    expect(isInaccessible(c.querySelector("button")!)).toBe(true);
  });

  it("returns true when visibility:hidden is set via inline style", () => {
    const c = render('<span style="visibility:hidden">invisible</span>');
    expect(isInaccessible(c.querySelector("span")!)).toBe(true);
  });
});

// ─── toBeAccessible ───────────────────────────────────────────────────────────

describe("toBeAccessible", () => {
  it("passes for a button with accessible text", () => {
    const c = render("<button>Save</button>");
    const result = toBeAccessible(c.querySelector("button")!);
    expect(result.pass).toBe(true);
  });

  it("passes for an img with descriptive alt", () => {
    const c = render('<img src="logo.png" alt="Company logo" />');
    const result = toBeAccessible(c.querySelector("img")!);
    expect(result.pass).toBe(true);
  });

  it("fails for an img without alt", () => {
    const c = render('<img src="x.png" />');
    const result = toBeAccessible(c.querySelector("img")!);
    expect(result.pass).toBe(false);
    expect(result.message()).toMatch(/alt/i);
  });

  it("fails for a button with no accessible name", () => {
    const c = render("<button></button>");
    const result = toBeAccessible(c.querySelector("button")!);
    expect(result.pass).toBe(false);
    expect(result.message()).toMatch(/accessible name/i);
  });

  it("passes for a button with aria-label", () => {
    const c = render('<button aria-label="Close">X</button>');
    const result = toBeAccessible(c.querySelector("button")!);
    expect(result.pass).toBe(true);
  });

  it("fails for role=checkbox missing aria-checked", () => {
    const c = render('<div role="checkbox">Option</div>');
    const result = toBeAccessible(c.querySelector("div")!);
    expect(result.pass).toBe(false);
    expect(result.message()).toMatch(/aria-checked/);
  });

  it("passes for role=checkbox with aria-checked", () => {
    const c = render('<div role="checkbox" aria-checked="false" aria-label="Accept terms">Accept</div>');
    const result = toBeAccessible(c.querySelector("div")!);
    expect(result.pass).toBe(true);
  });

  it("message() returns positive message when pass=true", () => {
    const c = render("<button>OK</button>");
    const result = toBeAccessible(c.querySelector("button")!);
    expect(result.message()).toMatch(/accessible/i);
  });

  it("message() lists multiple issues when several checks fail", () => {
    const c = render('<img src="x.png" />');
    const result = toBeAccessible(c.querySelector("img")!);
    expect(result.pass).toBe(false);
    expect(typeof result.message()).toBe("string");
    expect(result.message().length).toBeGreaterThan(0);
  });

  it("passes for an anchor with href and text content", () => {
    const c = render('<a href="/home">Home</a>');
    const result = toBeAccessible(c.querySelector("a")!);
    expect(result.pass).toBe(true);
  });

  it("fails for an anchor with href but no accessible name", () => {
    const c = render('<a href="/home"></a>');
    const result = toBeAccessible(c.querySelector("a")!);
    expect(result.pass).toBe(false);
  });
});
