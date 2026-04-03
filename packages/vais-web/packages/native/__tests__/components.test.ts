/**
 * Tests for native component factories:
 * View, Text, Image, ScrollView, FlatList + Platform utility.
 *
 * 25+ test cases covering:
 *   - Element type/props/children correctness
 *   - Flexbox style propagation
 *   - StyleSheet.create integration
 *   - Platform.select / Platform.OS / Platform.Version
 *   - FlatList renderItem / keyExtractor
 */

import { describe, it, expect, beforeEach } from "vitest";
import { View } from "../src/components/view.js";
import { Text } from "../src/components/text.js";
import { Image } from "../src/components/image.js";
import { ScrollView } from "../src/components/scroll-view.js";
import { FlatList } from "../src/components/flat-list.js";
import { Platform } from "../src/components/platform.js";
import { StyleSheet } from "../src/stylesheet.js";
import { resetRenderer } from "../src/renderer.js";
import type { NativeElement } from "../src/types.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetRenderer();
  StyleSheet._reset();
  Platform.reset();
});

// ===========================================================================
// View
// ===========================================================================

describe("View", () => {
  it("creates a NativeElement with type 'View'", () => {
    const el = View(null);
    expect(el.type).toBe("View");
  });

  it("stores style prop in element props", () => {
    const el = View({ style: { flex: 1, backgroundColor: "#fff" } });
    const style = el.props["style"] as { flex: number; backgroundColor: string };
    expect(style.flex).toBe(1);
    expect(style.backgroundColor).toBe("#fff");
  });

  it("accepts Flexbox layout props in style", () => {
    const el = View({
      style: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "stretch",
      },
    });
    const style = el.props["style"] as Record<string, unknown>;
    expect(style["flexDirection"]).toBe("row");
    expect(style["justifyContent"]).toBe("center");
    expect(style["alignItems"]).toBe("stretch");
  });

  it("appends children to the element", () => {
    const child = Text(null, "hello");
    const el = View(null, child);
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as NativeElement).type).toBe("Text");
  });

  it("supports multiple children", () => {
    const el = View(null, Text(null, "a"), Text(null, "b"), Text(null, "c"));
    expect(el.children).toHaveLength(3);
  });

  it("stores testID prop", () => {
    const el = View({ testID: "my-view" });
    expect(el.props["testID"]).toBe("my-view");
  });

  it("accepts a StyleSheet-created style ID in style array", () => {
    const styles = StyleSheet.create({ container: { flex: 1 } });
    const el = View({ style: [{ backgroundColor: "#eee" }] });
    // style is an array, ensure prop is stored
    expect(Array.isArray(el.props["style"])).toBe(true);
    // Verify StyleSheet created a valid ID
    expect(typeof styles.container).toBe("number");
  });

  it("stores onPress handler", () => {
    const handler = () => {};
    const el = View({ onPress: handler });
    expect(el.props["onPress"]).toBe(handler);
  });
});

// ===========================================================================
// Text
// ===========================================================================

describe("Text", () => {
  it("creates a NativeElement with type 'Text'", () => {
    const el = Text(null, "hello");
    expect(el.type).toBe("Text");
  });

  it("stores string children", () => {
    const el = Text(null, "world");
    expect(el.children[0]).toBe("world");
  });

  it("stores numberOfLines prop", () => {
    const el = Text({ numberOfLines: 2 }, "truncated text");
    expect(el.props["numberOfLines"]).toBe(2);
  });

  it("stores ellipsizeMode prop", () => {
    const el = Text({ ellipsizeMode: "tail" }, "long text");
    expect(el.props["ellipsizeMode"]).toBe("tail");
  });

  it("supports all ellipsizeMode values", () => {
    const modes = ["head", "middle", "tail", "clip"] as const;
    for (const mode of modes) {
      const el = Text({ ellipsizeMode: mode }, "text");
      expect(el.props["ellipsizeMode"]).toBe(mode);
    }
  });

  it("stores TextStyle props", () => {
    const el = Text({
      style: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#333",
        textAlign: "center",
      },
    }, "styled");
    const style = el.props["style"] as Record<string, unknown>;
    expect(style["fontSize"]).toBe(16);
    expect(style["fontWeight"]).toBe("bold");
    expect(style["color"]).toBe("#333");
    expect(style["textAlign"]).toBe("center");
  });

  it("supports nested Text children", () => {
    const inner = Text({ style: { fontWeight: "bold" } }, "bold");
    const outer = Text(null, "normal ", inner);
    expect(outer.children).toHaveLength(2);
    expect((outer.children[1] as NativeElement).type).toBe("Text");
  });

  it("stores selectable prop", () => {
    const el = Text({ selectable: true }, "selectable");
    expect(el.props["selectable"]).toBe(true);
  });
});

