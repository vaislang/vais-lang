/**
 * @vaisx/native — Build & Deploy utilities
 *
 * Provides:
 *  - createNativeBuildConfig  — build configuration factory
 *  - buildForPlatform         — platform-specific build simulation
 *  - createOTAManager         — OTA update lifecycle manager
 *  - generateNativeProject    — native project file structure generator
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NativePlatform = "ios" | "android" | "both";

/** Options passed to createNativeBuildConfig. */
export interface NativeBuildOptions {
  /** Target platform(s). */
  platform: NativePlatform;
  /** Entry point file path (e.g. "src/index.ts"). */
  entry: string;
  /** Output directory for build artifacts. */
  outDir: string;
  /** Enable minification (default: false). */
  minify?: boolean;
  /** Emit source maps (default: false). */
  sourcemap?: boolean;
}

/** Resolved build configuration (immutable snapshot). */
export interface NativeBuildConfig {
  platform: NativePlatform;
  entry: string;
  outDir: string;
  minify: boolean;
  sourcemap: boolean;
}

/** Metadata for a single build artifact. */
export interface BuildArtifact {
  /** Artifact type — JS bundle, asset, or native config file. */
  type: "bundle" | "asset" | "config";
  /** File path relative to outDir. */
  path: string;
  /** Byte size (simulated). */
  size: number;
  /** Target platform of this artifact. */
  platform: "ios" | "android";
}

/** Result returned after running a build. */
export interface BuildResult {
  /** Whether the build completed without errors. */
  success: boolean;
  /** List of produced artifacts. */
  artifacts: BuildArtifact[];
  /** Wall-clock duration in milliseconds (simulated). */
  duration: number;
  /** Non-empty when success is false. */
  errors: string[];
}

/** OTA update manager configuration. */
export interface OTAConfig {
  /** Remote endpoint that serves update manifests. */
  updateUrl: string;
  /** Release channel used to filter updates. */
  channel?: "production" | "staging";
  /** Polling interval in milliseconds (default: 3_600_000 — 1 hour). */
  checkInterval?: number;
}

/** Result of checking for an available OTA update. */
export interface UpdateCheckResult {
  /** Whether a newer version is available. */
  available: boolean;
  /** New version string when available. */
  version?: string;
  /** Signed download URL for the new bundle when available. */
  downloadUrl?: string;
}

/** Result of downloading an OTA bundle. */
export interface DownloadResult {
  success: boolean;
  /** Local path to the downloaded bundle file. */
  bundlePath?: string;
}

/** Result of applying a previously-downloaded OTA bundle. */
export interface ApplyResult {
  success: boolean;
  /** Whether the app must restart to load the new bundle. */
  restartRequired: boolean;
}

/** Result of rolling back to the previous bundle. */
export interface RollbackResult {
  success: boolean;
}

/** OTA update manager instance returned by createOTAManager. */
export interface OTAManager {
  checkForUpdate(): Promise<UpdateCheckResult>;
  downloadUpdate(url: string): Promise<DownloadResult>;
  applyUpdate(bundlePath: string): Promise<ApplyResult>;
  getCurrentVersion(): string;
  rollback(): Promise<RollbackResult>;
}

/** A generated file in a native project template. */
export interface NativeProjectFile {
  /** File path relative to the project root. */
  path: string;
  /** File contents (template string). */
  content: string;
}

/** Generated native project structure. */
export interface NativeProjectStructure {
  /** Target platform. */
  platform: "ios" | "android";
  /** List of generated template files. */
  files: NativeProjectFile[];
}

// ---------------------------------------------------------------------------
// createNativeBuildConfig
// ---------------------------------------------------------------------------

/**
 * Creates an immutable build configuration from the supplied options,
 * applying defaults for optional fields.
 *
 * @throws {Error} if required fields are missing or invalid.
 */
export function createNativeBuildConfig(options: NativeBuildOptions): NativeBuildConfig {
  if (!options.entry || options.entry.trim() === "") {
    throw new Error("NativeBuildOptions.entry must be a non-empty string.");
  }
  if (!options.outDir || options.outDir.trim() === "") {
    throw new Error("NativeBuildOptions.outDir must be a non-empty string.");
  }
  const validPlatforms: NativePlatform[] = ["ios", "android", "both"];
  if (!validPlatforms.includes(options.platform)) {
    throw new Error(`NativeBuildOptions.platform must be one of: ${validPlatforms.join(", ")}.`);
  }

  return {
    platform: options.platform,
    entry: options.entry.trim(),
    outDir: options.outDir.trim(),
    minify: options.minify ?? false,
    sourcemap: options.sourcemap ?? false,
  };
}

// ---------------------------------------------------------------------------
// buildForPlatform — simulation
// ---------------------------------------------------------------------------

