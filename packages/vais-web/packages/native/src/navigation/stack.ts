/**
 * Stack Navigator — 스택 기반 화면 전환.
 * push / pop / replace / reset / canGoBack / getState
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenConfig {
  /** The component identifier for this screen. */
  component: string;
  /** Optional title shown in the header. */
  title?: string;
  /** Whether the header is visible (defaults to true). */
  headerShown?: boolean;
}

export interface StackConfig {
  /** Map of route names to their screen configuration. */
  screens: Record<string, ScreenConfig>;
  /** The route name to display first. Defaults to the first key in screens. */
  initialRoute?: string;
}

export interface RouteEntry {
  /** Route name. */
  name: string;
  /** Optional params passed to this route. */
  params?: Record<string, unknown>;
}

export interface StackState {
  /** Ordered list of routes in the stack (index 0 = bottom). */
  routes: RouteEntry[];
  /** Index of the currently active route. */
  index: number;
}

export interface StackNavigator {
  /** Push a new screen onto the stack. */
  push(screen: string, params?: Record<string, unknown>): void;
  /** Pop the current screen and go back to the previous one. */
  pop(): void;
  /** Replace the current screen with a new one (no history entry added). */
  replace(screen: string, params?: Record<string, unknown>): void;
  /** Reset the entire stack with a single initial screen. */
  reset(screen: string, params?: Record<string, unknown>): void;
  /** Returns true when there is at least one screen to go back to. */
  canGoBack(): boolean;
  /** Returns the current stack state. */
  getState(): StackState;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * createStackNavigator — factory that returns a StackNavigator instance.
 *
 * @param config  Stack configuration including screens map and optional initialRoute.
 */
export function createStackNavigator(config: StackConfig): StackNavigator {
  const { screens, initialRoute } = config;

  const screenNames = Object.keys(screens);
  if (screenNames.length === 0) {
    throw new Error("createStackNavigator: screens must not be empty");
  }

  const first = initialRoute ?? screenNames[0];
  if (!screens[first]) {
    throw new Error(
      `createStackNavigator: initialRoute "${first}" is not defined in screens`
    );
  }

  // Internal mutable state — plain array acting as the stack.
  let routes: RouteEntry[] = [{ name: first }];
  let index = 0;

  function assertScreen(name: string): void {
    if (!screens[name]) {
      throw new Error(`StackNavigator: screen "${name}" is not registered`);
    }
  }

  return {
    push(screen, params) {
      assertScreen(screen);
      // Truncate any forward history (same behaviour as browser history API).
      routes = routes.slice(0, index + 1);
      routes.push({ name: screen, params });
      index = routes.length - 1;
    },

    pop() {
      if (index > 0) {
        index -= 1;
        routes = routes.slice(0, index + 1);
      }
    },

    replace(screen, params) {
      assertScreen(screen);
      routes = [...routes.slice(0, index), { name: screen, params }];
      index = routes.length - 1;
    },

    reset(screen, params) {
      assertScreen(screen);
      routes = [{ name: screen, params }];
      index = 0;
    },

    canGoBack() {
      return index > 0;
    },

    getState() {
      return { routes: routes.map((r) => ({ ...r })), index };
    },
  };
}