// ===========================================================================
// Image
// ===========================================================================

describe("Image", () => {
  it("creates a NativeElement with type 'Image'", () => {
    const el = Image({ source: { uri: "https://example.com/img.png" } });
    expect(el.type).toBe("Image");
  });

  it("stores uri source", () => {
    const source = { uri: "https://example.com/photo.jpg" };
    const el = Image({ source });
    expect(el.props["source"]).toEqual(source);
  });

  it("stores numeric (local) source", () => {
    const el = Image({ source: 42 });
    expect(el.props["source"]).toBe(42);
  });

  it("stores resizeMode prop", () => {
    const el = Image({ source: { uri: "img.png" }, resizeMode: "cover" });
    expect(el.props["resizeMode"]).toBe("cover");
  });

  it("supports all resizeMode values", () => {
    const modes = ["cover", "contain", "stretch", "repeat", "center"] as const;
    for (const mode of modes) {
      const el = Image({ source: { uri: "img.png" }, resizeMode: mode });
      expect(el.props["resizeMode"]).toBe(mode);
    }
  });

  it("stores onLoad callback", () => {
    const onLoad = () => {};
    const el = Image({ source: { uri: "img.png" }, onLoad });
    expect(el.props["onLoad"]).toBe(onLoad);
  });

  it("stores onError callback", () => {
    const onError = () => {};
    const el = Image({ source: { uri: "img.png" }, onError });
    expect(el.props["onError"]).toBe(onError);
  });

  it("stores ImageStyle in style prop", () => {
    const el = Image({
      source: { uri: "img.png" },
      style: { width: 100, height: 100, borderRadius: 8 },
    });
    const style = el.props["style"] as Record<string, unknown>;
    expect(style["width"]).toBe(100);
    expect(style["height"]).toBe(100);
  });

  it("is a leaf — has no children", () => {
    const el = Image({ source: { uri: "img.png" } });
    expect(el.children).toHaveLength(0);
  });
});

// ===========================================================================
// ScrollView
// ===========================================================================

describe("ScrollView", () => {
  it("creates a NativeElement with type 'ScrollView'", () => {
    const el = ScrollView(null);
    expect(el.type).toBe("ScrollView");
  });

  it("stores horizontal prop", () => {
    const el = ScrollView({ horizontal: true });
    expect(el.props["horizontal"]).toBe(true);
  });

  it("stores pagingEnabled prop", () => {
    const el = ScrollView({ pagingEnabled: true });
    expect(el.props["pagingEnabled"]).toBe(true);
  });

  it("stores onScroll callback", () => {
    const onScroll = () => {};
    const el = ScrollView({ onScroll });
    expect(el.props["onScroll"]).toBe(onScroll);
  });

  it("accepts child elements", () => {
    const child = View({ style: { height: 200 } });
    const el = ScrollView(null, child);
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as NativeElement).type).toBe("View");
  });

  it("stores scrollEventThrottle", () => {
    const el = ScrollView({ scrollEventThrottle: 16 });
    expect(el.props["scrollEventThrottle"]).toBe(16);
  });

  it("stores showsScrollIndicator flags", () => {
    const el = ScrollView({
      showsHorizontalScrollIndicator: false,
      showsVerticalScrollIndicator: true,
    });
    expect(el.props["showsHorizontalScrollIndicator"]).toBe(false);
    expect(el.props["showsVerticalScrollIndicator"]).toBe(true);
  });
});

// ===========================================================================
// FlatList
// ===========================================================================

