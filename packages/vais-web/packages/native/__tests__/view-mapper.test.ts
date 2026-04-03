/**
 * Tests for ViewMapper — VaisX 컴포넌트 → 네이티브 뷰 매핑
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createViewMapper,
  PlatformMappings,
} from "../src/view-mapper.js";
import type {
  ViewMapper,
  ViewMapping,
  NativeTreeNode,
  MapperPatch,
} from "../src/view-mapper.js";
import type { NativeElement } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(
  type: string,
  props: Record<string, unknown> = {},
  children: Array<NativeElement | string | number | null> = [],
  key?: string | number
): NativeElement {
  return { type, props, children, key, ref: null };
}

function treeNode(
  nativeType: string,
  props: Record<string, unknown> = {},
  children: NativeTreeNode[] = [],
  key?: string | number
): NativeTreeNode {
  return { nativeType, props, children, key };
}

// ---------------------------------------------------------------------------
// PlatformMappings 상수 검증
// ---------------------------------------------------------------------------

describe("PlatformMappings", () => {
  it("iOS View → UIView, childrenAllowed true", () => {
    const mapping = PlatformMappings.ios["View"];
    expect(mapping?.nativeType).toBe("UIView");
    expect(mapping?.childrenAllowed).toBe(true);
  });

  it("iOS Text → UILabel", () => {
    expect(PlatformMappings.ios["Text"]?.nativeType).toBe("UILabel");
  });

  it("iOS Image → UIImageView, childrenAllowed false", () => {
    const mapping = PlatformMappings.ios["Image"];
    expect(mapping?.nativeType).toBe("UIImageView");
    expect(mapping?.childrenAllowed).toBe(false);
  });

  it("Android View → android.view.View", () => {
    expect(PlatformMappings.android["View"]?.nativeType).toBe("android.view.View");
  });

  it("Android Text → android.widget.TextView", () => {
    expect(PlatformMappings.android["Text"]?.nativeType).toBe("android.widget.TextView");
  });

  it("Android Image → android.widget.ImageView", () => {
    expect(PlatformMappings.android["Image"]?.nativeType).toBe("android.widget.ImageView");
  });
});

// ---------------------------------------------------------------------------
// createViewMapper — mapComponent
// ---------------------------------------------------------------------------

describe("createViewMapper — mapComponent", () => {
  let iosMapper: ViewMapper;
  let androidMapper: ViewMapper;

  beforeEach(() => {
    iosMapper = createViewMapper("ios");
    androidMapper = createViewMapper("android");
  });

  it("maps View to UIView on iOS", () => {
    const result = iosMapper.mapComponent("View", {});
    expect(result.nativeType).toBe("UIView");
    expect(result.childrenAllowed).toBe(true);
  });

  it("maps View to android.view.View on Android", () => {
    const result = androidMapper.mapComponent("View", {});
    expect(result.nativeType).toBe("android.view.View");
  });

  it("maps Text to UILabel on iOS", () => {
    const result = iosMapper.mapComponent("Text", {});
    expect(result.nativeType).toBe("UILabel");
  });

  it("maps Text to android.widget.TextView on Android", () => {
    const result = androidMapper.mapComponent("Text", {});
    expect(result.nativeType).toBe("android.widget.TextView");
  });

  it("maps Image to UIImageView on iOS", () => {
    const result = iosMapper.mapComponent("Image", {});
    expect(result.nativeType).toBe("UIImageView");
    expect(result.childrenAllowed).toBe(false);
  });

  it("maps ScrollView to UIScrollView on iOS", () => {
    const result = iosMapper.mapComponent("ScrollView", {});
    expect(result.nativeType).toBe("UIScrollView");
  });

  it("maps FlatList to UITableView on iOS", () => {
    const result = iosMapper.mapComponent("FlatList", {});
    expect(result.nativeType).toBe("UITableView");
  });

  it("falls back to UIView for unknown component on iOS", () => {
    const result = iosMapper.mapComponent("UnknownWidget", { foo: 1 });
    expect(result.nativeType).toBe("UIView");
    expect(result.childrenAllowed).toBe(true);
    expect(result.nativeProps["foo"]).toBe(1);
  });

  it("falls back to android.view.ViewGroup for unknown component on Android", () => {
    const result = androidMapper.mapComponent("UnknownWidget", {});
    expect(result.nativeType).toBe("android.view.ViewGroup");
  });

  it("applies iOS Text propTransform — numberOfLines → numberOfLines, ellipsizeMode → lineBreakMode", () => {
    const result = iosMapper.mapComponent("Text", {
      numberOfLines: 3,
      ellipsizeMode: "tail",
    });
    expect(result.nativeProps["numberOfLines"]).toBe(3);
    expect(result.nativeProps["lineBreakMode"]).toBe("tail");
  });

  it("applies Android Text propTransform — numberOfLines → maxLines, ellipsizeMode → ellipsize", () => {
    const result = androidMapper.mapComponent("Text", {
      numberOfLines: 2,
      ellipsizeMode: "middle",
    });
    expect(result.nativeProps["maxLines"]).toBe(2);
    expect(result.nativeProps["ellipsize"]).toBe("MIDDLE");
  });

  it("applies iOS Image propTransform — source.uri → imageURL", () => {
    const result = iosMapper.mapComponent("Image", {
      source: { uri: "https://example.com/img.png" },
    });
    expect(result.nativeProps["imageURL"]).toBe("https://example.com/img.png");
  });

  it("applies Android Image propTransform — source.uri → imageURI", () => {
    const result = androidMapper.mapComponent("Image", {
      source: { uri: "https://example.com/img.png" },
    });
    expect(result.nativeProps["imageURI"]).toBe("https://example.com/img.png");
  });
});

// ---------------------------------------------------------------------------
// registerCustomMapping
// ---------------------------------------------------------------------------

describe("registerCustomMapping", () => {
  it("registers and maps a custom component on iOS", () => {
    const mapper = createViewMapper("ios");
    const customMapping: ViewMapping = {
      nativeType: "MyCustomNativeView",
      childrenAllowed: true,
    };
    mapper.registerCustomMapping("MyCard", customMapping);

    const result = mapper.mapComponent("MyCard", { rounded: true });
    expect(result.nativeType).toBe("MyCustomNativeView");
    expect(result.childrenAllowed).toBe(true);
    expect(result.nativeProps["rounded"]).toBe(true);
  });

  it("custom mapping with propTransform is applied", () => {
    const mapper = createViewMapper("android");
    mapper.registerCustomMapping("Badge", {
      nativeType: "com.example.BadgeView",
      childrenAllowed: false,
      propTransform: (props) => ({ ...props, transformed: true }),
    });

    const result = mapper.mapComponent("Badge", { count: 5 });
    expect(result.nativeType).toBe("com.example.BadgeView");
    expect(result.nativeProps["transformed"]).toBe(true);
    expect(result.nativeProps["count"]).toBe(5);
  });

  it("custom mappings are isolated per mapper instance", () => {
    const mapper1 = createViewMapper("ios");
    const mapper2 = createViewMapper("ios");
    mapper1.registerCustomMapping("UniqueView", {
      nativeType: "UniqueNative",
      childrenAllowed: false,
    });

    const result1 = mapper1.mapComponent("UniqueView", {});
    const result2 = mapper2.mapComponent("UniqueView", {});

    expect(result1.nativeType).toBe("UniqueNative");
    // mapper2에는 등록 안 됐으므로 폴백
    expect(result2.nativeType).toBe("UIView");
  });
});

// ---------------------------------------------------------------------------
// createNativeTree
// ---------------------------------------------------------------------------

describe("createNativeTree", () => {
  it("converts a single View element to a NativeTreeNode", () => {
    const mapper = createViewMapper("ios");
    const element = el("View", { testID: "root" });
    const node = mapper.createNativeTree(element);

    expect(node.nativeType).toBe("UIView");
    expect(node.props["testID"]).toBe("root");
    expect(node.children).toHaveLength(0);
  });

  it("recursively converts nested children", () => {
    const mapper = createViewMapper("android");
    const element = el("View", {}, [
      el("Text", { color: "red" }),
      el("Image", { source: { uri: "http://img.png" } }),
    ]);

    const node = mapper.createNativeTree(element);
    expect(node.nativeType).toBe("android.view.View");
    expect(node.children).toHaveLength(2);
    expect(node.children[0]?.nativeType).toBe("android.widget.TextView");
    expect(node.children[1]?.nativeType).toBe("android.widget.ImageView");
  });

  it("preserves element key in NativeTreeNode", () => {
    const mapper = createViewMapper("ios");
    const element = el("View", {}, [], "my-key");
    const node = mapper.createNativeTree(element);
    expect(node.key).toBe("my-key");
  });

  it("ignores primitive (string/number/null) children — does not crash", () => {
    const mapper = createViewMapper("ios");
    const element: NativeElement = {
      type: "Text",
      props: {},
      children: ["hello", 42, null],
      ref: null,
    };
    const node = mapper.createNativeTree(element);
    // primitive children은 NativeTreeNode로 변환되지 않음
    expect(node.children).toHaveLength(0);
  });

  it("childrenAllowed=false prevents children from being converted", () => {
    const mapper = createViewMapper("ios");
    const element = el("Image", { source: { uri: "x" } }, [
      el("View", {}),
    ]);
    const node = mapper.createNativeTree(element);
    expect(node.nativeType).toBe("UIImageView");
    expect(node.children).toHaveLength(0);
  });

  it("deeply nested tree is converted correctly", () => {
    const mapper = createViewMapper("ios");
    const element = el("View", {}, [
      el("View", {}, [
        el("Text", {}, []),
      ]),
    ]);
    const node = mapper.createNativeTree(element);
    expect(node.children[0]?.nativeType).toBe("UIView");
    expect(node.children[0]?.children[0]?.nativeType).toBe("UILabel");
  });
});

// ---------------------------------------------------------------------------
// incrementalUpdate
// ---------------------------------------------------------------------------

describe("incrementalUpdate", () => {
  let mapper: ViewMapper;

  beforeEach(() => {
    mapper = createViewMapper("ios");
  });

  it("returns empty patch list when both trees are null", () => {
    const patches = mapper.incrementalUpdate(null, null);
    expect(patches).toHaveLength(0);
  });

  it("returns ADD patch when oldTree is null", () => {
    const newNode = treeNode("UIView");
    const patches = mapper.incrementalUpdate(null, newNode);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.type).toBe("ADD");
    expect(patches[0]?.node).toBe(newNode);
  });

  it("returns REMOVE patch when newTree is null", () => {
    const oldNode = treeNode("UIView");
    const patches = mapper.incrementalUpdate(oldNode, null);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.type).toBe("REMOVE");
  });

  it("returns REMOVE + ADD when nativeType changes", () => {
    const oldNode = treeNode("UIView");
    const newNode = treeNode("UILabel");
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    const types = patches.map((p) => p.type);
    expect(types).toContain("REMOVE");
    expect(types).toContain("ADD");
  });

  it("returns UPDATE patch when props change", () => {
    const oldNode = treeNode("UIView", { color: "red" });
    const newNode = treeNode("UIView", { color: "blue" });
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.type).toBe("UPDATE");
    expect(patches[0]?.props?.["color"]).toBe("blue");
  });

  it("returns no patches when trees are identical", () => {
    const child = treeNode("UILabel", { text: "hi" });
    const oldNode = treeNode("UIView", { flex: 1 }, [child]);
    const newNode = treeNode("UIView", { flex: 1 }, [treeNode("UILabel", { text: "hi" })]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    expect(patches).toHaveLength(0);
  });

  it("detects added child", () => {
    const oldNode = treeNode("UIView", {}, []);
    const newNode = treeNode("UIView", {}, [treeNode("UILabel")]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    expect(patches.some((p) => p.type === "ADD")).toBe(true);
  });

  it("detects removed child", () => {
    const oldNode = treeNode("UIView", {}, [treeNode("UILabel")]);
    const newNode = treeNode("UIView", {}, []);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    expect(patches.some((p) => p.type === "REMOVE")).toBe(true);
  });

  it("detects prop update in nested child", () => {
    const oldNode = treeNode("UIView", {}, [
      treeNode("UILabel", { text: "old" }),
    ]);
    const newNode = treeNode("UIView", {}, [
      treeNode("UILabel", { text: "new" }),
    ]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    const update = patches.find((p) => p.type === "UPDATE");
    expect(update).toBeDefined();
    expect(update?.props?.["text"]).toBe("new");
    expect(update?.path).toEqual([0]);
  });

  it("detects MOVE for key-based children that swap positions", () => {
    const childA = { ...treeNode("UILabel", { id: "a" }), key: "a" };
    const childB = { ...treeNode("UILabel", { id: "b" }), key: "b" };
    const oldNode = treeNode("UIView", {}, [childA, childB]);
    const newNode = treeNode("UIView", {}, [
      { ...treeNode("UILabel", { id: "b" }), key: "b" },
      { ...treeNode("UILabel", { id: "a" }), key: "a" },
    ]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    const movePatch = patches.find((p) => p.type === "MOVE");
    expect(movePatch).toBeDefined();
  });

  it("ADD patch for new key-based child", () => {
    const oldNode = treeNode("UIView", {}, [
      { ...treeNode("UILabel"), key: "existing" },
    ]);
    const newNode = treeNode("UIView", {}, [
      { ...treeNode("UILabel"), key: "existing" },
      { ...treeNode("UIImageView"), key: "new-child" },
    ]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    const addPatch = patches.find((p) => p.type === "ADD");
    expect(addPatch).toBeDefined();
  });

  it("REMOVE patch for deleted key-based child", () => {
    const oldNode = treeNode("UIView", {}, [
      { ...treeNode("UILabel"), key: "a" },
      { ...treeNode("UIImageView"), key: "b" },
    ]);
    const newNode = treeNode("UIView", {}, [
      { ...treeNode("UILabel"), key: "a" },
    ]);
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    expect(patches.some((p) => p.type === "REMOVE")).toBe(true);
  });

  it("UPDATE patch includes only changed prop keys", () => {
    const oldNode = treeNode("UIView", { color: "red", flex: 1 });
    const newNode = treeNode("UIView", { color: "blue", flex: 1 });
    const patches = mapper.incrementalUpdate(oldNode, newNode);
    const update = patches.find((p) => p.type === "UPDATE");
    expect(update?.props).toEqual({ color: "blue" });
  });

  it("path is correct for deeply nested update", () => {
    const deepChild = treeNode("UILabel", { text: "deep" });
    const mid = treeNode("UIView", {}, [deepChild]);
    const oldRoot = treeNode("UIView", {}, [mid]);

    const deepChildNew = treeNode("UILabel", { text: "changed" });
    const midNew = treeNode("UIView", {}, [deepChildNew]);
    const newRoot = treeNode("UIView", {}, [midNew]);

    const patches = mapper.incrementalUpdate(oldRoot, newRoot);
    const update = patches.find((p) => p.type === "UPDATE");
    expect(update?.path).toEqual([0, 0]);
  });
});
