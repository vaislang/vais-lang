/**
 * queries — DOM query helpers modelled after @testing-library/dom.
 *
 * Three families:
 *  getBy*   — throws if not found or if multiple are found
 *  queryBy* — returns null if not found (never throws)
 *  findBy*  — async; polls until found or timeout expires
 */

import { waitFor } from "./wait-for.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Test whether an element's text content matches a string or RegExp. */
function matchesText(el: Element, text: string | RegExp): boolean {
  const content = el.textContent ?? "";
  if (text instanceof RegExp) return text.test(content);
  return content.includes(text);
}

/**
 * Walk all elements in a container and return those whose *direct* visible
 * text (normalised) matches the query.  We prefer the deepest element that
 * fully contains the text so that `getByText('Hello')` returns the `<span>`
 * rather than an outer `<div>` that happens to also contain that text.
 */
function findElementsByText(
  container: HTMLElement,
  text: string | RegExp,
): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*"));
  // Filter to elements where the entire normalised text content matches.
  const matches = all.filter((el) => {
    const trimmed = (el.textContent ?? "").trim();
    if (text instanceof RegExp) return text.test(trimmed);
    return trimmed === text || trimmed.includes(text);
  });

  // Prefer the most specific (deepest) element — i.e. those not containing
  // another match as a descendant.
  return matches.filter(
    (el) => !matches.some((other) => other !== el && el.contains(other)),
  );
}

// ---------------------------------------------------------------------------
// getByText / queryByText / findByText
// ---------------------------------------------------------------------------

/**
 * Return the single element whose text content matches `text`.
 * Throws if zero or more than one element matches.
 */
export function getByText(container: HTMLElement, text: string | RegExp): HTMLElement {
  const results = findElementsByText(container, text);
  if (results.length === 0) {
    throw new Error(`Unable to find an element with the text: ${String(text)}`);
  }
  if (results.length > 1) {
    throw new Error(
      `Found multiple elements with the text: ${String(text)}. ` +
        "Use queryAllByText or be more specific.",
    );
  }
  return results[0]!;
}

/** Return the first matching element or `null` — never throws. */
export function queryByText(
  container: HTMLElement,
  text: string | RegExp,
): HTMLElement | null {
  const results = findElementsByText(container, text);
  return results[0] ?? null;
}

/** Async variant — polls until found or timeout. */
export async function findByText(
  container: HTMLElement,
  text: string | RegExp,
  options?: { timeout?: number; interval?: number },
): Promise<HTMLElement> {
  return waitFor(() => getByText(container, text), options);
}

// ---------------------------------------------------------------------------
// getByTestId / queryByTestId / findByTestId
// ---------------------------------------------------------------------------

/**
 * Return the single element with `data-testid` equal to `id`.
 * Throws if not found.
 */
export function getByTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) {
    throw new Error(`Unable to find an element by: [data-testid="${id}"]`);
  }
  return el;
}

/** Return the element with `data-testid` or `null`. */
export function queryByTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

/** Async variant. */
export async function findByTestId(
  container: HTMLElement,
  id: string,
  options?: { timeout?: number; interval?: number },
): Promise<HTMLElement> {
  return waitFor(() => getByTestId(container, id), options);
}

// ---------------------------------------------------------------------------
// getByRole / queryByRole / findByRole
// ---------------------------------------------------------------------------

const IMPLICIT_ROLES: Record<string, string[]> = {
  button: ["button"],
  link: ["a"],
  textbox: ["input", "textarea"],
  checkbox: ["input[type='checkbox']"],
  radio: ["input[type='radio']"],
  combobox: ["select"],
  listbox: ["select[multiple]"],
  heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
  img: ["img"],
  list: ["ul", "ol"],
  listitem: ["li"],
  form: ["form"],
  table: ["table"],
  row: ["tr"],
  cell: ["td", "th"],
  navigation: ["nav"],
  main: ["main"],
  banner: ["header"],
  contentinfo: ["footer"],
  complementary: ["aside"],
  region: ["section"],
  dialog: ["dialog"],
  alert: ["[role='alert']"],
};

function getSelectorsForRole(role: string): string[] {
  const implicit = IMPLICIT_ROLES[role] ?? [];
  const explicit = [`[role="${role}"]`];
  return [...implicit, ...explicit];
}

function elementMatchesRole(el: Element, role: string): boolean {
  // Explicit ARIA role takes precedence.
  if (el.getAttribute("role") === role) return true;

  // Check implicit roles.
  const selectors = getSelectorsForRole(role);
  return selectors.some((sel) => el.matches(sel));
}

function elementMatchesName(el: Element, name: string): boolean {
  const label =
    el.getAttribute("aria-label") ??
    el.getAttribute("aria-labelledby") ??
    (el as HTMLInputElement).placeholder ??
    el.getAttribute("title") ??
    el.textContent ??
    "";
  return label.includes(name);
}

function findElementsByRole(
  container: HTMLElement,
  role: string,
  options?: { name?: string },
): HTMLElement[] {
  const allElements = Array.from(container.querySelectorAll<HTMLElement>("*"));
  return allElements.filter((el) => {
    if (!elementMatchesRole(el, role)) return false;
    if (options?.name && !elementMatchesName(el, options.name)) return false;
    return true;
  });
}

/**
 * Return the single element with the given ARIA role (implicit or explicit).
 * Throws if zero or more than one element matches.
 */
export function getByRole(
  container: HTMLElement,
  role: string,
  options?: { name?: string },
): HTMLElement {
  const results = findElementsByRole(container, role, options);
  if (results.length === 0) {
    const nameHint = options?.name ? ` and name "${options.name}"` : "";
    throw new Error(`Unable to find an element with the role "${role}"${nameHint}`);
  }
  if (results.length > 1) {
    const nameHint = options?.name ? ` and name "${options.name}"` : "";
    throw new Error(
      `Found multiple elements with the role "${role}"${nameHint}. Be more specific.`,
    );
  }
  return results[0]!;
}

/** Return the first element with the given role or `null`. */
export function queryByRole(
  container: HTMLElement,
  role: string,
  options?: { name?: string },
): HTMLElement | null {
  const results = findElementsByRole(container, role, options);
  return results[0] ?? null;
}

/** Async variant. */
export async function findByRole(
  container: HTMLElement,
  role: string,
  options?: { name?: string; timeout?: number; interval?: number },
): Promise<HTMLElement> {
  const { timeout, interval, ...queryOptions } = options ?? {};
  return waitFor(() => getByRole(container, role, queryOptions), { timeout, interval });
}

// ---------------------------------------------------------------------------
// queryAllBy* helpers (non-throwing multi-match variants)
// ---------------------------------------------------------------------------

export function queryAllByText(
  container: HTMLElement,
  text: string | RegExp,
): HTMLElement[] {
  return findElementsByText(container, text);
}

export function queryAllByTestId(container: HTMLElement, id: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
}

export function queryAllByRole(
  container: HTMLElement,
  role: string,
  options?: { name?: string },
): HTMLElement[] {
  return findElementsByRole(container, role, options);
}

// Satisfy the unused import — matchesText is used implicitly through findElementsByText.
void (matchesText as unknown);
