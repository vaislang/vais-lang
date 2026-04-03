/**
 * Core type definitions for @vaisx/native.
 * API inspired by React Native — architecture only, no external native dependencies.
 */

// ---------------------------------------------------------------------------
// Style primitives
// ---------------------------------------------------------------------------

/** Flexible style value — number (dp) or string (e.g. "50%", "auto"). */
export type StyleValue = number | string;

/** Subset of layout / visual style properties used across native components. */
export interface ViewStyle {
  // Layout
  flex?: number;
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "wrap" | "nowrap" | "wrap-reverse";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  position?: "relative" | "absolute";
  top?: StyleValue;
  right?: StyleValue;
  bottom?: StyleValue;
  left?: StyleValue;
  width?: StyleValue;
  height?: StyleValue;
  minWidth?: StyleValue;
  minHeight?: StyleValue;
  maxWidth?: StyleValue;
  maxHeight?: StyleValue;
  margin?: StyleValue;
  marginTop?: StyleValue;
  marginRight?: StyleValue;
  marginBottom?: StyleValue;
  marginLeft?: StyleValue;
  marginHorizontal?: StyleValue;
  marginVertical?: StyleValue;
  padding?: StyleValue;
  paddingTop?: StyleValue;
  paddingRight?: StyleValue;
  paddingBottom?: StyleValue;
  paddingLeft?: StyleValue;
  paddingHorizontal?: StyleValue;
  paddingVertical?: StyleValue;
  // Visual
  backgroundColor?: string;
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  overflow?: "visible" | "hidden" | "scroll";
  zIndex?: number;
  // Shadow (iOS)
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  // Elevation (Android)
  elevation?: number;
}

export interface TextStyle extends ViewStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
  fontStyle?: "normal" | "italic";
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "auto" | "left" | "right" | "center" | "justify";
  textDecorationLine?: "none" | "underline" | "line-through" | "underline line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
}

export interface ImageStyle extends ViewStyle {
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
}

// ---------------------------------------------------------------------------
// Core element
// ---------------------------------------------------------------------------

/** Represents a node in the native render tree. */
export interface NativeElement {
  /** Component type — built-in string tag or component function name. */
  type: string;
  /** Props passed to the component. */
  props: Record<string, unknown>;
  /** Child elements or primitive values. */
  children: Array<NativeElement | string | number | null>;
  /** Optional reconciliation key. */
  key?: string | number;
  /** Optional ref callback or ref object. */
  ref?: NativeRef | null;
}

/** Ref object or callback used to hold a reference to a native node handle. */
export type NativeRef =
  | { current: NativeHandle | null }
  | ((handle: NativeHandle | null) => void);

/** Opaque handle representing a mounted native view. */
export type NativeHandle = number;

// ---------------------------------------------------------------------------
// Component prop interfaces
// ---------------------------------------------------------------------------

/** Press event passed to onPress / onLongPress handlers. */
export interface PressEvent {
  nativeEvent: {
    locationX: number;
    locationY: number;
    pageX: number;
    pageY: number;
    timestamp: number;
  };
}

/** Props accepted by the native View component. */
export interface NativeViewProps {
  style?: ViewStyle | ViewStyle[];
  onPress?: (event: PressEvent) => void;
  onLongPress?: (event: PressEvent) => void;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  pointerEvents?: "box-none" | "none" | "box-only" | "auto";
}

/** Props accepted by the native Text component. */
export interface NativeTextProps {
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  ellipsizeMode?: "head" | "middle" | "tail" | "clip";
  selectable?: boolean;
  onPress?: (event: PressEvent) => void;
  testID?: string;
}

/** Source descriptor for the native Image component. */
export type ImageSource = { uri: string; headers?: Record<string, string> } | number;

/** Props accepted by the native Image component. */
export interface NativeImageProps {
  source: ImageSource;
  style?: ImageStyle | ImageStyle[];
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  onLoad?: () => void;
  onError?: (error: { nativeEvent: { error: string } }) => void;
  testID?: string;
}

/** Scroll event payload. */
export interface ScrollEvent {
  nativeEvent: {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  };
}

/** Props accepted by the native ScrollView component. */
export interface NativeScrollViewProps {
  style?: ViewStyle | ViewStyle[];
  horizontal?: boolean;
  showsScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  onScroll?: (event: ScrollEvent) => void;
  scrollEventThrottle?: number;
  bounces?: boolean;
  pagingEnabled?: boolean;
  testID?: string;
}

