/**
 * @vaisx/native — Public API
 *
 * Native renderer architecture: createElement / render / diff / patch + StyleSheet.
 * No external native dependencies — pure TypeScript architecture layer.
 */

// Core renderer
export {
  configure,
  getConfig,
  createElement,
  render,
  diff,
  patch,
  getTree,
  resetRenderer,
} from "./renderer.js";

// Bridge layer
export { createBridge } from "./bridge.js";
export type { Bridge, BridgeConfig } from "./bridge.js";

// StyleSheet utility
export { StyleSheet } from "./stylesheet.js";
export type { FlatStyle } from "./stylesheet.js";

// ViewMapper — VaisX 컴포넌트 → 네이티브 뷰 매핑
export { createViewMapper, PlatformMappings } from "./view-mapper.js";
export type {
  ViewMapping,
  ViewMapper,
  NativeTreeNode,
  MapperPatch,
  MapperPatchType,
  PlatformMappingTable,
} from "./view-mapper.js";

// Device APIs
export {
  createCameraAPI,
  createLocationAPI,
  createNotificationAPI,
  createBiometricsAPI,
} from "./device/index.js";
export type {
  CameraAPI,
  CameraOptions,
  CameraPermissionResult,
  PictureResult,
  PickImageResult,
  LocationAPI,
  LocationOptions,
  LocationResult,
  LocationPermissionResult,
  NotificationAPI,
  NotificationPayload,
  NotificationPermissionResult,
  BiometricsAPI,
  BiometryType,
  BiometricsAvailabilityResult,
  BiometricsAuthResult,
} from "./device/index.js";

// Native component factories
export { View, Text, Image, ScrollView, FlatList, Platform } from "./components/index.js";
export type { PlatformOS, PlatformSelectSpec } from "./components/index.js";

// Navigation — stack, tab, drawer navigators
export { createStackNavigator, createTabNavigator, createDrawerNavigator } from "./navigation/index.js";
export type {
  ScreenConfig as NavScreenConfig,
  StackConfig,
  RouteEntry,
  StackState,
  StackNavigator,
  TabScreenConfig,
  TabConfig,
  TabInfo,
  TabNavigator,
  DrawerScreenConfig,
  DrawerConfig,
  DrawerState,
  DrawerNavigator,
} from "./navigation/index.js";

// Build & Deploy
export {
  createNativeBuildConfig,
  buildForPlatform,
  createOTAManager,
  generateNativeProject,
} from "./build.js";
export type {
  NativePlatform,
  NativeBuildOptions,
  NativeBuildConfig,
  BuildArtifact,
  BuildResult,
  OTAConfig,
  UpdateCheckResult,
  DownloadResult,
  ApplyResult,
  RollbackResult,
  OTAManager,
  NativeProjectFile,
  NativeProjectStructure,
} from "./build.js";

// Type definitions
export type {
  // Element
  NativeElement,
  NativeHandle,
  NativeRef,
  // Props
  NativeViewProps,
  NativeTextProps,
  NativeImageProps,
  NativeScrollViewProps,
  NativeFlatListProps,
  RenderItemInfo,
  // Events
  PressEvent,
  ScrollEvent,
  // Bridge & config
  BridgeInterface,
  MessageHandler,
  RendererConfig,
  // Modules
  NativeModule,
  // Styles
  ViewStyle,
  TextStyle,
  ImageStyle,
  ImageSource,
  StyleValue,
  NamedStyles,
  // Patches
  Patch,
  PatchType,
  // Navigation
  NavigatorConfig,
  ScreenConfig,
} from "./types.js";
