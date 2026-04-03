/**
 * @vaisx/a11y — ARIA Pattern helpers tests
 *
 * Tests cover:
 *  - buttonPattern()   — WAI-ARIA Button pattern validation
 *  - inputPattern()    — WAI-ARIA Input pattern validation
 *  - modalPattern()    — WAI-ARIA Modal/Dialog pattern validation
 *  - dropdownPattern() — WAI-ARIA Combobox/Listbox pattern validation
 *  - applyPattern()    — Automatic attribute injection
 *  - validatePattern() — Delegating validator
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buttonPattern,
  inputPattern,
  modalPattern,
  dropdownPattern,
  applyPattern,
  validatePattern,
} from "../patterns.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a detached element from an HTML string. */
function el(html: string): Element {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild!;
}

/** Creates an element, appends it to document.body, and returns it. */
function attachEl(html: string): Element {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const elem = wrapper.firstElementChild!;
  document.body.appendChild(elem);
  return elem;
}

// ─── buttonPattern ────────────────────────────────────────────────────────────

describe("buttonPattern", () => {
  it("passes for a native <button> element", () => {
    const result = buttonPattern(el("<button>Click me</button>"));
    expect(result.pass).toBe(true);
    expect(result.pattern).toBe("button");
    expect(result.issues).toHaveLength(0);
  });

  it("passes for a <div> with role='button'", () => {
    const result = buttonPattern(el('<div role="button" tabindex="0">Click</div>'));
    expect(result.pass).toBe(true);
  });

  it("fails when a <div> acting as a button has no role", () => {
    const result = buttonPattern(el("<div>Click</div>"));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "role")).toBe(true);
  });

  it("passes a native <button> with aria-pressed='true' (toggle)", () => {
    const result = buttonPattern(el('<button aria-pressed="true">Bold</button>'));
    expect(result.pass).toBe(true);
  });

  it("passes a native <button> with aria-pressed='false'", () => {
    const result = buttonPattern(el('<button aria-pressed="false">Mute</button>'));
    expect(result.pass).toBe(true);
  });

  it("fails when aria-pressed has an invalid value", () => {
    const result = buttonPattern(el('<button aria-pressed="yes">Bad</button>'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-pressed")).toBe(true);
  });

  it("passes a native <button> with aria-expanded='false' (menu trigger)", () => {
    const result = buttonPattern(el('<button aria-expanded="false">Menu</button>'));
    expect(result.pass).toBe(true);
  });

  it("fails when aria-expanded has an invalid value", () => {
    const result = buttonPattern(el('<button aria-expanded="open">Menu</button>'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-expanded")).toBe(true);
  });

  it("passes a native <button> with aria-disabled='true'", () => {
    const result = buttonPattern(el('<button aria-disabled="true">Save</button>'));
    expect(result.pass).toBe(true);
  });

  it("fails when aria-disabled has an invalid value", () => {
    const result = buttonPattern(el('<button aria-disabled="disabled">Save</button>'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-disabled")).toBe(true);
  });

  it("passes a <button> with aria-pressed='mixed'", () => {
    const result = buttonPattern(el('<button aria-pressed="mixed">Indent</button>'));
    expect(result.pass).toBe(true);
  });
});

// ─── inputPattern ─────────────────────────────────────────────────────────────

describe("inputPattern", () => {
  beforeEach(() => {
    // Clean up any elements appended to body between tests.
    document.body.innerHTML = "";
  });

  it("passes for an <input> with aria-label", () => {
    const result = inputPattern(el('<input type="text" aria-label="Search" />'));
    expect(result.pass).toBe(true);
    expect(result.pattern).toBe("input");
  });

  it("passes for an <input> with aria-labelledby referencing an existing element", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label id="lbl">Name</label><input type="text" aria-labelledby="lbl" />';
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = inputPattern(input);
    expect(result.pass).toBe(true);
  });

  it("passes for an <input> associated to a <label> via 'for'", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label for="name">Name</label><input id="name" type="text" />';
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = inputPattern(input);
    expect(result.pass).toBe(true);
  });

  it("fails when no accessible label is present", () => {
    const result = inputPattern(el('<input type="text" />'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-label")).toBe(true);
  });

  it("passes when aria-required='true'", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-required="true" />')
    );
    expect(result.pass).toBe(true);
  });

  it("fails when aria-required has an invalid value", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-required="required" />')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-required")).toBe(true);
  });

  it("passes when aria-invalid='true'", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-invalid="true" />')
    );
    expect(result.pass).toBe(true);
  });

  it("fails when aria-invalid has an invalid value", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-invalid="bad" />')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-invalid")).toBe(true);
  });

  it("passes when aria-describedby references an existing element", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="text" aria-label="Email" aria-describedby="hint" /><span id="hint">Enter your email</span>';
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = inputPattern(input);
    expect(result.pass).toBe(true);
  });

  it("fails when aria-describedby references a non-existent element", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-describedby="nonexistent" />')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-describedby")).toBe(true);
  });

  it("passes when aria-errormessage references an existing element and aria-invalid='true'", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="text" aria-label="Email" aria-invalid="true" aria-errormessage="err" /><span id="err">Invalid email</span>';
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = inputPattern(input);
    expect(result.pass).toBe(true);
  });

  it("fails when aria-errormessage references a non-existent element", () => {
    const result = inputPattern(
      el('<input type="text" aria-label="Email" aria-invalid="true" aria-errormessage="ghost" />')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-errormessage")).toBe(true);
  });

  it("fails when aria-errormessage is set but aria-invalid is not 'true'", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="text" aria-label="Email" aria-errormessage="err" /><span id="err">Error</span>';
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = inputPattern(input);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-invalid")).toBe(true);
  });
});