/**
 * Simulates a platform-specific build based on the given config.
 *
 * Steps (simulated):
 *   1. JS bundle generation (metadata only)
 *   2. Asset collection
 *   3. Native project config file generation
 *
 * When platform is "both", builds are produced for both iOS and Android.
 */
export async function buildForPlatform(config: NativeBuildConfig): Promise<BuildResult> {
  const startTime = Date.now();
  const artifacts: BuildArtifact[] = [];
  const errors: string[] = [];

  try {
    const platforms: Array<"ios" | "android"> =
      config.platform === "both" ? ["ios", "android"] : [config.platform];

    for (const platform of platforms) {
      // 1. JS bundle (metadata only)
      const bundleFileName =
        platform === "ios" ? "main.ios.jsbundle" : "index.android.bundle";
      const bundleSize = config.minify
        ? _simulateBundleSize(config.entry, true)
        : _simulateBundleSize(config.entry, false);

      artifacts.push({
        type: "bundle",
        path: `${bundleFileName}`,
        size: bundleSize,
        platform,
      });

      // Optionally emit a source map
      if (config.sourcemap) {
        artifacts.push({
          type: "bundle",
          path: `${bundleFileName}.map`,
          size: Math.round(bundleSize * 2.5),
          platform,
        });
      }

      // 2. Asset collection (simulated static assets)
      const simulatedAssets = _collectAssets(config.outDir, platform);
      artifacts.push(...simulatedAssets);

      // 3. Native project config generation
      const configFiles = _generateNativeConfigs(platform, config);
      artifacts.push(...configFiles);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const duration = Date.now() - startTime;

  return {
    success: errors.length === 0,
    artifacts,
    duration,
    errors,
  };
}

// ---------------------------------------------------------------------------
// createOTAManager
// ---------------------------------------------------------------------------

/**
 * Creates an OTA update manager scoped to the supplied configuration.
 *
 * All network calls are simulated — no actual HTTP requests are made.
 * Internally tracks a "current version" and a "previous version" for rollback.
 */
export function createOTAManager(config: OTAConfig): OTAManager {
  if (!config.updateUrl || config.updateUrl.trim() === "") {
    throw new Error("OTAConfig.updateUrl must be a non-empty string.");
  }

  const channel = config.channel ?? "production";
  const _checkInterval = config.checkInterval ?? 3_600_000;

  // Internal mutable state (simulated)
  let _currentVersion = "1.0.0";
  let _previousVersion: string | null = null;
  let _pendingBundlePath: string | null = null;

  return {
    /**
     * Simulates checking the remote update endpoint for a newer version.
     * Returns available=true with a synthetic version if a remote version
     * is "newer" than the current one (simulated by comparing patch numbers).
     */
    async checkForUpdate(): Promise<UpdateCheckResult> {
      // Simulate network latency
      await _simulateDelay(50);

      // Simulate: remote always advertises the next patch version
      const [major, minor, patch] = _currentVersion.split(".").map(Number);
      const remoteVersion = `${major}.${minor}.${(patch ?? 0) + 1}`;

      // Simulate that staging channel always has an update available
      const available = channel === "staging" ? true : _isNewerVersion(remoteVersion, _currentVersion);

      if (!available) {
        return { available: false };
      }

      return {
        available: true,
        version: remoteVersion,
        downloadUrl: `${config.updateUrl.replace(/\/$/, "")}/${channel}/${remoteVersion}/bundle.js`,
      };
    },

    /**
     * Simulates downloading a bundle from the given URL.
     * Validates URL format and returns a synthetic local bundle path.
     */
    async downloadUpdate(url: string): Promise<DownloadResult> {
      await _simulateDelay(100);

      if (!url || !url.startsWith("http")) {
        return { success: false };
      }

      // Derive a deterministic local path from the URL
      const fileName = url.split("/").pop() ?? "bundle.js";
      const bundlePath = `/tmp/ota-updates/${fileName}`;
      _pendingBundlePath = bundlePath;

      return { success: true, bundlePath };
    },

    /**
     * Applies a downloaded bundle.
     * Updates the internal version state and marks a restart as required.
     */
    async applyUpdate(bundlePath: string): Promise<ApplyResult> {
      await _simulateDelay(30);

      if (!bundlePath || bundlePath.trim() === "") {
        return { success: false, restartRequired: false };
      }

      // Detect version from path (best-effort)
      const versionMatch = bundlePath.match(/(\d+\.\d+\.\d+)/);
      const newVersion = versionMatch ? versionMatch[1] : _incrementPatch(_currentVersion);

      _previousVersion = _currentVersion;
      _currentVersion = newVersion ?? _incrementPatch(_currentVersion);
      _pendingBundlePath = null;

      return { success: true, restartRequired: true };
    },

    /** Returns the currently active bundle version string. */
    getCurrentVersion(): string {
      return _currentVersion;
    },

    /**
     * Rolls back to the previous version.
     * Fails if no previous version is recorded (i.e. no update has been applied).
     */
    async rollback(): Promise<RollbackResult> {
      await _simulateDelay(30);

      if (_previousVersion === null) {
        return { success: false };
      }

      _currentVersion = _previousVersion;
      _previousVersion = null;
      _pendingBundlePath = null;

      return { success: true };
    },
  };
}

// ---------------------------------------------------------------------------
// generateNativeProject
// ---------------------------------------------------------------------------

/**
 * Generates a native project file structure for the given platform.
 *
 * iOS:   produces Info.plist and Podfile templates.
 * Android: produces build.gradle and AndroidManifest.xml templates.
 */
export function generateNativeProject(
  platform: "ios" | "android",
  config: NativeBuildConfig
): NativeProjectStructure {
  const appName = _deriveAppName(config.entry);

  if (platform === "ios") {
    return {
      platform: "ios",
      files: [
        {
          path: "ios/Info.plist",
          content: _generateInfoPlist(appName),
        },
        {
          path: "ios/Podfile",
          content: _generatePodfile(appName),
        },
      ],
    };
  }

  // android
  return {
    platform: "android",
    files: [
      {
        path: "android/app/build.gradle",
        content: _generateBuildGradle(appName),
      },
      {
        path: "android/app/src/main/AndroidManifest.xml",
        content: _generateAndroidManifest(appName),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Simulates async network/disk latency. */
function _simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns a simulated JS bundle size in bytes. */
function _simulateBundleSize(entry: string, minified: boolean): number {
  const base = 512_000 + entry.length * 100;
  return minified ? Math.round(base * 0.35) : base;
}

/** Simulates scanning outDir for static assets. */
function _collectAssets(outDir: string, platform: "ios" | "android"): BuildArtifact[] {
  return [
    { type: "asset", path: "assets/images/icon.png", size: 4_096, platform },
    { type: "asset", path: "assets/images/splash.png", size: 8_192, platform },
    { type: "asset", path: "assets/fonts/Inter.ttf", size: 65_536, platform },
  ];
}

/** Generates native config file artifacts based on the build config. */
function _generateNativeConfigs(
  platform: "ios" | "android",
  config: NativeBuildConfig
): BuildArtifact[] {
  if (platform === "ios") {
    return [
      { type: "config", path: "ios/Info.plist", size: 1_024, platform },
      { type: "config", path: "ios/Podfile", size: 512, platform },
    ];
  }
  return [
    { type: "config", path: "android/app/build.gradle", size: 2_048, platform },
    { type: "config", path: "android/app/src/main/AndroidManifest.xml", size: 1_024, platform },
  ];
}

/** Returns true if versionA is strictly newer than versionB (semver). */
function _isNewerVersion(versionA: string, versionB: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(versionA);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(versionB);

  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}

/** Increments the patch segment of a semver string. */
function _incrementPatch(version: string): string {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/** Derives a human-readable app name from the entry file path. */
function _deriveAppName(entry: string): string {
  const base = entry
    .split("/")
    .pop()
    ?.replace(/\.[^/.]+$/, "") ?? "VaisApp";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------------------------------------------------------------------------
// Template generators
// ---------------------------------------------------------------------------

function _generateInfoPlist(appName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
  <key>UILaunchStoryboardName</key>
  <string>LaunchScreen</string>
  <key>UIRequiredDeviceCapabilities</key>
  <array>
    <string>armv7</string>
  </array>
  <key>UISupportedInterfaceOrientations</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>
</dict>
</plist>
`;
}

function _generatePodfile(appName: string): string {
  return `# Podfile — generated by @vaisx/native
require_relative '../node_modules/react-native/scripts/react_native_pods'
require_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'

platform :ios, '13.0'
install! 'cocoapods', :deterministic_uuids => false

target '${appName}' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
    :fabric_enabled => false
  )

  target '${appName}Tests' do
    inherit! :complete
  end

  post_install do |installer|
    react_native_post_install(installer)
    __apply_Xcode_12_5_M1_post_install_workaround(installer)
  end
end
`;
}

function _generateBuildGradle(appName: string): string {
  return `// build.gradle — generated by @vaisx/native
apply plugin: "com.android.application"

android {
    compileSdkVersion 34
    defaultConfig {
        applicationId "com.vaisx.${appName.toLowerCase()}"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}

dependencies {
    implementation "com.facebook.react:react-native:+"
    implementation "androidx.appcompat:appcompat:1.6.1"
    implementation "com.google.android.material:material:1.9.0"
}
`;
}

function _generateAndroidManifest(appName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- AndroidManifest.xml — generated by @vaisx/native -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.vaisx.${appName.toLowerCase()}">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".MainApplication"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:allowBackup="false"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:label="@string/app_name"
            android:configChanges="keyboard|keyboardHidden|orientation|screenSize|uiMode"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}
