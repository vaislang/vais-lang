/**
 * Tests for A11yLinter — compile-time accessibility linter.
 *
 * Coverage: 7 rules × pass + fail cases, compound sources, severity override,
 * line/column accuracy.  (≥ 25 tests)
 */

import { describe, it, expect } from "vitest";
import { A11yLinter } from "../lint.js";
import type { LintDiagnostic } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lint(source: string, filename = "test.html"): LintDiagnostic[] {
  return new A11yLinter().lint(source, filename);
}

function byRule(diags: LintDiagnostic[], ruleId: string): LintDiagnostic[] {
  return diags.filter((d) => d.ruleId === ruleId);
}

// ─── img-alt ─────────────────────────────────────────────────────────────────

describe("img-alt", () => {
  it("passes when alt attribute is present", () => {
    const diags = lint('<img src="photo.jpg" alt="A scenic view">');
    expect(byRule(diags, "img-alt")).toHaveLength(0);
  });

  it("passes when alt is empty string (decorative image)", () => {
    const diags = lint('<img src="deco.png" alt="">');
    expect(byRule(diags, "img-alt")).toHaveLength(0);
  });

  it("reports error when alt is missing", () => {
    const diags = lint('<img src="photo.jpg">');
    const d = byRule(diags, "img-alt");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("error");
    expect(d[0].message).toMatch(/alt/i);
  });

  it("reports one error per img missing alt", () => {
    const diags = lint('<img src="a.jpg"><img src="b.jpg" alt="ok"><img src="c.jpg">');
    expect(byRule(diags, "img-alt")).toHaveLength(2);
  });

  it("reports correct line/column for img-alt violation", () => {
    const source = `<div>\n  <img src="x.jpg">\n</div>`;
    const diags = lint(source);
    const d = byRule(diags, "img-alt")[0];
    expect(d).toBeDefined();
    expect(d.line).toBe(2);
    expect(d.column).toBeGreaterThan(0);
  });
});

// ─── aria-role ───────────────────────────────────────────────────────────────

describe("aria-role", () => {
  it("passes for valid WAI-ARIA role 'button'", () => {
    const diags = lint('<div role="button">Click me</div>');
    expect(byRule(diags, "aria-role")).toHaveLength(0);
  });

  it("passes for valid role 'navigation'", () => {
    const diags = lint('<nav role="navigation">menu</nav>');
    expect(byRule(diags, "aria-role")).toHaveLength(0);
  });

  it("reports error for unknown role", () => {
    const diags = lint('<div role="foobar">text</div>');
    const d = byRule(diags, "aria-role");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("error");
    expect(d[0].message).toMatch(/foobar/);
  });

  it("reports error for each invalid role in space-separated list", () => {
    const diags = lint('<div role="button invalid-role">text</div>');
    const d = byRule(diags, "aria-role");
    expect(d).toHaveLength(1);
    expect(d[0].message).toMatch(/invalid-role/);
  });

  it("passes when element has no role attribute", () => {
    const diags = lint('<div class="container">content</div>');
    expect(byRule(diags, "aria-role")).toHaveLength(0);
  });
});

// ─── aria-props ───────────────────────────────────────────────────────────────

describe("aria-props", () => {
  it("passes for valid aria-label", () => {
    const diags = lint('<button aria-label="Close dialog" type="button">X</button>');
    expect(byRule(diags, "aria-props")).toHaveLength(0);
  });

  it("passes for valid aria-hidden", () => {
    const diags = lint('<span aria-hidden="true">★</span>');
    expect(byRule(diags, "aria-props")).toHaveLength(0);
  });

  it("reports error for invalid aria-* attribute", () => {
    const diags = lint('<div aria-foobar="true">text</div>');
    const d = byRule(diags, "aria-props");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("error");
    expect(d[0].message).toMatch(/aria-foobar/);
  });

  it("reports multiple invalid aria-* attributes on same element", () => {
    const diags = lint('<div aria-invalid-one="x" aria-invalid-two="y">text</div>');
    const d = byRule(diags, "aria-props");
    expect(d).toHaveLength(2);
  });

  it("passes when no aria-* attributes are present", () => {
    const diags = lint('<p class="note">text</p>');
    expect(byRule(diags, "aria-props")).toHaveLength(0);
  });
});

