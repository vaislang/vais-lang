import { describe, it, expect, beforeEach } from "vitest";
import {
  getByText,
  getByTestId,
  getByRole,
  queryByText,
  queryByTestId,
  queryByRole,
  queryAllByText,
  queryAllByTestId,
  queryAllByRole,
  findByText,
  findByTestId,
  findByRole,
} from "../src/queries.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = `
    <h1>Main Title</h1>
    <p data-testid="para-1">Hello World</p>
    <button aria-label="Save button">Save</button>
    <input type="text" placeholder="Enter name" />
    <a href="/home">Go Home</a>
    <ul>
      <li>Item A</li>
      <li>Item B</li>
    </ul>
    <span data-testid="span-1">Duplicate text</span>
    <span data-testid="span-2">Unique</span>
  `;
});

// ---------------------------------------------------------------------------
// getByText
// ---------------------------------------------------------------------------

describe("getByText()", () => {
  it("returns the element matching an exact string", () => {
    const el = getByText(container, "Hello World");
    expect(el.tagName).toBe("P");
  });

  it("returns the element matching a RegExp", () => {
    const el = getByText(container, /main title/i);
    expect(el.tagName).toBe("H1");
  });

  it("throws when no element is found", () => {
    expect(() => getByText(container, "Not here")).toThrow();
  });

  it("returns the most specific (deepest) matching element", () => {
    // The <li> text 'Item A' is also contained in the <ul>, but we want <li>.
    const el = getByText(container, "Item A");
    expect(el.tagName).toBe("LI");
  });
});

// ---------------------------------------------------------------------------
// queryByText
// ---------------------------------------------------------------------------

describe("queryByText()", () => {
  it("returns matching element", () => {
    const el = queryByText(container, "Go Home");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("A");
  });

  it("returns null when not found", () => {
    expect(queryByText(container, "Missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// queryAllByText
// ---------------------------------------------------------------------------

describe("queryAllByText()", () => {
  it("returns all matching elements", () => {
    const results = queryAllByText(container, "Unique");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// getByTestId / queryByTestId / queryAllByTestId
// ---------------------------------------------------------------------------

describe("getByTestId()", () => {
  it("returns the element with the matching data-testid", () => {
    const el = getByTestId(container, "para-1");
    expect(el.tagName).toBe("P");
  });

  it("throws when no element is found", () => {
    expect(() => getByTestId(container, "nonexistent")).toThrow();
  });
});

describe("queryByTestId()", () => {
  it("returns the element", () => {
    expect(queryByTestId(container, "span-2")).not.toBeNull();
  });

  it("returns null when not found", () => {
    expect(queryByTestId(container, "missing")).toBeNull();
  });
});

describe("queryAllByTestId()", () => {
  it("returns all elements with the testid", () => {
    // There is 1 element with data-testid="span-1"
    const results = queryAllByTestId(container, "span-1");
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getByRole / queryByRole / queryAllByRole
// ---------------------------------------------------------------------------

describe("getByRole()", () => {
  it("finds a button by implicit role", () => {
    const el = getByRole(container, "button");
    expect(el.tagName).toBe("BUTTON");
  });

  it("finds a link by implicit role", () => {
    const el = getByRole(container, "link");
    expect(el.tagName).toBe("A");
  });

  it("finds a heading by implicit role", () => {
    const el = getByRole(container, "heading");
    expect(el.tagName).toBe("H1");
  });

  it("finds an element with explicit aria role", () => {
    container.innerHTML = `<div role="dialog" aria-label="Confirm">Content</div>`;
    const el = getByRole(container, "dialog");
    expect(el.getAttribute("role")).toBe("dialog");
  });

  it("throws when role is not found", () => {
    expect(() => getByRole(container, "tabpanel")).toThrow();
  });

  it("filters by accessible name via aria-label", () => {
    const el = getByRole(container, "button", { name: "Save button" });
    expect(el.tagName).toBe("BUTTON");
  });
});

describe("queryByRole()", () => {
  it("returns null when not found", () => {
    expect(queryByRole(container, "tab")).toBeNull();
  });
});

describe("queryAllByRole()", () => {
  it("returns all elements with the given role", () => {
    container.innerHTML = `<li>A</li><li>B</li><li>C</li>`;
    const items = queryAllByRole(container, "listitem");
    expect(items).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Async findBy* variants
// ---------------------------------------------------------------------------

describe("findByText()", () => {
  it("resolves immediately when the element is already present", async () => {
    const el = await findByText(container, "Hello World");
    expect(el.tagName).toBe("P");
  });

  it("resolves after the element is added asynchronously", async () => {
    const asyncContainer = document.createElement("div");
    document.body.appendChild(asyncContainer);

    setTimeout(() => {
      const span = document.createElement("span");
      span.textContent = "Async Content";
      asyncContainer.appendChild(span);
    }, 50);

    const el = await findByText(asyncContainer, "Async Content", { timeout: 500 });
    expect(el.textContent).toBe("Async Content");
  });

  it("rejects when element never appears", async () => {
    const empty = document.createElement("div");
    document.body.appendChild(empty);
    await expect(findByText(empty, "Never", { timeout: 100 })).rejects.toThrow();
  });
});

describe("findByTestId()", () => {
  it("resolves immediately when present", async () => {
    const el = await findByTestId(container, "para-1");
    expect(el).not.toBeNull();
  });
});

describe("findByRole()", () => {
  it("resolves immediately when present", async () => {
    const el = await findByRole(container, "button");
    expect(el.tagName).toBe("BUTTON");
  });
});
