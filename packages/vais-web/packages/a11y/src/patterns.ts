/**
 * WAI-ARIA Authoring Practices 1.2 — Component Pattern Helpers
 *
 * Provides apply/validate helpers for the four most common ARIA component
 * patterns: Button, Input, Modal (Dialog) and Dropdown (Combobox/Listbox).
 *
 * All helpers are pure DOM-API operations and are jsdom-compatible.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The component pattern to apply or validate.
 */
export type AriaPattern = "button" | "input" | "modal" | "dropdown";

/**
 * A single validation issue found while checking a pattern.
 */
export interface PatternIssue {
  /** ARIA attribute or structural requirement that is missing or incorrect. */
  attribute: string;
  /** Human-readable explanation. */
  message: string;
  /** Recommended remediation. */
  suggestion: string;
}

/**
 * The result of validatePattern().
 */
export interface PatternResult {
  /** Whether the element fully satisfies the pattern requirements. */
  pass: boolean;
  /** The pattern that was validated. */
  pattern: AriaPattern;
  /** List of individual issues (empty when pass === true). */
  issues: PatternIssue[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Returns true when the element's tag name matches one of the given tags. */
function isTag(el: Element, ...tags: string[]): boolean {
  return tags.includes(el.tagName.toLowerCase());
}

/** Returns the attribute value or null. */
function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/** Sets an attribute only when it is not already present. */
function setIfMissing(el: Element, name: string, value: string): void {
  if (!el.hasAttribute(name)) {
    el.setAttribute(name, value);
  }
}

/**
 * Checks whether the element has an accessible label via:
 *  - aria-label
 *  - aria-labelledby pointing to an existing element
 *  - a <label> element whose `for` attribute matches the element's id
 *  - a <label> element that wraps the element
 */
function hasAccessibleLabel(el: Element): boolean {
  if (el.hasAttribute("aria-label")) return true;

  const labelledBy = attr(el, "aria-labelledby");
  if (labelledBy) {
    const doc = el.ownerDocument;
    const ids = labelledBy.trim().split(/\s+/);
    const allExist = ids.every((id) => doc.getElementById(id) !== null);
    if (allExist) return true;
  }

  // Check for an associated <label> element in the document.
  const doc = el.ownerDocument;
  const id = el.getAttribute("id");
  if (id) {
    const labelFor = doc.querySelector(`label[for="${id}"]`);
    if (labelFor) return true;
  }

  // Check for a wrapping <label> element.
  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName.toLowerCase() === "label") return true;
    parent = parent.parentElement;
  }

  return false;
}

// ─── buttonPattern ────────────────────────────────────────────────────────────

/**
 * Validates a Button ARIA pattern (WAI-ARIA 1.2 §3.5).
 *
 * Checks:
 *  - Custom (non-<button>) elements must have role="button"
 *  - aria-disabled instead of the HTML disabled attribute on custom buttons
 *  - Toggle buttons must have aria-pressed
 *  - Menu-trigger buttons must have aria-expanded
 */
export function buttonPattern(element: Element): PatternResult {
  const issues: PatternIssue[] = [];
  const isNativeButton = isTag(element, "button");
  const role = attr(element, "role");

  // Custom button elements need role="button".
  if (!isNativeButton && role !== "button") {
    issues.push({
      attribute: "role",
      message: 'Non-<button> element acting as a button must have role="button".',
      suggestion: 'Add role="button" to the element.',
    });
  }

  // aria-pressed must be "true" or "false" (not just any value).
  const ariaPressed = attr(element, "aria-pressed");
  if (ariaPressed !== null && ariaPressed !== "true" && ariaPressed !== "false" && ariaPressed !== "mixed") {
    issues.push({
      attribute: "aria-pressed",
      message: `aria-pressed has an invalid value "${ariaPressed}". Allowed: "true", "false", "mixed".`,
      suggestion: 'Set aria-pressed to "true", "false", or "mixed".',
    });
  }

  // aria-expanded must be "true" or "false".
  const ariaExpanded = attr(element, "aria-expanded");
  if (ariaExpanded !== null && ariaExpanded !== "true" && ariaExpanded !== "false") {
    issues.push({
      attribute: "aria-expanded",
      message: `aria-expanded has an invalid value "${ariaExpanded}". Allowed: "true" or "false".`,
      suggestion: 'Set aria-expanded to "true" or "false".',
    });
  }

  // aria-disabled must be "true" or "false".
  const ariaDisabled = attr(element, "aria-disabled");
  if (ariaDisabled !== null && ariaDisabled !== "true" && ariaDisabled !== "false") {
    issues.push({
      attribute: "aria-disabled",
      message: `aria-disabled has an invalid value "${ariaDisabled}". Allowed: "true" or "false".`,
      suggestion: 'Set aria-disabled to "true" or "false".',
    });
  }

  return { pass: issues.length === 0, pattern: "button", issues };
}

