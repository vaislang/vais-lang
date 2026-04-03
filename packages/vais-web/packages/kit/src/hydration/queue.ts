/**
 * queue.ts — Event queuing before hydration completes
 */

export interface EventQueue {
  /** Queue an event for replay after hydration */
  capture(target: Element, event: Event): void;
  /** Replay all queued events on the hydrated element */
  replay(target: Element): void;
  /** Flush all queued events */
  clear(): void;
}

/**
 * Create an event queue that captures events before hydration is done
 * and replays them on the hydrated element afterwards.
 */
export function createEventQueue(): EventQueue {
  // Map from element to list of captured events
  const queue = new Map<Element, Event[]>();

  return {
    capture(target: Element, event: Event): void {
      const existing = queue.get(target);
      if (existing) {
        existing.push(event);
      } else {
        queue.set(target, [event]);
      }
    },

    replay(target: Element): void {
      const events = queue.get(target);
      if (!events) return;

      for (const event of events) {
        // Clone the event so it can be re-dispatched
        const cloned = new (event.constructor as typeof Event)(event.type, {
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          composed: event.composed,
        });
        target.dispatchEvent(cloned);
      }

      queue.delete(target);
    },

    clear(): void {
      queue.clear();
    },
  };
}
