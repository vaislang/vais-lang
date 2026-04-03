/**
 * View — basic container component for @vaisx/native.
 * Supports Flexbox layout and common visual styles.
 */

import { createElement } from "../renderer.js";
import type { NativeElement, NativeViewProps } from "../types.js";

/**
 * View factory function — creates a NativeElement with type "View".
 *
 * @param props    - View props (style, onPress, testID, etc.)
 * @param children - Zero or more child elements or primitive values.
 */
export function View(
  props: NativeViewProps | null,
  ...children: Array<NativeElement | string | number | null | undefined>
): NativeElement {
  return createElement("View", props as Record<string, unknown> | null, ...children);
}
