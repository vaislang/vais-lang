/**
 * FlatList — virtualized list component for @vaisx/native.
 * Supports data/renderItem/keyExtractor, horizontal layout,
 * header/footer/empty components, and end-reached callbacks.
 */

import { createElement } from "../renderer.js";
import type { NativeElement, NativeFlatListProps, RenderItemInfo } from "../types.js";

/**
 * FlatList factory function — creates a NativeElement with type "FlatList".
 *
 * Renders each item via `props.renderItem` and attaches the resulting
 * element tree in the `renderedItems` prop so consumers can inspect it.
 *
 * @param props - FlatList props (data, renderItem, keyExtractor, etc.)
 */
export function FlatList<T>(props: NativeFlatListProps<T>): NativeElement {
  const {
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ...rest
  } = props;

  // Render each item via the provided renderItem function.
  const renderedItems: Array<NativeElement | null> = data.map((item, index) => {
    const info: RenderItemInfo<T> = {
      item,
      index,
      separators: {
        highlight: () => {},
        unhighlight: () => {},
      },
    };
    const rendered = renderItem(info);
    if (rendered && keyExtractor) {
      // Attach key information into props for reconciler use.
      return {
        ...rendered,
        key: keyExtractor(item, index),
      };
    }
    return rendered;
  });

  return createElement("FlatList", {
    ...rest,
    data: data as unknown[],
    renderItem: renderItem as unknown,
    keyExtractor: keyExtractor as unknown,
    renderedItems,
    ListEmptyComponent: ListEmptyComponent ?? null,
    ListHeaderComponent: ListHeaderComponent ?? null,
    ListFooterComponent: ListFooterComponent ?? null,
  } as Record<string, unknown>);
}
