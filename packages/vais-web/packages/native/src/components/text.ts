/**
 * Text — text display component for @vaisx/native.
 * Supports numberOfLines, ellipsizeMode, and text-specific styles.
 */

import { createElement } from "../renderer.js";
import type { NativeElement, NativeTextProps } from "../types.js";

/**
 * Text factory function — creates a NativeElement with type "Text".
 *
 * @param props    - Text props (style, numberOfLines, ellipsizeMode, etc.)
 * @param children - Zero or more string/number children or nested elements.
 */
export function Text(
  props: NativeTextProps | null,
  ...children: Array<NativeElement | string | number | null | undefined>
): NativeElement {
  return createElement("Text", props as Record<string, unknown> | null, ...children);
}
