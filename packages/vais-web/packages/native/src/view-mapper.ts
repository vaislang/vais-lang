/**
 * ViewMapper — VaisX 컴포넌트 → 네이티브 뷰 매핑
 *
 * iOS/Android 플랫폼별로 VaisX 컴포넌트 타입을 해당 네이티브 뷰 클래스에 매핑하고,
 * 엘리먼트 트리 변환 및 증분 업데이트(diff → patch) 기능을 제공합니다.
 */

import type { NativeElement, Patch } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 네이티브 뷰 매핑 정의 */
export interface ViewMapping {
  /** 플랫폼 네이티브 뷰 클래스 이름 */
  nativeType: string;
  /** props 변환 함수 (선택적) */
  propTransform?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** 자식 요소 허용 여부 */
  childrenAllowed: boolean;
}

/** 변환된 네이티브 트리 노드 */
export interface NativeTreeNode {
  nativeType: string;
  props: Record<string, unknown>;
  children: NativeTreeNode[];
  key?: string | number;
}

/** 증분 업데이트 패치 타입 */
export type MapperPatchType = "ADD" | "REMOVE" | "UPDATE" | "MOVE";

/** 증분 업데이트 패치 */
export interface MapperPatch {
  type: MapperPatchType;
  /** 루트로부터의 경로 (레벨별 인덱스) */
  path: number[];
  /** 추가/업데이트 대상 노드 */
  node?: NativeTreeNode;
  /** 업데이트된 props */
  props?: Record<string, unknown>;
  /** MOVE 패치의 새 인덱스 */
  newIndex?: number;
}

/** 플랫폼별 매핑 테이블 타입 */
export type PlatformMappingTable = Record<string, ViewMapping>;

// ---------------------------------------------------------------------------
// PlatformMappings — 기본 매핑 상수
// ---------------------------------------------------------------------------

/** iOS 기본 컴포넌트 → 네이티브 뷰 매핑 */
export const PlatformMappings: {
  ios: PlatformMappingTable;
  android: PlatformMappingTable;
} = {
  ios: {
    View: {
      nativeType: "UIView",
      childrenAllowed: true,
    },
    Text: {
      nativeType: "UILabel",
      childrenAllowed: true,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["numberOfLines"] !== undefined) {
          transformed["numberOfLines"] = props["numberOfLines"];
        }
        if (props["ellipsizeMode"] !== undefined) {
          transformed["lineBreakMode"] = props["ellipsizeMode"];
        }
        return transformed;
      },
    },
    Image: {
      nativeType: "UIImageView",
      childrenAllowed: false,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["source"] !== undefined) {
          const source = props["source"];
          if (typeof source === "object" && source !== null && "uri" in source) {
            transformed["imageURL"] = (source as { uri: string }).uri;
          } else {
            transformed["imageResource"] = source;
          }
        }
        return transformed;
      },
    },
    ScrollView: {
      nativeType: "UIScrollView",
      childrenAllowed: true,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["showsScrollIndicator"] !== undefined) {
          transformed["showsVerticalScrollIndicator"] = props["showsScrollIndicator"];
          transformed["showsHorizontalScrollIndicator"] = props["showsScrollIndicator"];
        }
        return transformed;
      },
    },
    FlatList: {
      nativeType: "UITableView",
      childrenAllowed: true,
    },
    TextInput: {
      nativeType: "UITextField",
      childrenAllowed: false,
    },
    TouchableOpacity: {
      nativeType: "UIControl",
      childrenAllowed: true,
    },
    Button: {
      nativeType: "UIButton",
      childrenAllowed: false,
    },
    Modal: {
      nativeType: "UIViewController",
      childrenAllowed: true,
    },
    ActivityIndicator: {
      nativeType: "UIActivityIndicatorView",
      childrenAllowed: false,
    },
    Switch: {
      nativeType: "UISwitch",
      childrenAllowed: false,
    },
  },
  android: {
    View: {
      nativeType: "android.view.View",
      childrenAllowed: true,
    },
    Text: {
      nativeType: "android.widget.TextView",
      childrenAllowed: true,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["numberOfLines"] !== undefined) {
          transformed["maxLines"] = props["numberOfLines"];
        }
        if (props["ellipsizeMode"] !== undefined) {
          const modeMap: Record<string, string> = {
            head: "START",
            middle: "MIDDLE",
            tail: "END",
            clip: "CLIP",
          };
          const mode = props["ellipsizeMode"] as string;
          transformed["ellipsize"] = modeMap[mode] ?? "END";
        }
        return transformed;
      },
    },
    Image: {
      nativeType: "android.widget.ImageView",
      childrenAllowed: false,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["source"] !== undefined) {
          const source = props["source"];
          if (typeof source === "object" && source !== null && "uri" in source) {
            transformed["imageURI"] = (source as { uri: string }).uri;
          } else {
            transformed["imageResource"] = source;
          }
        }
        return transformed;
      },
    },
    ScrollView: {
      nativeType: "android.widget.ScrollView",
      childrenAllowed: true,
      propTransform: (props) => {
        const transformed: Record<string, unknown> = { ...props };
        if (props["horizontal"] === true) {
          transformed["nativeType"] = "android.widget.HorizontalScrollView";
        }
        return transformed;
      },
    },
    FlatList: {
      nativeType: "androidx.recyclerview.widget.RecyclerView",
      childrenAllowed: true,
    },
    TextInput: {
      nativeType: "android.widget.EditText",
      childrenAllowed: false,
    },
    TouchableOpacity: {
      nativeType: "android.view.ViewGroup",
      childrenAllowed: true,
    },
    Button: {
      nativeType: "android.widget.Button",
      childrenAllowed: false,
    },
    Modal: {
      nativeType: "android.app.Dialog",
      childrenAllowed: true,
    },
    ActivityIndicator: {
      nativeType: "android.widget.ProgressBar",
      childrenAllowed: false,
    },
    Switch: {
      nativeType: "android.widget.Switch",
      childrenAllowed: false,
    },
  },
};

