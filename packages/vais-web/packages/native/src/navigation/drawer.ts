/**
 * Drawer Navigator — 드로어 기반 화면 전환.
 * openDrawer / closeDrawer / toggleDrawer / isDrawerOpen / navigate
 */

import type { ScreenConfig } from "./stack.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ScreenConfig };

export interface DrawerScreenConfig extends ScreenConfig {
  /** Optional icon for the drawer menu item. */
  icon?: string;
}

export interface DrawerConfig {
  /** Map of route names to their drawer screen configuration. */
  screens: Record<string, DrawerScreenConfig>;
  /** The route name to display first. Defaults to the first key in screens. */
  initialRoute?: string;
}

export interface DrawerState {
  /** Currently active screen name. */
  currentScreen: string;
  /** Optional params for the active screen. */
  params?: Record<string, unknown>;
}

export interface DrawerNavigator {
  /** Open the drawer panel. */
  openDrawer(): void;
  /** Close the drawer panel. */
  closeDrawer(): void;
  /** Toggle the drawer open/closed state. */
  toggleDrawer(): void;
  /** Returns true when the drawer is currently open. */
  isDrawerOpen(): boolean;
  /** Navigate to a screen, closing the drawer automatically. */
  navigate(screen: string, params?: Record<string, unknown>): void;
  /** Returns the current drawer navigation state. */
  getState(): DrawerState;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * createDrawerNavigator — factory that returns a DrawerNavigator instance.
 *
 * @param config  Drawer configuration including screens map and optional initialRoute.
 */
export function createDrawerNavigator(config: DrawerConfig): DrawerNavigator {
  const { screens, initialRoute } = config;

  const screenNames = Object.keys(screens);
  if (screenNames.length === 0) {
    throw new Error("createDrawerNavigator: screens must not be empty");
  }

  const first = initialRoute ?? screenNames[0];
  if (!screens[first]) {
    throw new Error(
      `createDrawerNavigator: initialRoute "${first}" is not defined in screens`
    );
  }

  let drawerOpen = false;
  let currentScreen = first;
  let currentParams: Record<string, unknown> | undefined;

  function assertScreen(name: string): void {
    if (!screens[name]) {
      throw new Error(`DrawerNavigator: screen "${name}" is not registered`);
    }
  }

  return {
    openDrawer() {
      drawerOpen = true;
    },

    closeDrawer() {
      drawerOpen = false;
    },

    toggleDrawer() {
      drawerOpen = !drawerOpen;
    },

    isDrawerOpen() {
      return drawerOpen;
    },

    navigate(screen, params) {
      assertScreen(screen);
      currentScreen = screen;
      currentParams = params;
      // Close the drawer when navigating, matching common UX behaviour.
      drawerOpen = false;
    },

    getState() {
      return {
        currentScreen,
        params: currentParams ? { ...currentParams } : undefined,
      };
    },
  };
}
