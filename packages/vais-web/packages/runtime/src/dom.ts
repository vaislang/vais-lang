/**
 * DOM helper functions for vaisx-compiler codegen output.
 * Target size: ~400B gzipped
 */

// Special properties that must be set via element property (not attribute)
const SPECIAL_PROPS = new Set(["value", "checked", "selected", "disabled", "readOnly", "multiple", "indeterminate"]);

/** Create an HTML element */
export function $$element(tag: string): HTMLElement {
  return document.createElement(tag);
}

/** Create a text node */
export function $$text(content: string | number | boolean | null | undefined): Text {
  return document.createTextNode(content == null ? "" : String(content));
}

/** Append a child node to a parent */
export function $$append(parent: Node, child: Node): void {
  parent.appendChild(child);
}

/** Set or remove an attribute on an element */
export function $$attr(
  el: HTMLElement,
  name: string,
  value: string | number | boolean | null | undefined,
): void {
  if (SPECIAL_PROPS.has(name)) {
    (el as unknown as Record<string, unknown>)[name] = value;
    return;
  }
  if (value == null || value === false) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, String(value));
  }
}

/** Update text node content */
export function $$set_text(node: Text, value: string | number | boolean | null | undefined): void {
  const s = value == null ? "" : String(value);
  if (node.data !== s) node.data = s;
}

/** Create an anchor comment node (position marker) */
export function $$anchor(): Comment {
  return document.createComment("");
}

/** Create a DocumentFragment */
export function $$create_fragment(): DocumentFragment {
  return document.createDocumentFragment();
}

/** Insert a node before an anchor */
export function $$insert_before(parent: Node, node: Node, anchor: Node): void {
  parent.insertBefore(node, anchor);
}

/** Remove a node from the DOM */
export function $$remove_fragment(node: Node): void {
  if (node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

/** Spread an object of props onto an element */
export function $$spread(el: HTMLElement, props: Record<string, unknown>): void {
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    const value = props[key];
    if (typeof value === "function" && key.startsWith("on")) {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value as EventListener);
    } else {
      $$attr(el, key, value as string | number | boolean | null);
    }
  }
}
