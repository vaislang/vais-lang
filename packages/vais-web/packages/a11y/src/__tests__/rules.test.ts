/**
 * @vaisx/a11y — Built-in rule tests
 */

import { describe, it, expect } from "vitest";
import { altTextRule } from "../rules/alt-text.js";
import { ariaAttrsRule } from "../rules/aria-attrs.js";
import { focusManagementRule } from "../rules/focus-management.js";
import { builtinRules } from "../rules/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeElement(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.firstElementChild!;
}

// ─── alt-text rule ────────────────────────────────────────────────────────────

describe("altTextRule (img-alt)", () => {
  it("passes non-img elements", () => {
    const el = makeElement("<div></div>");
    expect(altTextRule.check(el).pass).toBe(true);
  });

  it("fails when <img> has no alt attribute", () => {
    const el = makeElement("<img src='x.png'>");
    const result = altTextRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/alt/i);
    expect(result.suggestion).toBeDefined();
  });

  it("passes when <img> has a descriptive alt", () => {
    const el = makeElement("<img src='x.png' alt='A cat sitting on a mat'>");
    expect(altTextRule.check(el).pass).toBe(true);
  });

  it("passes when <img> has alt='' (decorative image)", () => {
    const el = makeElement("<img src='deco.png' alt=''>");
    expect(altTextRule.check(el).pass).toBe(true);
  });

  it("passes when <img> has role='presentation'", () => {
    const el = makeElement("<img src='x.png' role='presentation'>");
    expect(altTextRule.check(el).pass).toBe(true);
  });

  it("passes when <img> has role='none'", () => {
    const el = makeElement("<img src='x.png' role='none'>");
    expect(altTextRule.check(el).pass).toBe(true);
  });

  it("fails when alt is a generic value like 'image'", () => {
    const el = makeElement("<img src='x.png' alt='image'>");
    const result = altTextRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/generic/i);
  });

  it("has impact='critical'", () => {
    expect(altTextRule.impact).toBe("critical");
  });
});

// ─── aria-attrs rule ──────────────────────────────────────────────────────────

describe("ariaAttrsRule (aria-required-attr)", () => {
  it("passes an element with no aria attributes", () => {
    const el = makeElement("<div></div>");
    expect(ariaAttrsRule.check(el).pass).toBe(true);
  });

  it("passes an element with a valid aria attribute", () => {
    const el = makeElement("<div aria-label='main navigation'></div>");
    expect(ariaAttrsRule.check(el).pass).toBe(true);
  });

  it("fails when an invalid aria-* attribute is used", () => {
    const el = makeElement("<div aria-foobar='true'></div>");
    const result = ariaAttrsRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/aria-foobar/);
  });

  it("fails when aria-hidden='true' is on a focusable button", () => {
    const el = makeElement("<button aria-hidden='true'>Click</button>");
    const result = ariaAttrsRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/aria-hidden/i);
  });

  it("passes when aria-hidden='true' is on a non-focusable element", () => {
    const el = makeElement("<span aria-hidden='true'>decorative</span>");
    expect(ariaAttrsRule.check(el).pass).toBe(true);
  });

  it("fails when role='checkbox' is missing aria-checked", () => {
    const el = makeElement("<div role='checkbox'>Option</div>");
    const result = ariaAttrsRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/aria-checked/);
  });

  it("passes when role='checkbox' has aria-checked", () => {
    const el = makeElement("<div role='checkbox' aria-checked='false'>Option</div>");
    expect(ariaAttrsRule.check(el).pass).toBe(true);
  });

  it("fails when role='slider' is missing required attributes", () => {
    const el = makeElement("<div role='slider' aria-valuenow='5'></div>");
    const result = ariaAttrsRule.check(el);
    // Missing aria-valuemin and aria-valuemax.
    expect(result.pass).toBe(false);
  });

  it("has impact='critical'", () => {
    expect(ariaAttrsRule.impact).toBe("critical");
  });
});

// ─── focus-management rule ────────────────────────────────────────────────────

describe("focusManagementRule (focus-management)", () => {
  it("passes a regular button with no tabindex", () => {
    const el = makeElement("<button>Click me</button>");
    expect(focusManagementRule.check(el).pass).toBe(true);
  });

  it("fails when a positive tabindex is used", () => {
    const el = makeElement("<button tabindex='3'>Click</button>");
    const result = focusManagementRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/positive/i);
  });

  it("fails when a native interactive element has tabindex='-1' without aria-hidden or disabled", () => {
    const el = makeElement("<button tabindex='-1'>Skip</button>");
    const result = focusManagementRule.check(el);
    expect(result.pass).toBe(false);
  });

  it("passes when button with tabindex='-1' also has aria-hidden='true'", () => {
    const el = makeElement("<button tabindex='-1' aria-hidden='true'>Hidden</button>");
    expect(focusManagementRule.check(el).pass).toBe(true);
  });

  it("passes when button with tabindex='-1' is disabled", () => {
    const el = makeElement("<button tabindex='-1' disabled>Disabled</button>");
    expect(focusManagementRule.check(el).pass).toBe(true);
  });

  it("fails when a custom role='button' element has no tabindex", () => {
    const el = makeElement("<div role='button'>Custom button</div>");
    const result = focusManagementRule.check(el);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/tabindex/i);
  });

  it("passes when role='button' element has tabindex='0'", () => {
    const el = makeElement("<div role='button' tabindex='0'>Custom button</div>");
    expect(focusManagementRule.check(el).pass).toBe(true);
  });

  it("passes a plain div with no interactive role", () => {
    const el = makeElement("<div>Just a container</div>");
    expect(focusManagementRule.check(el).pass).toBe(true);
  });

  it("has impact='serious'", () => {
    expect(focusManagementRule.impact).toBe("serious");
  });
});

// ─── builtinRules registry ────────────────────────────────────────────────────

describe("builtinRules", () => {
  it("exports exactly 3 built-in rules", () => {
    expect(builtinRules).toHaveLength(3);
  });

  it("includes img-alt, aria-required-attr, and focus-management", () => {
    const ids = builtinRules.map((r) => r.id);
    expect(ids).toContain("img-alt");
    expect(ids).toContain("aria-required-attr");
    expect(ids).toContain("focus-management");
  });

  it("every rule has a non-empty description", () => {
    for (const rule of builtinRules) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });

  it("every rule has a valid impact level", () => {
    const validLevels = new Set(["critical", "serious", "moderate", "minor"]);
    for (const rule of builtinRules) {
      expect(validLevels.has(rule.impact)).toBe(true);
    }
  });
});
