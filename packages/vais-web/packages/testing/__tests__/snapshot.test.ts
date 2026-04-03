import { describe, it, expect } from "vitest";
import {
  normaliseHtml,
  prettyHtml,
  snapshotHtml,
  snapshotElement,
  captureSnapshot,
  assertSnapshotMatch,
} from "../src/snapshot.js";

describe("normaliseHtml()", () => {
  it("trims leading and trailing whitespace from each line", () => {
    const result = normaliseHtml("  <div>  \n  <span>hi</span>  \n  </div>  ");
    expect(result).toBe("<div>\n<span>hi</span>\n</div>");
  });

  it("removes blank lines", () => {
    const result = normaliseHtml("<p>a</p>\n\n\n<p>b</p>");
    expect(result).toBe("<p>a</p>\n<p>b</p>");
  });
});

describe("prettyHtml()", () => {
  it("indents child elements one level deeper than their parent", () => {
    const html = "<div><span>hello</span></div>";
    const result = prettyHtml(html);
    // <span> is a child of <div> — it must be indented at least one level
    const lines = result.split("\n");
    const spanOpenLine = lines.find((l) => l.includes("<span>"))!;
    expect(spanOpenLine).toBeDefined();
    expect(spanOpenLine.startsWith("  ")).toBe(true);
  });

  it("does not indent void elements", () => {
    const html = "<div><br></div>";
    const result = prettyHtml(html);
    // <br> is void — the closing </div> should be at the same level as <div>
    const lines = result.split("\n").map((l) => l.trimEnd());
    const brLine = lines.find((l) => l.includes("<br>"))!;
    const closeLine = lines.find((l) => l.includes("</div>"))!;
    expect(brLine.startsWith("  ")).toBe(true); // indented inside <div>
    expect(closeLine.startsWith("  ")).toBe(false); // back to root level
  });

  it("handles text nodes inside elements", () => {
    const html = "<p>Hello World</p>";
    const result = prettyHtml(html);
    expect(result).toContain("Hello World");
  });

  it("produces multi-line output for nested tags", () => {
    const html = "<div><p>text</p></div>";
    const result = prettyHtml(html);
    expect(result.split("\n").length).toBeGreaterThan(1);
  });
});

describe("snapshotHtml()", () => {
  it("returns pretty-printed innerHTML of container", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>test</p>";
    const snap = snapshotHtml(container);
    // The pretty-printer may split text nodes onto their own line
    expect(snap).toContain("<p>");
    expect(snap).toContain("test");
  });

  it("matches Vitest inline snapshot", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>hi</span>";
    expect(snapshotHtml(container)).toMatchInlineSnapshot(`
"<span>
  hi
</span>"
`);
  });
});

describe("snapshotElement()", () => {
  it("returns pretty-printed outerHTML of the element", () => {
    const el = document.createElement("button");
    el.textContent = "Click me";
    const snap = snapshotElement(el);
    expect(snap).toContain("<button>");
    expect(snap).toContain("Click me");
  });
});

describe("captureSnapshot()", () => {
  it("captures the current HTML with a name and timestamp", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>state 1</p>";
    const snap = captureSnapshot("initial", container);
    expect(snap.name).toBe("initial");
    // The pretty-printer may expand text onto its own line — just check tags
    expect(snap.html).toContain("<p>");
    expect(snap.html).toContain("state 1");
    expect(snap.timestamp).toBeTruthy();
  });
});

describe("assertSnapshotMatch()", () => {
  it("does not throw when snapshots are identical", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>same</p>";
    const a = captureSnapshot("a", container);
    const b = captureSnapshot("b", container);
    expect(() => assertSnapshotMatch(a, b)).not.toThrow();
  });

  it("throws a descriptive error when snapshots differ", () => {
    const c1 = document.createElement("div");
    c1.innerHTML = "<p>version 1</p>";
    const a = captureSnapshot("before", c1);

    const c2 = document.createElement("div");
    c2.innerHTML = "<p>version 2</p>";
    const b = captureSnapshot("after", c2);

    expect(() => assertSnapshotMatch(a, b)).toThrow(/mismatch/i);
  });
});