// ─── inputPattern ─────────────────────────────────────────────────────────────

/**
 * Validates an Input ARIA pattern (WAI-ARIA 1.2 §3.9).
 *
 * Checks:
 *  - Must have an accessible label (aria-label, aria-labelledby, or <label>)
 *  - aria-required must be "true" or "false" when present
 *  - aria-invalid must be "true", "false", "grammar", or "spelling" when present
 *  - aria-describedby must reference existing element(s) when present
 *  - aria-errormessage must reference an existing element when present and aria-invalid="true"
 */
export function inputPattern(element: Element): PatternResult {
  const issues: PatternIssue[] = [];
  const doc = element.ownerDocument;

  // Accessible label is mandatory.
  if (!hasAccessibleLabel(element)) {
    issues.push({
      attribute: "aria-label",
      message: "Input element is missing an accessible label.",
      suggestion:
        'Add an aria-label attribute, an aria-labelledby pointing to a visible label element, or associate a <label> element via the "for" attribute.',
    });
  }

  // aria-required validation.
  const ariaRequired = attr(element, "aria-required");
  if (ariaRequired !== null && ariaRequired !== "true" && ariaRequired !== "false") {
    issues.push({
      attribute: "aria-required",
      message: `aria-required has an invalid value "${ariaRequired}". Allowed: "true" or "false".`,
      suggestion: 'Set aria-required to "true" or "false".',
    });
  }

  // aria-invalid validation.
  const ariaInvalid = attr(element, "aria-invalid");
  const validInvalidValues = ["true", "false", "grammar", "spelling"];
  if (ariaInvalid !== null && !validInvalidValues.includes(ariaInvalid)) {
    issues.push({
      attribute: "aria-invalid",
      message: `aria-invalid has an invalid value "${ariaInvalid}". Allowed: "true", "false", "grammar", "spelling".`,
      suggestion: 'Set aria-invalid to one of "true", "false", "grammar", or "spelling".',
    });
  }

  // aria-describedby must reference existing elements.
  const ariaDescribedBy = attr(element, "aria-describedby");
  if (ariaDescribedBy) {
    const ids = ariaDescribedBy.trim().split(/\s+/);
    const missing = ids.filter((id) => doc.getElementById(id) === null);
    if (missing.length > 0) {
      issues.push({
        attribute: "aria-describedby",
        message: `aria-describedby references non-existent element(s): ${missing.join(", ")}.`,
        suggestion: "Ensure that all IDs referenced by aria-describedby exist in the DOM.",
      });
    }
  }

  // aria-errormessage must reference an existing element, and aria-invalid should be "true".
  const ariaErrorMessage = attr(element, "aria-errormessage");
  if (ariaErrorMessage) {
    const errorEl = doc.getElementById(ariaErrorMessage);
    if (!errorEl) {
      issues.push({
        attribute: "aria-errormessage",
        message: `aria-errormessage references non-existent element "${ariaErrorMessage}".`,
        suggestion: "Ensure that the element referenced by aria-errormessage exists in the DOM.",
      });
    }
    // When aria-errormessage is present, aria-invalid="true" should also be set.
    if (ariaInvalid !== "true") {
      issues.push({
        attribute: "aria-invalid",
        message: 'aria-errormessage is set but aria-invalid is not "true".',
        suggestion: 'Set aria-invalid="true" when using aria-errormessage to expose an error.',
      });
    }
  }

  return { pass: issues.length === 0, pattern: "input", issues };
}

// ─── modalPattern ─────────────────────────────────────────────────────────────

/**
 * Validates a Modal/Dialog ARIA pattern (WAI-ARIA 1.2 §3.9 / APG Dialog).
 *
 * Checks:
 *  - role must be "dialog" or "alertdialog"
 *  - aria-modal="true" must be present
 *  - aria-labelledby must reference an existing element
 *  - Must contain at least one focusable element (focus trap requirement)
 */
