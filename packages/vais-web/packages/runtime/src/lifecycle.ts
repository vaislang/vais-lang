/**
 * Component lifecycle hooks for vaisx-compiler codegen output.
 * Target size: ~300B gzipped
 */

/** Component instance returned by compiled component functions */
export interface ComponentInstance {
  $$update?: () => void;
  $$destroy?: () => void;
}

/**
 * Mount a component onto a target DOM node.
 * Calls the component function with the target, which creates DOM nodes
 * and returns a lifecycle object.
 */
export function $$mount(
  target: HTMLElement,
  componentFn: (target: HTMLElement) => ComponentInstance,
): ComponentInstance {
  const instance = componentFn(target);
  return instance;
}

/**
 * Destroy a component instance — calls its $$destroy method if present.
 */
export function $$destroy(instance: ComponentInstance | null | undefined): void {
  if (instance && instance.$$destroy) {
    instance.$$destroy();
  }
}
