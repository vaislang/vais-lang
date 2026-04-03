/**
 * ScrollView — scrollable container component for @vaisx/native.
 * Supports horizontal scroll, pagingEnabled, and scroll events.
 */

import { createElement } from "../renderer.js";
import type { NativeElement, NativeScrollViewProps } from "../types.js";

/**
 * ScrollView factory function — creates a NativeElement with type "ScrollView".
 *
 * @param props    - ScrollView props (horizontal, pagingEnabled, onScroll, etc.)
 * @param children - Zero or more child elements or primitive values.
 */
export function ScrollView(
  props: NativeScrollViewProps | null,
  ...children: Array<NativeElement | string | number | null | undefined>
): NativeElement {
  return createElement("ScrollView", props as Record<string, unknown> | null, ...children);
}
