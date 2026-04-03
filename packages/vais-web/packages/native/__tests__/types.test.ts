/**
 * Type-level and runtime structural tests for @vaisx/native types.
 *
 * These tests verify that the type interfaces are correctly shaped and
 * that objects conforming to them are accepted at runtime.
 */

import { describe, it, expect } from "vitest";
import type {
  NativeElement,
  NativeViewProps,
  NativeTextProps,
  NativeImageProps,
  NativeScrollViewProps,
  NativeFlatListProps,
  BridgeInterface,
  RendererConfig,
  NativeModule,
  NavigatorConfig,
  Patch,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// NativeElement
// ---------------------------------------------------------------------------

describe("NativeElement", () => {
  it("accepts a minimal element with required fields", () => {
    const el: NativeElement = {
      type: "View",
      props: {},
      children: [],
    };
    expect(el.type).toBe("View");
    expect(el.children).toHaveLength(0);
    expect(el.key).toBeUndefined();
    expect(el.ref).toBeUndefined();
  });

  it("accepts key and ref", () => {
    const el: NativeElement = {
      type: "Text",
      props: { color: "#fff" },
      children: ["hello"],
      key: "item-1",
      ref: { current: null },
    };
    expect(el.key).toBe("item-1");
    expect(el.ref).toEqual({ current: null });
  });

  it("accepts nested children", () => {
    const child: NativeElement = { type: "Text", props: {}, children: ["hi"] };
    const parent: NativeElement = { type: "View", props: {}, children: [child, null] };
    expect(parent.children).toHaveLength(2);
    expect((parent.children[0] as NativeElement).type).toBe("Text");
  });
});

// ---------------------------------------------------------------------------
// NativeViewProps
// ---------------------------------------------------------------------------

describe("NativeViewProps", () => {
  it("is valid with no props at all", () => {
    const props: NativeViewProps = {};
    expect(props).toBeDefined();
  });

  it("accepts style, onPress, testID", () => {
    const props: NativeViewProps = {
      style: { flex: 1, backgroundColor: "#000" },
      onPress: () => {},
      testID: "my-view",
    };
    expect(props.testID).toBe("my-view");
    expect(typeof props.onPress).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// NativeTextProps
// ---------------------------------------------------------------------------

describe("NativeTextProps", () => {
  it("accepts numberOfLines and style", () => {
    const props: NativeTextProps = {
      numberOfLines: 2,
      style: { fontSize: 14, color: "#333" },
    };
    expect(props.numberOfLines).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// NativeImageProps
// ---------------------------------------------------------------------------

describe("NativeImageProps", () => {
  it("accepts uri source", () => {
    const props: NativeImageProps = {
      source: { uri: "https://example.com/image.png" },
      resizeMode: "cover",
    };
    expect((props.source as { uri: string }).uri).toBe("https://example.com/image.png");
  });

  it("accepts numeric source (bundled asset)", () => {
    const props: NativeImageProps = { source: 42 };
    expect(props.source).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// NativeScrollViewProps
// ---------------------------------------------------------------------------

describe("NativeScrollViewProps", () => {
  it("accepts horizontal and showsScrollIndicator", () => {
    const props: NativeScrollViewProps = {
      horizontal: true,
      showsScrollIndicator: false,
    };
    expect(props.horizontal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NativeFlatListProps
// ---------------------------------------------------------------------------

describe("NativeFlatListProps", () => {
  it("accepts generic typed data and renderItem", () => {
    type Item = { id: string; name: string };
    const props: NativeFlatListProps<Item> = {
      data: [{ id: "1", name: "Alice" }],
      renderItem: ({ item }) => ({
        type: "Text",
        props: {},
        children: [item.name],
      }),
      keyExtractor: (item) => item.id,
    };
    expect(props.data).toHaveLength(1);
    const rendered = props.renderItem({ item: props.data[0]!, index: 0, separators: { highlight: () => {}, unhighlight: () => {} } });
    expect(rendered?.children[0]).toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// BridgeInterface
// ---------------------------------------------------------------------------

describe("BridgeInterface", () => {
  it("can be implemented as a plain object", () => {
    const messages: Array<{ type: string; payload: unknown }> = [];
    const bridge: BridgeInterface = {
      sendMessage(type, payload) {
        messages.push({ type, payload });
      },
      onMessage(_handler) {
        // no-op stub
      },
      callNative(_module, _method, _args) {
        return Promise.resolve(null);
      },
    };

    bridge.sendMessage("test", { value: 1 });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// RendererConfig
// ---------------------------------------------------------------------------

describe("RendererConfig", () => {
  it("accepts ios and android platforms", () => {
    const stub: BridgeInterface = {
      sendMessage: () => {},
      onMessage: () => {},
      callNative: () => Promise.resolve(null),
    };

    const iosConfig: RendererConfig = { platform: "ios", bridge: stub };
    const androidConfig: RendererConfig = { platform: "android", bridge: stub };

    expect(iosConfig.platform).toBe("ios");
    expect(androidConfig.platform).toBe("android");
  });
});

// ---------------------------------------------------------------------------
// NativeModule
// ---------------------------------------------------------------------------

describe("NativeModule", () => {
  it("holds a name and a methods map", () => {
    const mod: NativeModule = {
      name: "CameraModule",
      methods: {
        takePhoto: (opts: unknown) => Promise.resolve({ path: "/tmp/photo.jpg", opts }),
      },
    };
    expect(mod.name).toBe("CameraModule");
    expect(typeof mod.methods["takePhoto"]).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// NavigatorConfig
// ---------------------------------------------------------------------------

describe("NavigatorConfig", () => {
  it("accepts stack navigator", () => {
    const config: NavigatorConfig = {
      type: "stack",
      screens: [
        { name: "Home", component: "HomeScreen" },
        { name: "Detail", component: "DetailScreen" },
      ],
      initialRoute: "Home",
    };
    expect(config.type).toBe("stack");
    expect(config.screens).toHaveLength(2);
    expect(config.initialRoute).toBe("Home");
  });

  it("accepts tab navigator without initialRoute", () => {
    const config: NavigatorConfig = {
      type: "tab",
      screens: [{ name: "Feed", component: "FeedScreen" }],
    };
    expect(config.type).toBe("tab");
    expect(config.initialRoute).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

describe("Patch", () => {
  it("represents a CREATE operation", () => {
    const p: Patch = {
      type: "CREATE",
      path: [0, 1],
      element: { type: "Text", props: {}, children: ["hello"] },
    };
    expect(p.type).toBe("CREATE");
    expect(p.path).toEqual([0, 1]);
  });

  it("represents an UPDATE operation", () => {
    const p: Patch = {
      type: "UPDATE",
      path: [0],
      props: { color: "#f00" },
    };
    expect(p.type).toBe("UPDATE");
    expect(p.props?.["color"]).toBe("#f00");
  });
});
