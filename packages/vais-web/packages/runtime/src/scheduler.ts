/**
 * Microtask-based batch scheduler for vaisx-compiler codegen output.
 * Target size: ~500B gzipped
 */

let dirty = false;
const queue: Array<() => void> = [];

/** Schedule a function to run in the next microtask flush. Deduplicates same-reference functions. */
export function $$schedule(fn: () => void): void {
  if (queue.indexOf(fn) === -1) {
    queue.push(fn);
  }
  if (!dirty) {
    dirty = true;
    queueMicrotask($$flush);
  }
}

/** Flush the queue — execute all scheduled functions in order, then reset. */
export function $$flush(): void {
  // Copy queue in case a scheduled fn triggers more scheduling
  const fns = queue.slice();
  queue.length = 0;
  dirty = false;
  for (let i = 0; i < fns.length; i++) {
    fns[i]();
  }
}