// ─── modalPattern ─────────────────────────────────────────────────────────────

describe("modalPattern", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes for a fully correct dialog element", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">Confirm</h2>
        <button>OK</button>
      </div>`;
    document.body.appendChild(container);
    const dialog = container.querySelector('[role="dialog"]')!;
    const result = modalPattern(dialog);
    expect(result.pass).toBe(true);
    expect(result.pattern).toBe("modal");
  });

  it("passes for role='alertdialog'", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <h2 id="alert-title">Warning</h2>
        <button>Dismiss</button>
      </div>`;
    document.body.appendChild(container);
    const dialog = container.querySelector('[role="alertdialog"]')!;
    const result = modalPattern(dialog);
    expect(result.pass).toBe(true);
  });

  it("fails when role is missing", () => {
    const result = modalPattern(el('<div aria-modal="true" aria-labelledby="x"><button>OK</button></div>'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "role")).toBe(true);
  });

  it("fails when aria-modal is missing", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div role="dialog" aria-labelledby="t">
        <h2 id="t">Title</h2>
        <button>Close</button>
      </div>`;
    document.body.appendChild(container);
    const dialog = container.querySelector('[role="dialog"]')!;
    const result = modalPattern(dialog);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-modal")).toBe(true);
  });

  it("fails when aria-labelledby is missing", () => {
    const result = modalPattern(
      el('<div role="dialog" aria-modal="true"><button>Close</button></div>')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-labelledby")).toBe(true);
  });

  it("fails when aria-labelledby references a non-existent element", () => {
    const result = modalPattern(
      el('<div role="dialog" aria-modal="true" aria-labelledby="ghost"><button>Close</button></div>')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-labelledby")).toBe(true);
  });

  it("fails when no focusable element is present inside the modal", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="t2">
        <h2 id="t2">Title</h2>
        <p>Content only, no focusable elements.</p>
      </div>`;
    document.body.appendChild(container);
    const dialog = container.querySelector('[role="dialog"]')!;
    const result = modalPattern(dialog);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "focusable-content")).toBe(true);
  });
});

// ─── dropdownPattern ──────────────────────────────────────────────────────────

describe("dropdownPattern", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes for a fully correct combobox/listbox structure (collapsed)", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="false" aria-controls="lb1" />
      <ul id="lb1" role="listbox">
        <li role="option" aria-selected="false">Option A</li>
        <li role="option" aria-selected="false">Option B</li>
      </ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(true);
    expect(result.pattern).toBe("dropdown");
  });

  it("passes for an expanded combobox with a valid aria-activedescendant", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="true" aria-controls="lb2" aria-activedescendant="opt1" />
      <ul id="lb2" role="listbox">
        <li id="opt1" role="option" aria-selected="true">Option A</li>
        <li id="opt2" role="option" aria-selected="false">Option B</li>
      </ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(true);
  });

  it("fails when role='combobox' is missing on the trigger", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input aria-expanded="false" aria-controls="lb3" />
      <ul id="lb3" role="listbox"></ul>`;
    document.body.appendChild(container);
    const input = container.querySelector("input")!;
    const result = dropdownPattern(input);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "role")).toBe(true);
  });

  it("fails when aria-expanded is missing", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-controls="lb4" />
      <ul id="lb4" role="listbox"></ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-expanded")).toBe(true);
  });

  it("fails when aria-expanded has an invalid value", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="open" aria-controls="lb5" />
      <ul id="lb5" role="listbox"></ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-expanded")).toBe(true);
  });

  it("fails when aria-controls is missing", () => {
    const result = dropdownPattern(el('<input role="combobox" aria-expanded="false" />'));
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-controls")).toBe(true);
  });

  it("fails when aria-controls references a non-existent element", () => {
    const result = dropdownPattern(
      el('<input role="combobox" aria-expanded="false" aria-controls="ghost" />')
    );
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-controls")).toBe(true);
  });

  it("fails when the referenced element does not have role='listbox'", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="false" aria-controls="lb6" />
      <ul id="lb6" role="menu"></ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-controls")).toBe(true);
  });

  it("fails when aria-activedescendant references a non-existent option", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="true" aria-controls="lb7" aria-activedescendant="ghost-opt" />
      <ul id="lb7" role="listbox">
        <li id="real-opt" role="option" aria-selected="false">Option</li>
      </ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-activedescendant")).toBe(true);
  });

  it("fails when an option has an invalid aria-selected value", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <input role="combobox" aria-expanded="false" aria-controls="lb8" />
      <ul id="lb8" role="listbox">
        <li role="option" aria-selected="yes">Option</li>
      </ul>`;
    document.body.appendChild(container);
    const combobox = container.querySelector('[role="combobox"]')!;
    const result = dropdownPattern(combobox);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.attribute === "aria-selected")).toBe(true);
  });
});