/** Descriptor for an individual FlatList item render call. */
export interface RenderItemInfo<T> {
  item: T;
  index: number;
  separators: {
    highlight: () => void;
    unhighlight: () => void;
  };
}

/** Props accepted by the native FlatList component. */
export interface NativeFlatListProps<T> {
  data: ReadonlyArray<T>;
  renderItem: (info: RenderItemInfo<T>) => NativeElement | null;
  keyExtractor?: (item: T, index: number) => string;
  style?: ViewStyle | ViewStyle[];
  contentContainerStyle?: ViewStyle | ViewStyle[];
  horizontal?: boolean;
  numColumns?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListEmptyComponent?: NativeElement | null;
  ListHeaderComponent?: NativeElement | null;
  ListFooterComponent?: NativeElement | null;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Bridge & renderer config
// ---------------------------------------------------------------------------

/** Handler function invoked when a message arrives from the native side. */
export type MessageHandler = (type: string, payload: unknown) => void;

/**
 * Bridge interface — the communication channel between JS and the native layer.
 * Implementations are platform-specific (iOS / Android).
 */
export interface BridgeInterface {
  /** Send a message to the native side. */
  sendMessage(type: string, payload: unknown): void;
  /** Register a handler for incoming native messages. */
  onMessage(handler: MessageHandler): void;
  /**
   * Invoke a method on a registered native module and return the result
   * asynchronously.
   */
  callNative(module: string, method: string, args: unknown[]): Promise<unknown>;
}

/** Configuration passed to the NativeRenderer when bootstrapping. */
export interface RendererConfig {
  /** Target platform. */
  platform: "ios" | "android";
  /** Bridge instance connecting JS to native. */
  bridge: BridgeInterface;
  /** Enable verbose renderer logging (development only). */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Native modules
// ---------------------------------------------------------------------------

/** A native module exposed to JavaScript through the bridge. */
export interface NativeModule {
  /** Unique module name (matches the native-side registration name). */
  name: string;
  /** Map of method names to their JS-callable implementations. */
  methods: Record<string, (...args: unknown[]) => unknown>;
}

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

/**
 * Named collection of styles — values are either raw style objects or
 * style IDs (numbers) returned after registration with StyleSheet.create().
 */
export type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/** The StyleSheet utility interface — mirrors the React Native StyleSheet API. */
export interface StyleSheet {
  /**
   * Register a set of named styles and return an opaque style-ID map.
   * At runtime the IDs are used instead of repeated inline objects.
   */
  create<T extends NamedStyles<T>>(styles: T): { [P in keyof T]: number };
  /**
   * Merge one or more style objects (or IDs) into a single flat object.
   * Falsy values are safely ignored.
   */
  flatten(
    styles:
      | ViewStyle
      | TextStyle
      | ImageStyle
      | number
      | Array<ViewStyle | TextStyle | ImageStyle | number | null | undefined | false>
      | null
      | undefined
  ): ViewStyle & TextStyle & ImageStyle;
  /** Shorthand preset: `{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }` */
  readonly absoluteFill: ViewStyle;
  /** Same values as absoluteFill exposed as a registered style ID. */
  readonly absoluteFillObject: ViewStyle;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** A single screen definition within a navigator. */
export interface ScreenConfig {
  /** Route name used for navigation. */
  name: string;
  /** Component to render for this screen. */
  component: string;
  /** Optional screen-level options (title, header config, etc.). */
  options?: Record<string, unknown>;
}

/** Configuration for a navigator (stack, tab, or drawer). */
export interface NavigatorConfig {
  /** Navigator variant. */
  type: "stack" | "tab" | "drawer";
  /** Array of screen definitions included in this navigator. */
  screens: ScreenConfig[];
  /** Route name to display first (defaults to the first screen). */
  initialRoute?: string;
  /** Navigator-level options forwarded to the underlying native navigator. */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Patch types (used by the reconciler)
// ---------------------------------------------------------------------------

export type PatchType = "CREATE" | "UPDATE" | "DELETE" | "REPLACE" | "REORDER";

/** A single diff operation produced by the reconciler. */
export interface Patch {
  type: PatchType;
  /** Path from the root container to the affected node (index per level). */
  path: number[];
  /** New element to create or replace with (CREATE / REPLACE). */
  element?: NativeElement;
  /** Props to update (UPDATE). */
  props?: Record<string, unknown>;
  /** New child order (REORDER). */
  order?: number[];
}