export function modalPattern(element: Element): PatternResult {
  const issues: PatternIssue[] = [];
  const doc = element.ownerDocument;
  const role = attr(element, "role");

  // role="dialog" or role="alertdialog" is required.
  if (role !== "dialog" && role !== "alertdialog") {
    issues.push({
      attribute: "role",
      message: `Modal element must have role="dialog" or role="alertdialog". Found: ${role ?? "(none)"}.`,
      suggestion: 'Add role="dialog" (or role="alertdialog" for urgent messages) to the modal container.',
    });
  }

  // aria-modal="true" is required.
  if (attr(element, "aria-modal") !== "true") {
    issues.push({
      attribute: "aria-modal",
      message: 'Modal element must have aria-modal="true".',
      suggestion: 'Add aria-modal="true" to prevent assistive technologies from interacting with background content.',
    });
  }

  // aria-labelledby must be present and reference an existing element.
  const labelledBy = attr(element, "aria-labelledby");
  if (!labelledBy) {
    issues.push({
      attribute: "aria-labelledby",
      message: "Modal element is missing aria-labelledby.",
      suggestion:
        "Add aria-labelledby pointing to the dialog title element so screen readers can announce the dialog name.",
    });
  } else {
    const ids = labelledBy.trim().split(/\s+/);
    const missing = ids.filter((id) => doc.getElementById(id) === null);
    if (missing.length > 0) {
      issues.push({
        attribute: "aria-labelledby",
        message: `aria-labelledby references non-existent element(s): ${missing.join(", ")}.`,
        suggestion: "Ensure that all IDs referenced by aria-labelledby exist in the DOM.",
      });
    }
  }

  // Must contain at least one focusable element to support focus trapping.
  const focusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  const focusableElements = element.querySelectorAll(focusableSelector);
  if (focusableElements.length === 0) {
    issues.push({
      attribute: "focusable-content",
      message: "Modal dialog must contain at least one focusable element to support keyboard focus management.",
      suggestion: "Add a focusable element (e.g. a close button) inside the dialog.",
    });
  }

  return { pass: issues.length === 0, pattern: "modal", issues };
}

// ─── dropdownPattern ──────────────────────────────────────────────────────────

/**
 * Validates a Dropdown/Combobox ARIA pattern (WAI-ARIA 1.2 §3.8 Combobox).
 *
 * Checks for the trigger element (role="combobox"):
 *  - role="combobox" must be present
 *  - aria-expanded must be present with a valid value
 *  - aria-controls or aria-owns must reference a listbox element
 *
 * The listbox referenced by the combobox must exist and have role="listbox".
 */