// ─── applyPattern ─────────────────────────────────────────────────────────────

describe("applyPattern", () => {
  it("adds role='button' and tabindex='0' to a non-native button", () => {
    const div = el("<div>Click</div>");
    applyPattern(div, "button");
    expect(div.getAttribute("role")).toBe("button");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("does not overwrite an existing role on a custom button", () => {
    const div = el('<div role="button">Click</div>');
    applyPattern(div, "button");
    expect(div.getAttribute("role")).toBe("button");
  });

  it("does not add role or tabindex to a native <button>", () => {
    const btn = el("<button>Click</button>");
    applyPattern(btn, "button");
    expect(btn.getAttribute("role")).toBeNull();
    expect(btn.getAttribute("tabindex")).toBeNull();
  });

  it("adds role='dialog' and aria-modal='true' to a bare modal element", () => {
    const div = el("<div></div>");
    applyPattern(div, "modal");
    expect(div.getAttribute("role")).toBe("dialog");
    expect(div.getAttribute("aria-modal")).toBe("true");
  });

  it("does not overwrite existing role='alertdialog'", () => {
    const div = el('<div role="alertdialog"></div>');
    applyPattern(div, "modal");
    expect(div.getAttribute("role")).toBe("alertdialog");
  });

  it("adds role='combobox', aria-expanded='false', and aria-haspopup='listbox' to a bare dropdown", () => {
    const input = el("<input />");
    applyPattern(input, "dropdown");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("does not overwrite aria-expanded='true' on an open dropdown", () => {
    const input = el('<input role="combobox" aria-expanded="true" />');
    applyPattern(input, "dropdown");
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("adds an empty aria-label to an input without any label", () => {
    const input = el('<input type="text" />');
    applyPattern(input, "input");
    expect(input.hasAttribute("aria-label")).toBe(true);
  });

  it("does not overwrite an existing aria-label on an input", () => {
    const input = el('<input type="text" aria-label="Search" />');
    applyPattern(input, "input");
    expect(input.getAttribute("aria-label")).toBe("Search");
  });
});

// ─── validatePattern ──────────────────────────────────────────────────────────

describe("validatePattern", () => {
  it("delegates to buttonPattern and returns the correct pattern name", () => {
    const result = validatePattern(el("<button>OK</button>"), "button");
    expect(result.pattern).toBe("button");
    expect(result.pass).toBe(true);
  });

  it("delegates to inputPattern and returns the correct pattern name", () => {
    const result = validatePattern(el('<input aria-label="Name" />'), "input");
    expect(result.pattern).toBe("input");
    expect(result.pass).toBe(true);
  });

  it("delegates to modalPattern and returns the correct pattern name", () => {
    const result = validatePattern(
      el('<div role="dialog" aria-modal="true" aria-labelledby="x"><button>Close</button></div>'),
      "modal"
    );
    expect(result.pattern).toBe("modal");
    // labelledby references nonexistent element so pass is false — that is fine, pattern name check is the goal.
    expect(result.pattern).toBe("modal");
  });

  it("delegates to dropdownPattern and returns the correct pattern name", () => {
    const result = validatePattern(
      el('<input role="combobox" aria-expanded="false" />'),
      "dropdown"
    );
    expect(result.pattern).toBe("dropdown");
    expect(result.pass).toBe(false); // aria-controls is missing
  });

  it("returns PatternResult shape with pass, pattern, and issues fields", () => {
    const result = validatePattern(el("<div>No role</div>"), "button");
    expect(result).toHaveProperty("pass");
    expect(result).toHaveProperty("pattern");
    expect(result).toHaveProperty("issues");
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
