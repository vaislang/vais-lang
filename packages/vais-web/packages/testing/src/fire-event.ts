/**
 * fireEvent — helpers for dispatching real DOM events on elements.
 *
 * Each helper dispatches a bubbling, cancelable event so that component
 * event listeners added with addEventListener() receive them correctly.
 */

/** Options forwarded to the underlying EventInit / MouseEventInit etc. */
export type FireEventOptions = EventInit;

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch any named DOM event on an element.
 *
 * @returns `false` if the event was cancelled (preventDefault() called), `true` otherwise.
 */
export function fireEvent(
  element: Element | Document | Window,
  event: Event,
): boolean {
  return element.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createEvent(
  type: string,
  EventCtor: typeof Event,
  init?: EventInit,
): Event {
  return new EventCtor(type, { bubbles: true, cancelable: true, ...init });
}

function createMouseEvent(type: string, init?: MouseEventInit): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

function createKeyboardEvent(type: string, init?: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
}

function createInputEvent(type: string, init?: InputEventInit): InputEvent {
  return new InputEvent(type, { bubbles: true, cancelable: true, ...init });
}

function createFocusEvent(type: string, init?: FocusEventInit): FocusEvent {
  return new FocusEvent(type, { bubbles: true, cancelable: true, ...init });
}

// ---------------------------------------------------------------------------
// Individual event helpers
// ---------------------------------------------------------------------------

/** Simulate a mouse click. */
fireEvent.click = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("click", init));

/** Simulate a double-click. */
fireEvent.dblClick = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("dblclick", init));

/** Simulate a mousedown event. */
fireEvent.mouseDown = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("mousedown", init));

/** Simulate a mouseup event. */
fireEvent.mouseUp = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("mouseup", init));

/** Simulate a mouseover event. */
fireEvent.mouseOver = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("mouseover", init));

/** Simulate a mouseout event. */
fireEvent.mouseOut = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("mouseout", init));

/** Simulate a mousemove event. */
fireEvent.mouseMove = (element: Element, init?: MouseEventInit): boolean =>
  fireEvent(element, createMouseEvent("mousemove", init));

/** Simulate an input event (value change while typing). */
fireEvent.input = (element: Element, init?: InputEventInit): boolean =>
  fireEvent(element, createInputEvent("input", init));

/** Simulate a change event (committed value change). */
fireEvent.change = (element: Element, init?: EventInit): boolean =>
  fireEvent(element, createEvent("change", Event, init));

/** Simulate a form submit event. */
fireEvent.submit = (element: Element, init?: EventInit): boolean =>
  fireEvent(element, createEvent("submit", Event, init));

/** Simulate a focus event. */
fireEvent.focus = (element: Element, init?: FocusEventInit): boolean =>
  fireEvent(element, createFocusEvent("focus", init));

/** Simulate a blur event. */
fireEvent.blur = (element: Element, init?: FocusEventInit): boolean =>
  fireEvent(element, createFocusEvent("blur", init));

/** Simulate a keydown event. */
fireEvent.keyDown = (element: Element, init?: KeyboardEventInit): boolean =>
  fireEvent(element, createKeyboardEvent("keydown", init));

/** Simulate a keyup event. */
fireEvent.keyUp = (element: Element, init?: KeyboardEventInit): boolean =>
  fireEvent(element, createKeyboardEvent("keyup", init));

/** Simulate a keypress event. */
fireEvent.keyPress = (element: Element, init?: KeyboardEventInit): boolean =>
  fireEvent(element, createKeyboardEvent("keypress", init));

/** Simulate a pointer-down event. */
fireEvent.pointerDown = (element: Element, init?: PointerEventInit): boolean =>
  fireEvent(element, new PointerEvent("pointerdown", { bubbles: true, cancelable: true, ...init }));

/** Simulate a pointer-up event. */
fireEvent.pointerUp = (element: Element, init?: PointerEventInit): boolean =>
  fireEvent(element, new PointerEvent("pointerup", { bubbles: true, cancelable: true, ...init }));

/** Simulate a custom event with arbitrary data. */
fireEvent.custom = <T = unknown>(
  element: Element,
  type: string,
  detail?: T,
  init?: CustomEventInit<T>,
): boolean =>
  fireEvent(
    element,
    new CustomEvent<T>(type, { bubbles: true, cancelable: true, detail, ...init }),
  );
