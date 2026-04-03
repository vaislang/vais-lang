/**
 * @vaisx/a11y — Testing utilities
 *
 * @testing-library/dom-style a11y query helpers for use with jsdom-based
 * test environments (Vitest, Jest, etc.).
 *
 * Zero runtime dependencies; DOM API only.
 */

// ─── WAI-ARIA role mapping ─────────────────────────────────────────────────────

/**
 * Maps implicit ARIA roles to matching CSS selectors.
 * Covers the most common landmark and widget roles.
 */
const IMPLICIT_ROLE_SELECTORS: Record<string, string[]> = {
  button: ["button", "[role='button']", "input[type='button']", "input[type='submit']", "input[type='reset']"],
  link: ["a[href]", "[role='link']"],
  heading: ["h1", "h2", "h3", "h4", "h5", "h6", "[role='heading']"],
  textbox: ["input:not([type])", "input[type='text']", "input[type='email']", "input[type='search']", "input[type='url']", "input[type='tel']", "textarea", "[role='textbox']"],
  checkbox: ["input[type='checkbox']", "[role='checkbox']"],
  radio: ["input[type='radio']", "[role='radio']"],
  combobox: ["select", "[role='combobox']"],
  listbox: ["select[multiple]", "[role='listbox']"],
  option: ["option", "[role='option']"],
  img: ["img", "[role='img']"],
  list: ["ul", "ol", "[role='list']"],
  listitem: ["li", "[role='listitem']"],
  navigation: ["nav", "[role='navigation']"],
  main: ["main", "[role='main']"],
  banner: ["header", "[role='banner']"],
  contentinfo: ["footer", "[role='contentinfo']"],
  complementary: ["aside", "[role='complementary']"],
  region: ["section[aria-label]", "section[aria-labelledby]", "[role='region']"],
  form: ["form[aria-label]", "form[aria-labelledby]", "[role='form']"],
  search: ["[role='search']"],
  dialog: ["dialog", "[role='dialog']"],
  alertdialog: ["[role='alertdialog']"],
  alert: ["[role='alert']"],
  status: ["[role='status']"],
  tab: ["[role='tab']"],
  tablist: ["[role='tablist']"],
  tabpanel: ["[role='tabpanel']"],
  menuitem: ["[role='menuitem']"],
  menu: ["[role='menu']"],
  menubar: ["[role='menubar']"],
  tree: ["[role='tree']"],
  treeitem: ["[role='treeitem']"],
  grid: ["[role='grid']"],
  gridcell: ["[role='gridcell']"],
  row: ["tr", "[role='row']"],
  rowgroup: ["thead", "tbody", "tfoot", "[role='rowgroup']"],
  columnheader: ["th[scope='col']", "[role='columnheader']"],
  rowheader: ["th[scope='row']", "[role='rowheader']"],
  cell: ["td", "[role='cell']"],
  table: ["table", "[role='table']"],
  progressbar: ["progress", "[role='progressbar']"],
  spinbutton: ["input[type='number']", "[role='spinbutton']"],
  slider: ["input[type='range']", "[role='slider']"],
  separator: ["hr", "[role='separator']"],
  article: ["article", "[role='article']"],
  definition: ["dfn", "[role='definition']"],
  term: ["[role='term']"],
  group: ["[role='group']", "fieldset"],
  presentation: ["[role='presentation']", "[role='none']"],
};

/**
 * Required ARIA attributes per role — used by toBeAccessible.
 */
const REQUIRED_ARIA_BY_ROLE: Record<string, string[]> = {
  checkbox: ["aria-checked"],
  radio: ["aria-checked"],
  slider: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  spinbutton: ["aria-valuenow"],
  scrollbar: ["aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-orientation", "aria-controls"],
  separator: [],
  combobox: ["aria-expanded"],
  option: ["aria-selected"],
};

/**
 * Interactive roles/tags that must have an accessible name.
 */
const INTERACTIVE_ROLES = new Set([
  "button", "link", "tab", "menuitem", "checkbox", "radio",
  "combobox", "listbox", "slider", "spinbutton", "textbox", "searchbox",
]);