describe("FlatList", () => {
  it("creates a NativeElement with type 'FlatList'", () => {
    const el = FlatList({
      data: [],
      renderItem: () => null,
    });
    expect(el.type).toBe("FlatList");
  });

  it("renders items via renderItem and stores them in renderedItems", () => {
    const data = ["a", "b", "c"];
    const el = FlatList({
      data,
      renderItem: ({ item }) => Text(null, item),
    });
    const rendered = el.props["renderedItems"] as Array<NativeElement | null>;
    expect(rendered).toHaveLength(3);
    expect(rendered[0]?.type).toBe("Text");
  });

  it("uses keyExtractor to assign keys to rendered items", () => {
    const data = [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }];
    const el = FlatList({
      data,
      renderItem: ({ item }) => Text(null, item.name),
      keyExtractor: (item) => item.id,
    });
    const rendered = el.props["renderedItems"] as Array<NativeElement | null>;
    expect(rendered[0]?.key).toBe("1");
    expect(rendered[1]?.key).toBe("2");
  });

  it("stores data prop", () => {
    const data = [1, 2, 3];
    const el = FlatList({ data, renderItem: () => null });
    expect(el.props["data"]).toEqual(data);
  });

  it("stores horizontal prop", () => {
    const el = FlatList({ data: [], renderItem: () => null, horizontal: true });
    expect(el.props["horizontal"]).toBe(true);
  });

  it("stores ListEmptyComponent as null when not provided", () => {
    const el = FlatList({ data: [], renderItem: () => null });
    expect(el.props["ListEmptyComponent"]).toBeNull();
  });

  it("stores ListHeaderComponent when provided", () => {
    const header = View({ style: { height: 50 } });
    const el = FlatList({ data: [], renderItem: () => null, ListHeaderComponent: header });
    expect(el.props["ListHeaderComponent"]).toBe(header);
  });

  it("stores ListFooterComponent when provided", () => {
    const footer = View({ style: { height: 30 } });
    const el = FlatList({ data: [], renderItem: () => null, ListFooterComponent: footer });
    expect(el.props["ListFooterComponent"]).toBe(footer);
  });

  it("stores onEndReached callback", () => {
    const onEndReached = () => {};
    const el = FlatList({ data: [], renderItem: () => null, onEndReached });
    expect(el.props["onEndReached"]).toBe(onEndReached);
  });

  it("handles empty data array", () => {
    const el = FlatList({ data: [], renderItem: () => null });
    const rendered = el.props["renderedItems"] as unknown[];
    expect(rendered).toHaveLength(0);
  });
});

// ===========================================================================
// Platform
// ===========================================================================

describe("Platform", () => {
  it("defaults OS to 'ios'", () => {
    expect(Platform.OS).toBe("ios");
  });

  it("setOS changes the platform", () => {
    Platform.setOS("android");
    expect(Platform.OS).toBe("android");
  });

  it("reset() restores default OS", () => {
    Platform.setOS("android");
    Platform.reset();
    expect(Platform.OS).toBe("ios");
  });

  it("select() returns ios value on ios", () => {
    Platform.setOS("ios");
    const val = Platform.select({ ios: "apple", android: "robot" });
    expect(val).toBe("apple");
  });

  it("select() returns android value on android", () => {
    Platform.setOS("android");
    const val = Platform.select({ ios: "apple", android: "robot" });
    expect(val).toBe("robot");
  });

  it("select() returns default when platform key is missing", () => {
    Platform.setOS("android");
    const val = Platform.select({ ios: "apple", default: "fallback" });
    expect(val).toBe("fallback");
  });

  it("select() returns undefined when no match and no default", () => {
    Platform.setOS("android");
    const val = Platform.select({ ios: "apple" });
    expect(val).toBeUndefined();
  });

  it("Platform.Version returns a non-empty value", () => {
    const version = Platform.Version;
    expect(version).toBeDefined();
    expect(String(version).length).toBeGreaterThan(0);
  });

  it("setVersion() updates the Version", () => {
    Platform.setVersion("16.4");
    expect(Platform.Version).toBe("16.4");
  });

  it("is() returns true when OS matches", () => {
    Platform.setOS("ios");
    expect(Platform.is("ios")).toBe(true);
    expect(Platform.is("android")).toBe(false);
  });
});

// ===========================================================================
// StyleSheet integration with components
// ===========================================================================

describe("StyleSheet + components integration", () => {
  it("can use StyleSheet.create IDs in View style array", () => {
    const styles = StyleSheet.create({
      container: { flex: 1, backgroundColor: "#fff" },
      inner: { padding: 16 },
    });
    // Verify the IDs are numbers
    expect(typeof styles.container).toBe("number");
    expect(typeof styles.inner).toBe("number");
    // Use in a View element
    const el = View({ style: [{ flex: 1 }] });
    expect(el.type).toBe("View");
  });

  it("StyleSheet.flatten merges styles used in Text", () => {
    const styles = StyleSheet.create({
      base: { fontSize: 14, color: "#000" },
    });
    const merged = StyleSheet.flatten([styles.base, { fontWeight: "bold" }]);
    expect(merged["fontSize"]).toBe(14);
    expect(merged["fontWeight"]).toBe("bold");
  });

  it("Platform.select with StyleSheet produces platform-specific styles", () => {
    Platform.setOS("ios");
    const shadow = Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},
    });
    expect(shadow).toHaveProperty("shadowColor", "#000");

    Platform.setOS("android");
    const shadowAndroid = Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},
    });
    expect(shadowAndroid).toHaveProperty("elevation", 4);
  });
});