// ─── button-type ─────────────────────────────────────────────────────────────

describe("button-type", () => {
  it("passes when type='button' is present", () => {
    const diags = lint('<button type="button">Click</button>');
    expect(byRule(diags, "button-type")).toHaveLength(0);
  });

  it("passes when type='submit' is present", () => {
    const diags = lint('<button type="submit">Submit</button>');
    expect(byRule(diags, "button-type")).toHaveLength(0);
  });

  it("reports warning when type is missing", () => {
    const diags = lint("<button>Click me</button>");
    const d = byRule(diags, "button-type");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("warning");
    expect(d[0].message).toMatch(/type/i);
  });

  it("reports warning for each button missing type", () => {
    const diags = lint('<button>A</button><button type="button">B</button><button>C</button>');
    expect(byRule(diags, "button-type")).toHaveLength(2);
  });
});

// ─── label-for ───────────────────────────────────────────────────────────────

describe("label-for", () => {
  it("passes when input has a matching label[for]", () => {
    const diags = lint('<label for="name">Name</label><input id="name" type="text">');
    expect(byRule(diags, "label-for")).toHaveLength(0);
  });

  it("passes when input has aria-label", () => {
    const diags = lint('<input type="text" aria-label="Search">');
    expect(byRule(diags, "label-for")).toHaveLength(0);
  });

  it("passes when input has aria-labelledby", () => {
    const diags = lint('<span id="lbl">Name</span><input type="text" aria-labelledby="lbl">');
    expect(byRule(diags, "label-for")).toHaveLength(0);
  });

  it("passes for input[type=hidden]", () => {
    const diags = lint('<input type="hidden" name="csrf">');
    expect(byRule(diags, "label-for")).toHaveLength(0);
  });

  it("reports warning when input has no label association", () => {
    const diags = lint('<input type="text">');
    const d = byRule(diags, "label-for");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("warning");
  });

  it("reports warning when input id does not match any label[for]", () => {
    const diags = lint('<label for="other">Other</label><input id="name" type="text">');
    expect(byRule(diags, "label-for")).toHaveLength(1);
  });
});

// ─── heading-order ───────────────────────────────────────────────────────────

describe("heading-order", () => {
  it("passes for sequential headings h1 → h2 → h3", () => {
    const diags = lint("<h1>Title</h1><h2>Sub</h2><h3>Sub-sub</h3>");
    expect(byRule(diags, "heading-order")).toHaveLength(0);
  });

  it("passes for headings that go back to lower level (h3 → h2 is allowed)", () => {
    const diags = lint("<h1>Title</h1><h2>A</h2><h3>B</h3><h2>C</h2>");
    expect(byRule(diags, "heading-order")).toHaveLength(0);
  });

  it("reports warning for h1 → h3 skip", () => {
    const diags = lint("<h1>Title</h1><h3>Section</h3>");
    const d = byRule(diags, "heading-order");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("warning");
    expect(d[0].message).toMatch(/h1.*h3/);
  });

  it("reports warning for h2 → h4 skip", () => {
    const diags = lint("<h1>A</h1><h2>B</h2><h4>D</h4>");
    const d = byRule(diags, "heading-order");
    expect(d).toHaveLength(1);
    expect(d[0].message).toMatch(/h2.*h4/);
  });

  it("passes when there is only one heading", () => {
    const diags = lint("<h1>Only heading</h1>");
    expect(byRule(diags, "heading-order")).toHaveLength(0);
  });
});

// ─── tabindex-positive ───────────────────────────────────────────────────────