// ---------------------------------------------------------------------------
// ViewMapper
// ---------------------------------------------------------------------------

/** createViewMapper가 반환하는 뷰 매퍼 인터페이스 */
export interface ViewMapper {
  /** VaisX 컴포넌트 타입과 props를 네이티브 뷰 정보로 변환 */
  mapComponent(
    type: string,
    props: Record<string, unknown>
  ): { nativeType: string; nativeProps: Record<string, unknown>; childrenAllowed: boolean };
  /** 커스텀 컴포넌트 매핑 등록 */
  registerCustomMapping(component: string, mapping: ViewMapping): void;
  /** VaisX 엘리먼트 트리 → 네이티브 트리 변환 (재귀) */
  createNativeTree(element: NativeElement): NativeTreeNode;
  /** 증분 업데이트 계산 — 변경된 노드만 패치 목록 생성 */
  incrementalUpdate(oldTree: NativeTreeNode | null, newTree: NativeTreeNode | null): MapperPatch[];
}

/**
 * 플랫폼별 뷰 매퍼를 생성합니다.
 *
 * @param platform - 대상 플랫폼 ("ios" | "android")
 */
export function createViewMapper(platform: "ios" | "android"): ViewMapper {
  // 플랫폼 기본 매핑을 복사하여 커스텀 등록이 격리되도록 합니다.
  const mappings: PlatformMappingTable = { ...PlatformMappings[platform] };

  // -------------------------------------------------------------------------
  // mapComponent
  // -------------------------------------------------------------------------
  function mapComponent(
    type: string,
    props: Record<string, unknown>
  ): { nativeType: string; nativeProps: Record<string, unknown>; childrenAllowed: boolean } {
    const mapping = mappings[type];

    if (mapping == null) {
      // 알 수 없는 컴포넌트는 플랫폼 기본 컨테이너 뷰로 폴백합니다.
      const fallbackType =
        platform === "ios" ? "UIView" : "android.view.ViewGroup";
      return {
        nativeType: fallbackType,
        nativeProps: { ...props },
        childrenAllowed: true,
      };
    }

    const nativeProps = mapping.propTransform
      ? mapping.propTransform({ ...props })
      : { ...props };

    return {
      nativeType: mapping.nativeType,
      nativeProps,
      childrenAllowed: mapping.childrenAllowed,
    };
  }

  // -------------------------------------------------------------------------
  // registerCustomMapping
  // -------------------------------------------------------------------------
  function registerCustomMapping(component: string, mapping: ViewMapping): void {
    mappings[component] = mapping;
  }

  // -------------------------------------------------------------------------
  // createNativeTree
  // -------------------------------------------------------------------------
  function createNativeTree(element: NativeElement): NativeTreeNode {
    const { nativeType, nativeProps, childrenAllowed } = mapComponent(
      element.type,
      element.props
    );

    const nativeChildren: NativeTreeNode[] = [];

    if (childrenAllowed) {
      for (const child of element.children) {
        if (child !== null && typeof child === "object") {
          nativeChildren.push(createNativeTree(child as NativeElement));
        }
        // 문자열/숫자 원시 자식은 현재 노드의 props.text에 반영하지 않고 무시합니다.
        // (Text 컴포넌트 내부에서는 children을 props로 처리하는 패턴은 상위에서 담당)
      }
    }

    return {
      nativeType,
      props: nativeProps,
      children: nativeChildren,
      key: element.key,
    };
  }

  // -------------------------------------------------------------------------
  // incrementalUpdate helpers
  // -------------------------------------------------------------------------

  function propsEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  function diffProps(
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>
  ): Record<string, unknown> | null {
    const changes: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
    for (const key of allKeys) {
      if (oldProps[key] !== newProps[key]) {
        changes[key] = newProps[key];
      }
    }
    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * 두 NativeTreeNode를 재귀적으로 비교하여 MapperPatch 목록을 생성합니다.
   */
  function diffTrees(
    oldNode: NativeTreeNode | null,
    newNode: NativeTreeNode | null,
    path: number[],
    patches: MapperPatch[]
  ): void {
    if (oldNode === null && newNode === null) return;

    if (oldNode === null && newNode !== null) {
      patches.push({ type: "ADD", path, node: newNode });
      return;
    }

    if (oldNode !== null && newNode === null) {
      patches.push({ type: "REMOVE", path });
      return;
    }

    // 타입이 다르면 전체 교체 (REMOVE + ADD)
    if (oldNode!.nativeType !== newNode!.nativeType) {
      patches.push({ type: "REMOVE", path });
      patches.push({ type: "ADD", path, node: newNode! });
      return;
    }

    // 같은 타입 — props 비교
    const propChanges = diffProps(oldNode!.props, newNode!.props);
    if (propChanges !== null) {
      patches.push({ type: "UPDATE", path, props: propChanges });
    }

    // 자식 비교 — key 기반 매칭을 우선, 없으면 인덱스 기반
    const oldChildren = oldNode!.children;
    const newChildren = newNode!.children;

    // key가 있는 자식은 key로 매칭
    const oldByKey = new Map<string | number, { node: NativeTreeNode; idx: number }>();
    const oldNoKey: Array<{ node: NativeTreeNode; idx: number }> = [];

    for (let i = 0; i < oldChildren.length; i++) {
      const child = oldChildren[i]!;
      if (child.key !== undefined) {
        oldByKey.set(child.key, { node: child, idx: i });
      } else {
        oldNoKey.push({ node: child, idx: i });
      }
    }

    let noKeyOldIdx = 0;

    for (let i = 0; i < newChildren.length; i++) {
      const newChild = newChildren[i]!;
      const childPath = [...path, i];

      if (newChild.key !== undefined) {
        const matched = oldByKey.get(newChild.key);
        if (matched) {
          // key 매칭됨 — 위치가 다르면 MOVE
          if (matched.idx !== i) {
            patches.push({ type: "MOVE", path: childPath, newIndex: i });
          }
          diffTrees(matched.node, newChild, childPath, patches);
          oldByKey.delete(newChild.key);
        } else {
          // 새 key — ADD
          patches.push({ type: "ADD", path: childPath, node: newChild });
        }
      } else {
        // key 없음 — 인덱스 기반 매칭
        const matchedEntry = oldNoKey[noKeyOldIdx];
        if (matchedEntry) {
          diffTrees(matchedEntry.node, newChild, childPath, patches);
          noKeyOldIdx++;
        } else {
          patches.push({ type: "ADD", path: childPath, node: newChild });
        }
      }
    }

    // 남은 key 매칭 안 된 oldChildren → REMOVE
    for (const [, { idx }] of oldByKey) {
      patches.push({ type: "REMOVE", path: [...path, idx] });
    }

    // 남은 인덱스 기반 old 자식 → REMOVE
    for (let i = noKeyOldIdx; i < oldNoKey.length; i++) {
      const entry = oldNoKey[i];
      if (entry) {
        patches.push({ type: "REMOVE", path: [...path, entry.idx] });
      }
    }
  }

  // -------------------------------------------------------------------------
  // incrementalUpdate
  // -------------------------------------------------------------------------
  function incrementalUpdate(
    oldTree: NativeTreeNode | null,
    newTree: NativeTreeNode | null
  ): MapperPatch[] {
    const patches: MapperPatch[] = [];
    diffTrees(oldTree, newTree, [], patches);
    return patches;
  }

  return {
    mapComponent,
    registerCustomMapping,
    createNativeTree,
    incrementalUpdate,
  };
}