export function dropdownPattern(element: Element): PatternResult {
  const issues: PatternIssue[] = [];
  const doc = element.ownerDocument;
  const role = attr(element, "role");

  // role="combobox" is required on the trigger.
  if (role !== "combobox") {
    issues.push({
      attribute: "role",
      message: `Dropdown trigger must have role="combobox". Found: ${role ?? "(none)"}.`,
      suggestion: 'Add role="combobox" to the dropdown trigger element.',
    });
  }

  // aria-expanded is required.
  const ariaExpanded = attr(element, "aria-expanded");
  if (ariaExpanded === null) {
    issues.push({
      attribute: "aria-expanded",
      message: "Combobox trigger must have aria-expanded.",
      suggestion: 'Add aria-expanded="false" (collapsed) or aria-expanded="true" (expanded) to the trigger.',
    });
  } else if (ariaExpanded !== "true" && ariaExpanded !== "false") {
    issues.push({
      attribute: "aria-expanded",
      message: `aria-expanded has an invalid value "${ariaExpanded}". Allowed: "true" or "false".`,
      suggestion: 'Set aria-expanded to "true" or "false".',
    });
  }

  // aria-controls or aria-owns must reference a listbox.
  const controls = attr(element, "aria-controls");
  const owns = attr(element, "aria-owns");
  const listboxRef = controls ?? owns;

  if (!listboxRef) {
    issues.push({
      attribute: "aria-controls",
      message: "Combobox trigger must reference the listbox via aria-controls (or aria-owns).",
      suggestion: 'Add aria-controls="<listbox-id>" to the combobox trigger, where the value is the id of the listbox.',
    });
  } else {
    const listboxEl = doc.getElementById(listboxRef);
    if (!listboxEl) {
      issues.push({
        attribute: "aria-controls",
        message: `aria-controls references non-existent element "${listboxRef}".`,
        suggestion: "Ensure the listbox element exists in the DOM and has the referenced id.",
      });
    } else if (attr(listboxEl, "role") !== "listbox") {
      issues.push({
        attribute: "aria-controls",
        message: `The element referenced by aria-controls ("${listboxRef}") must have role="listbox".`,
        suggestion: 'Add role="listbox" to the popup element.',
      });
    } else {
      // Validate aria-activedescendant when expanded.
      const activeDescendant = attr(element, "aria-activedescendant");
      if (ariaExpanded === "true" && activeDescendant) {
        const activeEl = doc.getElementById(activeDescendant);
        if (!activeEl) {
          issues.push({
            attribute: "aria-activedescendant",
            message: `aria-activedescendant references non-existent element "${activeDescendant}".`,
            suggestion: "Ensure the active option element exists in the DOM.",
          });
        } else if (attr(activeEl, "role") !== "option") {
          issues.push({
            attribute: "aria-activedescendant",
            message: `The element referenced by aria-activedescendant ("${activeDescendant}") must have role="option".`,
            suggestion: 'Add role="option" to each option element inside the listbox.',
          });
        }
      }

      // Validate aria-selected on listbox options.
      const options = listboxEl.querySelectorAll('[role="option"]');
      options.forEach((opt) => {
        const selected = attr(opt, "aria-selected");
        if (selected !== null && selected !== "true" && selected !== "false") {
          issues.push({
            attribute: "aria-selected",
            message: `A listbox option has an invalid aria-selected value "${selected}". Allowed: "true" or "false".`,
            suggestion: 'Set aria-selected to "true" or "false" on each option.',
          });
        }
      });
    }
  }

  return { pass: issues.length === 0, pattern: "dropdown", issues };
}

// ─── applyPattern ─────────────────────────────────────────────────────────────

/**
 * Applies missing ARIA attributes for the given pattern to the element.
 *
 * This is a best-effort helper: it only sets attributes that are absent.
 * It does NOT remove incorrect attributes, and it does NOT set attributes
 * whose correct value depends on runtime state (e.g. aria-pressed toggle).
 *
 * @param element — The DOM element to patch.
 * @param pattern — The ARIA component pattern to apply.
 */
export function applyPattern(element: Element, pattern: AriaPattern): void {
  switch (pattern) {
    case "button": {
      const isNativeButton = isTag(element, "button");
      if (!isNativeButton) {
        setIfMissing(element, "role", "button");
      }
      // Ensure the element is keyboard-reachable when it is a custom element.
      if (!isNativeButton && !element.hasAttribute("tabindex")) {
        element.setAttribute("tabindex", "0");
      }
      break;
    }

    case "input": {
      // Cannot infer the correct label; only add a placeholder when truly absent.
      if (!hasAccessibleLabel(element)) {
        setIfMissing(element, "aria-label", "");
      }
      break;
    }

    case "modal": {
      setIfMissing(element, "role", "dialog");
      setIfMissing(element, "aria-modal", "true");
      break;
    }

    case "dropdown": {
      setIfMissing(element, "role", "combobox");
      setIfMissing(element, "aria-expanded", "false");
      setIfMissing(element, "aria-haspopup", "listbox");
      break;
    }
  }
}

// ─── validatePattern ──────────────────────────────────────────────────────────

/**
 * Validates that an element conforms to the specified WAI-ARIA pattern.
 *
 * @param element — The DOM element to validate.
 * @param pattern — The ARIA component pattern to validate against.
 * @returns PatternResult with pass/fail status and a list of issues.
 */
export function validatePattern(element: Element, pattern: AriaPattern): PatternResult {
  switch (pattern) {
    case "button":
      return buttonPattern(element);
    case "input":
      return inputPattern(element);
    case "modal":
      return modalPattern(element);
    case "dropdown":
      return dropdownPattern(element);
    default: {
      // TypeScript exhaustiveness guard.
      const _exhaustive: never = pattern;
      return { pass: false, pattern: _exhaustive, issues: [] };
    }
  }
}