describe("tabindex-positive", () => {
  it("passes for tabindex='0'", () => {
    const diags = lint('<div tabindex="0">focusable</div>');
    expect(byRule(diags, "tabindex-positive")).toHaveLength(0);
  });

  it("passes for tabindex='-1'", () => {
    const diags = lint('<div tabindex="-1">programmatic focus</div>');
    expect(byRule(diags, "tabindex-positive")).toHaveLength(0);
  });

  it("reports warning for tabindex='1'", () => {
    const diags = lint('<div tabindex="1">bad</div>');
    const d = byRule(diags, "tabindex-positive");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("warning");
    expect(d[0].message).toMatch(/tabindex/i);
  });

  it("reports warning for tabindex='5'", () => {
    const diags = lint('<a href="#" tabindex="5">link</a>');
    expect(byRule(diags, "tabindex-positive")).toHaveLength(1);
  });

  it("passes when no tabindex attribute is present", () => {
    const diags = lint('<button type="button">click</button>');
    expect(byRule(diags, "tabindex-positive")).toHaveLength(0);
  });
});

// ─── Severity Override ────────────────────────────────────────────────────────

describe("severity override", () => {
  it("overrides img-alt from error to warning", () => {
    const linter = new A11yLinter({ rules: { "img-alt": "warning" } });
    const diags = linter.lint('<img src="x.jpg">', "test.html");
    const d = diags.filter((x) => x.ruleId === "img-alt");
    expect(d[0].severity).toBe("warning");
  });

  it("overrides button-type from warning to error", () => {
    const linter = new A11yLinter({ rules: { "button-type": "error" } });
    const diags = linter.lint("<button>Click</button>", "test.html");
    const d = diags.filter((x) => x.ruleId === "button-type");
    expect(d[0].severity).toBe("error");
  });

  it("overrides aria-role from error to info", () => {
    const linter = new A11yLinter({ rules: { "aria-role": "info" } });
    const diags = linter.lint('<div role="fake">x</div>', "test.html");
    const d = diags.filter((x) => x.ruleId === "aria-role");
    expect(d[0].severity).toBe("info");
  });
});

// ─── Compound Source ──────────────────────────────────────────────────────────

describe("compound source", () => {
  it("detects multiple different violations in one source", () => {
    const source = `
      <h1>Page Title</h1>
      <img src="photo.jpg">
      <button>Submit</button>
      <div role="invalid-role">content</div>
      <input type="text">
      <h3>Skipped heading</h3>
      <div tabindex="3">bad tabindex</div>
    `;
    const diags = new A11yLinter().lint(source, "page.html");

    expect(byRule(diags, "img-alt")).toHaveLength(1);
    expect(byRule(diags, "button-type")).toHaveLength(1);
    expect(byRule(diags, "aria-role")).toHaveLength(1);
    expect(byRule(diags, "label-for")).toHaveLength(1);
    expect(byRule(diags, "heading-order")).toHaveLength(1);
    expect(byRule(diags, "tabindex-positive")).toHaveLength(1);
    expect(diags.length).toBeGreaterThanOrEqual(6);
  });

  it("uses config filename when lint() called without filename argument", () => {
    const linter = new A11yLinter({ filename: "default.vaisx" });
    const diags = linter.lint('<img src="x.jpg">');
    expect(diags[0].file).toBe("default.vaisx");
  });

  it("falls back to <unknown> filename when neither lint() arg nor config filename given", () => {
    const linter = new A11yLinter();
    const diags = linter.lint('<img src="x.jpg">');
    expect(diags[0].file).toBe("<unknown>");
  });

  it("ignores tags inside HTML comments", () => {
    const source = "<!-- <img src='hidden.jpg'> -->";
    const diags = lint(source);
    expect(byRule(diags, "img-alt")).toHaveLength(0);
  });

  it("returns empty array for clean source", () => {
    const source = `
      <h1>Title</h1>
      <h2>Section</h2>
      <label for="name">Name</label>
      <input id="name" type="text">
      <img src="pic.jpg" alt="A picture">
      <button type="button">OK</button>
      <div tabindex="0">focusable</div>
    `;
    const diags = lint(source);
    expect(diags).toHaveLength(0);
  });
});