const INTERACTIVE_TAGS = new Set([
  "button", "a", "input", "select", "textarea",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ByRoleOptions {
  /** Filter by accessible name (aria-label, aria-labelledby text, or inner text). */
  name?: string | RegExp;
  /** Filter by aria-selected state. */
  selected?: boolean;
  /** Filter by aria-checked state. */
  checked?: boolean;
  /** Filter by aria-pressed state. */
  pressed?: boolean | "mixed";
  /** Filter by aria-expanded state. */
  expanded?: boolean;
  /** Filter by aria-level (heading level). */
  level?: number;
  /** Filter by aria-hidden — default excludes hidden elements. */
  hidden?: boolean;
}

export interface AccessibleMatchResult {
  pass: boolean;
  message: () => string;
}

// ─── Accessible name resolution ───────────────────────────────────────────────

/**
 * Computes the accessible name for an element using a simplified
 * accName algorithm: aria-labelledby > aria-label > label > placeholder/title > text content.
 */
function getAccessibleName(element: Element, container?: Element | Document): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = container ?? (element.ownerDocument ?? document);
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => {
        const ref = (root instanceof Document ? root : root.ownerDocument ?? document).getElementById(id);
        return ref?.textContent?.trim() ?? "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // Input: check for associated <label>
  if (element instanceof HTMLElement && "id" in element && element.id) {
    const root = container instanceof Document
      ? container
      : container?.ownerDocument ?? element.ownerDocument ?? document;
    const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.textContent?.trim() ?? "";
  }

  // Input: wrapped in a label
  const closestLabel = element.closest("label");
  if (closestLabel) {
    // Remove the input's own text from the label text
    const clone = closestLabel.cloneNode(true) as Element;
    clone.querySelectorAll("input,select,textarea").forEach((n) => n.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();

  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();

  return element.textContent?.trim() ?? "";
}

/**
 * Checks whether an accessible name matches a filter (string exact match or regex).
 */
function nameMatches(name: string, filter: string | RegExp): boolean {
  if (typeof filter === "string") {
    return name === filter;
  }
  return filter.test(name);
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * Returns all elements inside container that match the given WAI-ARIA role.
 */
function queryAllByRoleRaw(container: Element | Document, role: string, options: ByRoleOptions = {}): Element[] {
  const scope = container instanceof Document ? container.documentElement : container;
  const selectors = IMPLICIT_ROLE_SELECTORS[role];

  let candidates: Element[] = [];

  if (selectors && selectors.length > 0) {
    const combined = selectors.join(", ");
    candidates = Array.from(scope.querySelectorAll(combined));
    // Also include scope itself if it matches
    if (scope.matches && scope.matches(combined) && !candidates.includes(scope)) {
      candidates.unshift(scope);
    }
  } else {
    // Fallback: look for explicit role attribute
    candidates = Array.from(scope.querySelectorAll(`[role='${role}']`));
  }

  return candidates.filter((el) => {
    // Exclude aria-hidden elements unless caller requests hidden
    if (!options.hidden && el.getAttribute("aria-hidden") === "true") return false;

    // level filter (for headings)
    if (options.level !== undefined) {
      const tagLevel = /^h([1-6])$/i.exec(el.tagName)?.[1];
      const ariaLevel = el.getAttribute("aria-level");
      const resolvedLevel = ariaLevel ? parseInt(ariaLevel, 10) : tagLevel ? parseInt(tagLevel, 10) : undefined;
      if (resolvedLevel !== options.level) return false;
    }

    // name filter
    if (options.name !== undefined) {
      const accName = getAccessibleName(el, container);
      if (!nameMatches(accName, options.name)) return false;
    }

    // selected filter
    if (options.selected !== undefined) {
      const ariaSelected = el.getAttribute("aria-selected");
      const resolvedSelected = ariaSelected === "true";
      if (resolvedSelected !== options.selected) return false;
    }

    // checked filter
    if (options.checked !== undefined) {
      const ariaChecked = el.getAttribute("aria-checked");
      const nativeChecked = el instanceof HTMLInputElement ? el.checked : undefined;
      const resolved = ariaChecked !== null
        ? ariaChecked === "true"
        : nativeChecked;
      if (resolved !== options.checked) return false;
    }

    // pressed filter
    if (options.pressed !== undefined) {
      const ariaPressed = el.getAttribute("aria-pressed");
      if (options.pressed === "mixed") {
        if (ariaPressed !== "mixed") return false;
      } else {
        const resolvedPressed = ariaPressed === "true";
        if (resolvedPressed !== options.pressed) return false;
      }
    }

    // expanded filter
    if (options.expanded !== undefined) {
      const ariaExpanded = el.getAttribute("aria-expanded");
      const resolvedExpanded = ariaExpanded === "true";
      if (resolvedExpanded !== options.expanded) return false;
    }

    return true;
  });
}

// ─── Throw helpers ────────────────────────────────────────────────────────────

function throwNotFound(queryName: string, ...args: unknown[]): never {
  throw new Error(`[a11y] ${queryName}: Unable to find element. Args: ${args.map(String).join(", ")}`);
}

function throwMultipleFound(queryName: string, count: number, ...args: unknown[]): never {
  throw new Error(`[a11y] ${queryName}: Found ${count} elements (expected exactly 1). Args: ${args.map(String).join(", ")}`);
}

// ─── getByRole / getAllByRole / queryByRole / queryAllByRole ──────────────────

/**
 * Returns all elements matching the given WAI-ARIA role.
 * Throws if none are found.
 */
export function getAllByRole(container: Element | Document, role: string, options?: ByRoleOptions): Element[] {
  const results = queryAllByRoleRaw(container, role, options);
  if (results.length === 0) throwNotFound("getAllByRole", role);
  return results;
}

/**
 * Returns the single element matching the given WAI-ARIA role.
 * Throws if none or more than one is found.
 */
export function getByRole(container: Element | Document, role: string, options?: ByRoleOptions): Element {
  const results = queryAllByRoleRaw(container, role, options);
  if (results.length === 0) throwNotFound("getByRole", role);
  if (results.length > 1) throwMultipleFound("getByRole", results.length, role);
  return results[0]!;
}

/**
 * Returns all elements matching the given WAI-ARIA role, or an empty array.
 */
export function queryAllByRole(container: Element | Document, role: string, options?: ByRoleOptions): Element[] {
  return queryAllByRoleRaw(container, role, options);
}

/**
 * Returns the single element matching the given WAI-ARIA role, or null.
 * Throws if more than one is found.
 */
export function queryByRole(container: Element | Document, role: string, options?: ByRoleOptions): Element | null {
  const results = queryAllByRoleRaw(container, role, options);
  if (results.length > 1) throwMultipleFound("queryByRole", results.length, role);
  return results[0] ?? null;
}

// ─── getByLabelText / queryByLabelText ────────────────────────────────────────

function queryAllByLabelTextRaw(container: Element | Document, text: string | RegExp): Element[] {
  const scope = container instanceof Document ? container.documentElement : container;
  const results: Element[] = [];

  // 1. Elements with aria-label matching
  scope.querySelectorAll("[aria-label]").forEach((el) => {
    const label = el.getAttribute("aria-label") ?? "";
    if (nameMatches(label, text)) results.push(el);
  });

  // 2. Elements with aria-labelledby matching
  scope.querySelectorAll("[aria-labelledby]").forEach((el) => {
    const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/);
    const labelText = ids
      .map((id) => {
        const doc = container instanceof Document ? container : el.ownerDocument ?? document;
        return doc.getElementById(id)?.textContent?.trim() ?? "";
      })
      .join(" ")
      .trim();
    if (labelText && nameMatches(labelText, text) && !results.includes(el)) {
      results.push(el);
    }
  });

  // 3. <label for="id"> associations
  scope.querySelectorAll("label").forEach((label) => {
    const labelText = label.textContent?.trim() ?? "";
    if (!nameMatches(labelText, text)) return;
    const forAttr = label.getAttribute("for");
    if (forAttr) {
      const doc = container instanceof Document ? container : label.ownerDocument ?? document;
      const target = doc.getElementById(forAttr);
      if (target && !results.includes(target)) results.push(target);
    }
    // 4. Implicit label wrapping
    const wrapped = label.querySelector("input,select,textarea");
    if (wrapped && !results.includes(wrapped)) results.push(wrapped);
  });

  return results;
}

/**
 * Returns all elements associated with the given label text.
 */
export function getAllByLabelText(container: Element | Document, text: string | RegExp): Element[] {
  const results = queryAllByLabelTextRaw(container, text);
  if (results.length === 0) throwNotFound("getAllByLabelText", text);
  return results;
}

/**
 * Returns the single element associated with the given label text.
 * Throws if none or multiple found.
 */
export function getByLabelText(container: Element | Document, text: string | RegExp): Element {
  const results = queryAllByLabelTextRaw(container, text);
  if (results.length === 0) throwNotFound("getByLabelText", text);
  if (results.length > 1) throwMultipleFound("getByLabelText", results.length, text);
  return results[0]!;
}

/**
 * Returns the single element associated with the given label text, or null.
 */
export function queryByLabelText(container: Element | Document, text: string | RegExp): Element | null {
  const results = queryAllByLabelTextRaw(container, text);
  if (results.length > 1) throwMultipleFound("queryByLabelText", results.length, text);
  return results[0] ?? null;
}

/**
 * Returns all elements associated with the given label text, or empty array.
 */
export function queryAllByLabelText(container: Element | Document, text: string | RegExp): Element[] {
  return queryAllByLabelTextRaw(container, text);
}

// ─── getByAltText / queryByAltText ────────────────────────────────────────────

function queryAllByAltTextRaw(container: Element | Document, text: string | RegExp): Element[] {
  const scope = container instanceof Document ? container.documentElement : container;
  return Array.from(scope.querySelectorAll("[alt]")).filter((el) => {
    const alt = el.getAttribute("alt") ?? "";
    return nameMatches(alt, text);
  });
}

/**
 * Returns all elements with an alt attribute matching text.
 */
export function getAllByAltText(container: Element | Document, text: string | RegExp): Element[] {
  const results = queryAllByAltTextRaw(container, text);
  if (results.length === 0) throwNotFound("getAllByAltText", text);
  return results;
}

/**
 * Returns the single element with an alt attribute matching text.
 */
export function getByAltText(container: Element | Document, text: string | RegExp): Element {
  const results = queryAllByAltTextRaw(container, text);
  if (results.length === 0) throwNotFound("getByAltText", text);
  if (results.length > 1) throwMultipleFound("getByAltText", results.length, text);
  return results[0]!;
}

/**
 * Returns the single element with an alt attribute matching text, or null.
 */
export function queryByAltText(container: Element | Document, text: string | RegExp): Element | null {
  const results = queryAllByAltTextRaw(container, text);
  if (results.length > 1) throwMultipleFound("queryByAltText", results.length, text);
  return results[0] ?? null;
}

/**
 * Returns all elements with an alt attribute matching text, or empty array.
 */
export function queryAllByAltText(container: Element | Document, text: string | RegExp): Element[] {
  return queryAllByAltTextRaw(container, text);
}

// ─── getByTitle / queryByTitle ────────────────────────────────────────────────

function queryAllByTitleRaw(container: Element | Document, text: string | RegExp): Element[] {
  const scope = container instanceof Document ? container.documentElement : container;
  return Array.from(scope.querySelectorAll("[title]")).filter((el) => {
    const title = el.getAttribute("title") ?? "";
    return nameMatches(title, text);
  });
}

/**
 * Returns all elements with a title attribute matching text.
 */
export function getAllByTitle(container: Element | Document, text: string | RegExp): Element[] {
  const results = queryAllByTitleRaw(container, text);
  if (results.length === 0) throwNotFound("getAllByTitle", text);
  return results;
}

/**
 * Returns the single element with a title attribute matching text.
 */
export function getByTitle(container: Element | Document, text: string | RegExp): Element {
  const results = queryAllByTitleRaw(container, text);
  if (results.length === 0) throwNotFound("getByTitle", text);
  if (results.length > 1) throwMultipleFound("getByTitle", results.length, text);
  return results[0]!;
}

/**
 * Returns the single element with a title attribute matching text, or null.
 */
export function queryByTitle(container: Element | Document, text: string | RegExp): Element | null {
  const results = queryAllByTitleRaw(container, text);
  if (results.length > 1) throwMultipleFound("queryByTitle", results.length, text);
  return results[0] ?? null;
}

/**
 * Returns all elements with a title attribute matching text, or empty array.
 */
export function queryAllByTitle(container: Element | Document, text: string | RegExp): Element[] {
  return queryAllByTitleRaw(container, text);
}

// ─── getRoles ─────────────────────────────────────────────────────────────────

/**
 * Returns a map of role -> Element[] for all elements in the container.
 * Useful for auditing the role landscape of a rendered component.
 */
export function getRoles(container: Element | Document): Map<string, Element[]> {
  const scope = container instanceof Document ? container.documentElement : container;
  const roleMap = new Map<string, Element[]>();

  const addToMap = (role: string, el: Element) => {
    const list = roleMap.get(role) ?? [];
    if (!list.includes(el)) {
      list.push(el);
      roleMap.set(role, list);
    }
  };

  // Check each known role
  for (const [role, selectors] of Object.entries(IMPLICIT_ROLE_SELECTORS)) {
    if (!selectors.length) continue;
    const combined = selectors.join(", ");
    try {
      scope.querySelectorAll(combined).forEach((el) => addToMap(role, el));
    } catch {
      // ignore invalid selectors
    }
  }

  // Also collect explicit role attributes not covered above
  scope.querySelectorAll("[role]").forEach((el) => {
    const roles = (el.getAttribute("role") ?? "").split(/\s+/).filter(Boolean);
    for (const r of roles) {
      addToMap(r, el);
    }
  });

  return roleMap;
}

// ─── isInaccessible ───────────────────────────────────────────────────────────

/**
 * Returns true if the element is not perceivable by assistive technology.
 *
 * An element is inaccessible when:
 * - It or any ancestor has aria-hidden="true"
 * - It or any ancestor has display:none (via inline style — getComputedStyle
 *   is reliable only in a full browser; we check inline for jsdom compat)
 * - It or any ancestor has visibility:hidden (inline style)
 * - The element itself has the hidden attribute
 */
export function isInaccessible(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") return true;
    if (current.getAttribute("hidden") !== null) return true;

    if (current instanceof HTMLElement) {
      const style = current.style;
      if (style.display === "none") return true;
      if (style.visibility === "hidden") return true;

      // Also check computed style when available (full DOM environment)
      try {
        const computed = getComputedStyle(current);
        if (computed.display === "none") return true;
        if (computed.visibility === "hidden") return true;
      } catch {
        // Not available in all environments
      }
    }

    current = current.parentElement;
  }
  return false;
}

// ─── toBeAccessible ───────────────────────────────────────────────────────────

/**
 * Custom matcher factory — checks whether an element is accessible.
 *
 * Checks:
 * 1. If the element has a role that requires specific ARIA attributes,
 *    those attributes must be present.
 * 2. <img> elements must have an alt attribute.
 * 3. Interactive elements (buttons, links, inputs, etc.) must have
 *    an accessible name.
 *
 * Returns a result object compatible with Vitest/Jest custom matchers.
 */
export function toBeAccessible(element: Element): AccessibleMatchResult {
  const messages: string[] = [];

  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role") ?? getImplicitRole(element);

  // 1. Check required ARIA attributes for the resolved role
  if (role && REQUIRED_ARIA_BY_ROLE[role]) {
    for (const attr of REQUIRED_ARIA_BY_ROLE[role]!) {
      if (!element.hasAttribute(attr)) {
        messages.push(`Missing required ARIA attribute "${attr}" for role="${role}".`);
      }
    }
  }

  // 2. img must have alt
  if (tag === "img") {
    const roleAttr = element.getAttribute("role");
    if (roleAttr !== "presentation" && roleAttr !== "none") {
      if (!element.hasAttribute("alt")) {
        messages.push(`<img> element is missing an alt attribute.`);
      }
    }
  }

  // 3. Interactive elements must have an accessible name
  const isInteractiveTag = INTERACTIVE_TAGS.has(tag);
  const isInteractiveRole = role !== null && INTERACTIVE_ROLES.has(role);

  if (isInteractiveTag || isInteractiveRole) {
    const accName = getAccessibleName(element);
    if (!accName) {
      messages.push(
        `Interactive element <${tag}${role ? ` role="${role}"` : ""}> has no accessible name. ` +
          `Add aria-label, aria-labelledby, or a visible label.`
      );
    }
  }

  const pass = messages.length === 0;
  return {
    pass,
    message: () =>
      pass
        ? `Element is accessible.`
        : `Element is not accessible:\n${messages.map((m) => `  - ${m}`).join("\n")}`,
  };
}

/**
 * Derives the implicit WAI-ARIA role for an element based on its tag and attributes.
 */
function getImplicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute("type") ?? "").toLowerCase();

  switch (tag) {
    case "button": return "button";
    case "a": return element.hasAttribute("href") ? "link" : null;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": return "heading";
    case "input":
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      return "textbox";
    case "select": return element.hasAttribute("multiple") ? "listbox" : "combobox";
    case "textarea": return "textbox";
    case "img": return "img";
    case "nav": return "navigation";
    case "main": return "main";
    case "header": return "banner";
    case "footer": return "contentinfo";
    case "aside": return "complementary";
    case "ul":
    case "ol": return "list";
    case "li": return "listitem";
    case "table": return "table";
    case "tr": return "row";
    case "td": return "cell";
    case "th": return element.getAttribute("scope") === "row" ? "rowheader" : "columnheader";
    case "dialog": return "dialog";
    case "form": return element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") ? "form" : null;
    case "section": return element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") ? "region" : null;
    case "progress": return "progressbar";
    case "hr": return "separator";
    case "article": return "article";
    case "fieldset": return "group";
    default: return null;
  }
}
