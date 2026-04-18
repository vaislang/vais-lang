/**
 * render() — mounts a VaisX component into a jsdom container and returns
 * query utilities plus lifecycle helpers.
 */

import { $$mount, $$destroy } from "@vaisx/runtime";
import type { ComponentInstance } from "@vaisx/runtime";
import { getByText, getByTestId, getByRole, queryByText, queryByTestId, queryByRole, findByText, findByTestId, findByRole } from "./queries.js";

/**
 * A VaisX component factory — matches the shape emitted by `vaisx-compiler`:
 * `export default function MyComponent($$target) { ... }`.
 *
 * The component takes the target DOM element it should mount into and returns
 * an optional ComponentInstance (with `$$update` / `$$destroy` hooks).
 *
 * Props are NOT passed to the top-level component — VaisX's runtime calls
 * `$$mount(target, componentFn)` without props. If your test needs to pass
 * props, wrap the factory in a closure: `render((target) => MyComp(target, myProps))`.
 */
export type ComponentFactory = (target: HTMLElement) => ComponentInstance;

export interface RenderOptions {
  /** Provide your own container element. Defaults to a freshly created <div>. */
  container?: HTMLElement;
}

export interface RenderResult {
  /** The DOM element that the component was mounted into. */
  container: HTMLElement;

  // --- synchronous queries ---
  getByText(text: string | RegExp): HTMLElement;
  getByTestId(id: string): HTMLElement;
  getByRole(role: string, options?: { name?: string }): HTMLElement;

  queryByText(text: string | RegExp): HTMLElement | null;
  queryByTestId(id: string): HTMLElement | null;
  queryByRole(role: string, options?: { name?: string }): HTMLElement | null;

  // --- async queries ---
  findByText(text: string | RegExp, options?: { timeout?: number; interval?: number }): Promise<HTMLElement>;
  findByTestId(id: string, options?: { timeout?: number; interval?: number }): Promise<HTMLElement>;
  findByRole(role: string, options?: { name?: string; timeout?: number; interval?: number }): Promise<HTMLElement>;

  /** Unmount the component and remove its container from the document. */
  unmount(): void;

  /** Print the container's HTML to the console for debugging. */
  debug(): void;
}

/** Track all mounted containers and their component instances so cleanup() can destroy them all. */
const mountedContainers: Set<HTMLElement> = new Set();
const mountedInstances: Map<HTMLElement, ComponentInstance> = new Map();

/**
 * Render a VaisX component factory into a jsdom container.
 *
 * @example
 * ```ts
 * import Counter from './Counter.vaisx';
 * const { getByText, unmount } = render(Counter);
 * expect(getByText('0')).toBeTruthy();
 * unmount();
 * ```
 *
 * @example With props (closure):
 * ```ts
 * const { getByText } = render((target) => Greeting(target, { name: 'World' }));
 * expect(getByText('Hello, World!')).toBeTruthy();
 * ```
 */
export function render(
  componentFactory: ComponentFactory,
  options: RenderOptions = {},
): RenderResult {
  const { container = document.createElement("div") } = options;

  // Attach container to body so queries that depend on layout or focusability work.
  if (!container.parentNode) {
    document.body.appendChild(container);
  }

  // Mount the component via the runtime's $$mount helper.
  // It invokes componentFactory(container) and returns the ComponentInstance.
  const instance = $$mount(container, componentFactory);

  mountedContainers.add(container);
  mountedInstances.set(container, instance);

  function unmount(): void {
    $$destroy(instance);
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    mountedContainers.delete(container);
    mountedInstances.delete(container);
  }

  function debug(): void {
    console.log("=== VaisX Debug ===");
    console.log(container.innerHTML);
    console.log("===================");
  }

  return {
    container,
    // synchronous
    getByText: (text) => getByText(container, text),
    getByTestId: (id) => getByTestId(container, id),
    getByRole: (role, opts) => getByRole(container, role, opts),
    queryByText: (text) => queryByText(container, text),
    queryByTestId: (id) => queryByTestId(container, id),
    queryByRole: (role, opts) => queryByRole(container, role, opts),
    // async
    findByText: (text, opts) => findByText(container, text, opts),
    findByTestId: (id, opts) => findByTestId(container, id, opts),
    findByRole: (role, opts) => findByRole(container, role, opts),
    unmount,
    debug,
  };
}

/**
 * Unmount and remove ALL components rendered during the current test.
 * Call this in afterEach() to keep tests isolated.
 *
 * @example
 * ```ts
 * afterEach(() => cleanup());
 * ```
 */
export function cleanup(): void {
  for (const container of mountedContainers) {
    const instance = mountedInstances.get(container);
    if (instance) {
      $$destroy(instance);
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
  mountedContainers.clear();
  mountedInstances.clear();
}
