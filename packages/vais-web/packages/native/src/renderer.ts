/**
 * NativeRenderer — core reconciler for the @vaisx/native architecture.
 *
 * Provides createElement / render / diff / patch primitives that mirror
 * the React Native renderer model without depending on external native code.
 */

import type { NativeElement, NativeHandle, Patch, RendererConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _config: RendererConfig | null = null;

/** Map from container handle to the currently mounted element tree. */
const _trees = new Map<NativeHandle, NativeElement | null>();

/** Auto-incrementing handle counter (simulates native view tag allocation). */
let _nextHandle: NativeHandle = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allocateHandle(): NativeHandle {
  return _nextHandle++;
}

function normalizeChildren(
  raw: Array<NativeElement | string | number | null | undefined | boolean>
): Array<NativeElement | string | number | null> {
  return raw.flatMap((child) => {
    if (child === undefined || child === null || child === false || child === true) {
      return [null];
    }
    return [child as NativeElement | string | number | null];
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Configure the renderer with platform and bridge details.
 * Must be called once before render().
 */
export function configure(config: RendererConfig): void {
  _config = config;

  if (config.debug) {
    console.log(`[NativeRenderer] configured for platform: ${config.platform}`);
  }
}

/** Returns the active renderer config, or null if not yet configured. */
export function getConfig(): RendererConfig | null {
  return _config;
}

/**
 * createElement — create a NativeElement descriptor.
 *
 * @param type     - Built-in component tag ("View", "Text", …) or custom name.
 * @param props    - Props object (may be null).
 * @param children - Zero or more child elements / primitive values.
 */
export function createElement(
  type: string,
  props: Record<string, unknown> | null,
  ...children: Array<NativeElement | string | number | null | undefined | boolean>
): NativeElement {
  const { key, ref, ...restProps } = (props ?? {}) as Record<string, unknown> & {
    key?: string | number;
    ref?: NativeElement["ref"];
  };

  return {
    type,
    props: restProps,
    children: normalizeChildren(children),
    key: key ?? undefined,
    ref: ref ?? null,
  };
}

/**
 * render — mount an element tree into a container.
 *
 * In a real native renderer this would drive bridge calls to allocate views.
 * Here we record the tree and return the container handle so callers can
 * inspect / test the reconciler state.
 *
 * @param element   - Root NativeElement to mount.
 * @param container - Container handle (pass 0 to auto-allocate a new root).
 * @returns The container handle.
 */
export function render(
  element: NativeElement | null,
  container: NativeHandle = 0
): NativeHandle {
  const handle = container === 0 ? allocateHandle() : container;

  if (_config?.debug) {
    console.log(`[NativeRenderer] render — handle:${handle} type:${element?.type ?? "null"}`);
  }

  _trees.set(handle, element);

  // In a real renderer we would call bridge.sendMessage here.
  _config?.bridge.sendMessage("render", { handle, element });

  return handle;
}

/**
 * diff — compare two element trees and produce a list of patches.
 *
 * This is a simplified structural diff that covers the most common cases:
 * create, delete, prop update, and full replacement on type change.
 */
export function diff(
  oldTree: NativeElement | null | undefined,
  newTree: NativeElement | null | undefined,
  path: number[] = []
): Patch[] {
  const patches: Patch[] = [];

  // Both absent — nothing to do.
  if (oldTree == null && newTree == null) {
    return patches;
  }

  // New node added.
  if (oldTree == null && newTree != null) {
    patches.push({ type: "CREATE", path, element: newTree });
    return patches;
  }

  // Node removed.
  if (oldTree != null && newTree == null) {
    patches.push({ type: "DELETE", path });
    return patches;
  }

  // TypeScript narrowing — both are non-null from here.
  const oldNode = oldTree!;
  const newNode = newTree!;

  // Type changed — replace the whole subtree.
  if (oldNode.type !== newNode.type) {
    patches.push({ type: "REPLACE", path, element: newNode });
    return patches;
  }

  // Same type — check for prop changes.
  const propPatches = diffProps(oldNode.props, newNode.props);
  if (Object.keys(propPatches).length > 0) {
    patches.push({ type: "UPDATE", path, props: propPatches });
  }

  // Recurse into children.
  const maxLen = Math.max(oldNode.children.length, newNode.children.length);
  for (let i = 0; i < maxLen; i++) {
    const oldChild = oldNode.children[i];
    const newChild = newNode.children[i];

    const oldElem = isNativeElement(oldChild) ? oldChild : null;
    const newElem = isNativeElement(newChild) ? newChild : null;

    patches.push(...diff(oldElem, newElem, [...path, i]));
  }

  return patches;
}

function diffProps(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

  for (const key of allKeys) {
    const oldVal = oldProps[key];
    const newVal = newProps[key];
    if (oldVal !== newVal) {
      // Record the new value (undefined signals removal).
      changes[key] = newVal;
    }
  }

  return changes;
}

function isNativeElement(
  value: NativeElement | string | number | null | undefined
): value is NativeElement {
  return value !== null && value !== undefined && typeof value === "object";
}

/**
 * patch — apply a list of patches to a mounted tree.
 *
 * In production this drives bridge calls to mutate native views.
 * Here we update our in-memory tree and forward messages via the bridge.
 *
 * @param container - Container handle previously returned by render().
 * @param patches   - Patch list produced by diff().
 */
export function patch(container: NativeHandle, patches: Patch[]): void {
  if (patches.length === 0) return;

  const currentTree = _trees.get(container);

  if (_config?.debug) {
    console.log(
      `[NativeRenderer] patch — handle:${container} ops:${patches.length}`
    );
  }

  // Apply patches to our in-memory tree.
  const updatedTree = applyPatches(currentTree ?? null, patches);
  _trees.set(container, updatedTree);

  // Forward to bridge.
  _config?.bridge.sendMessage("patch", { container, patches });
}

function applyPatches(
  tree: NativeElement | null,
  patches: Patch[]
): NativeElement | null {
  let result = tree;

  for (const p of patches) {
    result = applyPatch(result, p, p.path);
  }

  return result;
}

function applyPatch(
  node: NativeElement | null,
  patch: Patch,
  path: number[]
): NativeElement | null {
  if (path.length === 0) {
    // This node is the target.
    switch (patch.type) {
      case "CREATE":
        return patch.element ?? null;

      case "DELETE":
        return null;

      case "REPLACE":
        return patch.element ?? null;

      case "UPDATE":
        if (node == null) return null;
        return {
          ...node,
          props: { ...node.props, ...patch.props },
        };

      case "REORDER":
        if (node == null || !patch.order) return node;
        return {
          ...node,
          children: patch.order.map((i) => node.children[i] ?? null),
        };

      default:
        return node;
    }
  }

  // Descend into children.
  if (node == null) return null;

  const [head, ...rest] = path;
  const newChildren = [...node.children];
  const child = newChildren[head];
  const childElem = isNativeElement(child) ? child : null;
  newChildren[head] = applyPatch(childElem, patch, rest);

  return { ...node, children: newChildren };
}

// ---------------------------------------------------------------------------
// Inspection utilities (useful for testing)
// ---------------------------------------------------------------------------

/** Return the currently mounted element tree for a container handle. */
export function getTree(container: NativeHandle): NativeElement | null | undefined {
  return _trees.get(container);
}

/** Unmount all trees and reset the handle counter (useful between tests). */
export function resetRenderer(): void {
  _trees.clear();
  _nextHandle = 1;
  _config = null;
}
