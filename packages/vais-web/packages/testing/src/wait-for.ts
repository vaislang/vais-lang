/**
 * waitFor() — async utility that repeatedly calls a callback until it
 * stops throwing (or returns a resolved Promise).
 *
 * Used internally by findBy* query variants and can be used directly to wait
 * for reactive state changes in tests.
 */

export interface WaitForOptions {
  /**
   * Maximum time (in milliseconds) to wait before failing.
   * @default 1000
   */
  timeout?: number;
  /**
   * How often to retry the callback while waiting.
   * @default 50
   */
  interval?: number;
}

/**
 * Wait until `callback` returns a value without throwing.
 *
 * @example
 * ```ts
 * await waitFor(() => expect(el.textContent).toBe('loaded'));
 * ```
 *
 * @throws {Error} If the callback keeps throwing after `timeout` ms.
 */
export async function waitFor<T>(
  callback: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const { timeout = 1000, interval = 50 } = options;

  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const result = await Promise.resolve(callback());
      return result;
    } catch (err) {
      lastError = err;
      // Wait one interval before retrying.
      await sleep(Math.min(interval, deadline - Date.now()));
    }
  }

  // One final attempt at exactly the deadline.
  try {
    return await Promise.resolve(callback());
  } catch {
    if (lastError instanceof Error) {
      throw new Error(
        `waitFor timed out after ${timeout}ms.\nLast error: ${lastError.message}`,
        { cause: lastError },
      );
    }
    throw new Error(`waitFor timed out after ${timeout}ms.`);
  }
}

// ---------------------------------------------------------------------------
// waitForElementToBeRemoved()
// ---------------------------------------------------------------------------

/**
 * Wait until the element returned by `getElement` is removed from the DOM.
 *
 * @example
 * ```ts
 * const spinner = getByTestId('spinner');
 * await waitForElementToBeRemoved(() => queryByTestId(container, 'spinner'));
 * ```
 */
export async function waitForElementToBeRemoved<T extends Element | null>(
  getElement: () => T,
  options: WaitForOptions = {},
): Promise<void> {
  const { timeout = 1000, interval = 50 } = options;

  // Make sure it's actually present first.
  const initial = getElement();
  if (!initial) {
    throw new Error(
      "waitForElementToBeRemoved requires the element to be present initially.",
    );
  }

  await waitFor(
    () => {
      const el = getElement();
      if (el !== null) {
        throw new Error("Element is still in the document.");
      }
    },
    { timeout, interval },
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms < 0 ? 0 : ms));
}
