/**
 * userEvent — higher-level, realistic user interaction helpers.
 *
 * Unlike fireEvent which dispatches a single synthetic event, userEvent
 * sequences multiple events to better simulate real browser interactions
 * (e.g. typing dispatches keydown → keypress → input → keyup per character).
 */

import { fireEvent } from "./fire-event.js";

// ---------------------------------------------------------------------------
// type()
// ---------------------------------------------------------------------------

/**
 * Simulate a user typing a string into an input / textarea element.
 *
 * For each character the sequence is: keydown → keypress → input → keyup.
 * The element's `.value` property is updated character-by-character.
 */
export async function type(
  element: HTMLElement,
  text: string,
  options: { delay?: number } = {},
): Promise<void> {
  const { delay = 0 } = options;

  // Focus the element first
  if (document.activeElement !== element) {
    element.focus();
    fireEvent.focus(element);
  }

  for (const char of text) {
    const keyInit: KeyboardEventInit = { key: char, bubbles: true, cancelable: true };

    fireEvent.keyDown(element, keyInit);
    fireEvent.keyPress(element, keyInit);

    // Update .value for input/textarea
    const inputEl = element as HTMLInputElement;
    if ("value" in inputEl) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputEl, (inputEl.value ?? "") + char);
      } else {
        inputEl.value = (inputEl.value ?? "") + char;
      }
    }

    fireEvent.input(element, { data: char, inputType: "insertText" });
    fireEvent.keyUp(element, keyInit);

    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

/**
 * Clear the current value of an input element then fire the relevant events.
 */
export function clear(element: HTMLElement): void {
  if (document.activeElement !== element) {
    element.focus();
    fireEvent.focus(element);
  }

  const inputEl = element as HTMLInputElement;
  if ("value" in inputEl) {
    inputEl.value = "";
  }

  fireEvent.input(element, { inputType: "deleteContentBackward" });
  fireEvent.change(element);
}

// ---------------------------------------------------------------------------
// click()
// ---------------------------------------------------------------------------

/**
 * Simulate a realistic click: mousedown → mouseup → click.
 */
export function click(element: HTMLElement, init?: MouseEventInit): void {
  fireEvent.mouseDown(element, init);
  fireEvent.mouseUp(element, init);
  fireEvent.click(element, init);
}

// ---------------------------------------------------------------------------
// dblClick()
// ---------------------------------------------------------------------------

/**
 * Simulate a realistic double-click: two clicks followed by dblclick.
 */
export function dblClick(element: HTMLElement, init?: MouseEventInit): void {
  click(element, init);
  click(element, init);
  fireEvent.dblClick(element, init);
}

// ---------------------------------------------------------------------------
// hover() / unhover()
// ---------------------------------------------------------------------------

/** Simulate hovering over an element (mouseover + mousemove). */
export function hover(element: HTMLElement, init?: MouseEventInit): void {
  fireEvent.mouseOver(element, init);
  fireEvent.mouseMove(element, init);
}

/** Simulate moving the pointer away from an element (mouseout). */
export function unhover(element: HTMLElement, init?: MouseEventInit): void {
  fireEvent.mouseOut(element, init);
}

// ---------------------------------------------------------------------------
// tab()
// ---------------------------------------------------------------------------

/** Simulate pressing the Tab key to move focus forward (or backward with shift). */
export function tab(options: { shift?: boolean } = {}): void {
  const { shift = false } = options;

  const keyInit: KeyboardEventInit = {
    key: "Tab",
    code: "Tab",
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  };

  const active = document.activeElement as HTMLElement | null;
  if (active) {
    fireEvent.keyDown(active, keyInit);
  }

  // Move focus to next/previous focusable element
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((el) => el.tabIndex >= 0);

  const currentIndex = active ? focusable.indexOf(active) : -1;
  const nextIndex = shift
    ? (currentIndex - 1 + focusable.length) % focusable.length
    : (currentIndex + 1) % focusable.length;

  const nextEl = focusable[nextIndex];
  if (nextEl) {
    if (active) fireEvent.blur(active);
    nextEl.focus();
    fireEvent.focus(nextEl);
  }

  if (active) {
    fireEvent.keyUp(active, keyInit);
  }
}

// ---------------------------------------------------------------------------
// selectOptions()
// ---------------------------------------------------------------------------

/**
 * Simulate selecting one or more options in a <select> element.
 */
export function selectOptions(
  element: HTMLSelectElement,
  values: string | string[],
): void {
  const toSelect = Array.isArray(values) ? values : [values];

  for (const option of element.options) {
    option.selected = toSelect.includes(option.value) || toSelect.includes(option.text);
  }

  fireEvent.change(element);
}

// ---------------------------------------------------------------------------
// Namespace export
// ---------------------------------------------------------------------------

export const userEvent = {
  type,
  clear,
  click,
  dblClick,
  hover,
  unhover,
  tab,
  selectOptions,
};
