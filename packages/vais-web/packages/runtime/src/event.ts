/**
 * Event helper functions for vaisx-compiler codegen output.
 * Target size: ~300B gzipped
 */

export interface EventModifiers {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  once?: boolean;
  passive?: boolean;
}

/** Register an event listener with optional modifiers. Returns a cleanup function. */
export function $$listen(
  el: HTMLElement,
  event: string,
  handler: (e: Event) => void,
  modifiers?: EventModifiers,
): () => void {
  let wrappedHandler: (e: Event) => void;

  if (modifiers && (modifiers.preventDefault || modifiers.stopPropagation)) {
    wrappedHandler = (e: Event) => {
      if (modifiers.preventDefault) e.preventDefault();
      if (modifiers.stopPropagation) e.stopPropagation();
      handler(e);
    };
  } else {
    wrappedHandler = handler;
  }

  const options: AddEventListenerOptions | undefined =
    modifiers && (modifiers.once || modifiers.passive)
      ? { once: modifiers.once, passive: modifiers.passive }
      : undefined;

  el.addEventListener(event, wrappedHandler, options);

  return () => {
    el.removeEventListener(event, wrappedHandler, options);
  };
}
