/**
 * Image — image display component for @vaisx/native.
 * Supports source: { uri } | number, resizeMode, onLoad, onError.
 */

import { createElement } from "../renderer.js";
import type { NativeElement, NativeImageProps } from "../types.js";

/**
 * Image factory function — creates a NativeElement with type "Image".
 * Image is a leaf component; children are not supported.
 *
 * @param props - Image props (source, style, resizeMode, onLoad, onError, testID).
 */
export function Image(props: NativeImageProps): NativeElement {
  return createElement("Image", props as unknown as Record<string, unknown>);
}
