/**
 * Tab Navigator — 탭 기반 화면 전환.
 * switchTab / getActiveTab / getTabs
 */

import type { ScreenConfig } from "./stack.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ScreenConfig };

export interface TabScreenConfig extends ScreenConfig {
  /** Icon identifier or URI for the tab bar item. */
  icon?: string;
  /** Badge count displayed on the tab icon. */
  badge?: number;
}

export interface TabConfig {
  /** Map of route names to their tab screen configuration. */
  screens: Record<string, TabScreenConfig>;
  /** The route name to display first. Defaults to the first key in screens. */
  initialRoute?: string;
}

export interface TabInfo {
  /** Route name for this tab. */
  name: string;
  /** The tab screen config. */
  config: TabScreenConfig;
}

export interface TabNavigator {
  /** Switch to the named tab. */
  switchTab(name: string): void;
  /** Returns the currently active tab name. */
  getActiveTab(): string;
  /** Returns an ordered list of all registered tabs. */
  getTabs(): TabInfo[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * createTabNavigator — factory that returns a TabNavigator instance.
 *
 * @param config  Tab configuration including screens map and optional initialRoute.
 */
export function createTabNavigator(config: TabConfig): TabNavigator {
  const { screens, initialRoute } = config;

  const screenNames = Object.keys(screens);
  if (screenNames.length === 0) {
    throw new Error("createTabNavigator: screens must not be empty");
  }

  const first = initialRoute ?? screenNames[0];
  if (!screens[first]) {
    throw new Error(
      `createTabNavigator: initialRoute "${first}" is not defined in screens`
    );
  }

  let activeTab = first;

  function assertScreen(name: string): void {
    if (!screens[name]) {
      throw new Error(`TabNavigator: tab "${name}" is not registered`);
    }
  }

  return {
    switchTab(name) {
      assertScreen(name);
      activeTab = name;
    },

    getActiveTab() {
      return activeTab;
    },

    getTabs() {
      return screenNames.map((name) => ({ name, config: screens[name] }));
    },
  };
}
