/**
 * Tests for Navigation: stack, tab, and drawer navigators.
 * Target: 25+ passing tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createStackNavigator } from "../src/navigation/stack.js";
import { createTabNavigator } from "../src/navigation/tabs.js";
import { createDrawerNavigator } from "../src/navigation/drawer.js";
import type { StackConfig, StackNavigator } from "../src/navigation/stack.js";
import type { TabConfig, TabNavigator } from "../src/navigation/tabs.js";
import type { DrawerConfig, DrawerNavigator } from "../src/navigation/drawer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStackConfig(): StackConfig {
  return {
    screens: {
      Home: { component: "HomeScreen", title: "Home" },
      Profile: { component: "ProfileScreen", title: "Profile" },
      Settings: { component: "SettingsScreen", title: "Settings", headerShown: false },
    },
    initialRoute: "Home",
  };
}

function makeTabConfig(): TabConfig {
  return {
    screens: {
      Feed: { component: "FeedScreen", title: "Feed", icon: "home", badge: 0 },
      Search: { component: "SearchScreen", title: "Search", icon: "search" },
      Inbox: { component: "InboxScreen", title: "Inbox", icon: "mail", badge: 3 },
    },
    initialRoute: "Feed",
  };
}

function makeDrawerConfig(): DrawerConfig {
  return {
    screens: {
      Dashboard: { component: "DashboardScreen", title: "Dashboard" },
      Reports: { component: "ReportsScreen", title: "Reports" },
      Account: { component: "AccountScreen", title: "Account" },
    },
    initialRoute: "Dashboard",
  };
}

// ===========================================================================
// Stack Navigator
// ===========================================================================

describe("createStackNavigator", () => {
  let stack: StackNavigator;

  beforeEach(() => {
    stack = createStackNavigator(makeStackConfig());
  });

  it("returns an object with push, pop, replace, reset, canGoBack, and getState", () => {
    expect(typeof stack.push).toBe("function");
    expect(typeof stack.pop).toBe("function");
    expect(typeof stack.replace).toBe("function");
    expect(typeof stack.reset).toBe("function");
    expect(typeof stack.canGoBack).toBe("function");
    expect(typeof stack.getState).toBe("function");
  });

  it("initialises at the configured initialRoute", () => {
    const state = stack.getState();
    expect(state.index).toBe(0);
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0].name).toBe("Home");
  });

  it("defaults to the first screen when initialRoute is not provided", () => {
    const s = createStackNavigator({
      screens: {
        Alpha: { component: "AlphaScreen" },
        Beta: { component: "BetaScreen" },
      },
    });
    expect(s.getState().routes[0].name).toBe("Alpha");
  });

  it("push adds a new screen to the stack", () => {
    stack.push("Profile");
    const state = stack.getState();
    expect(state.routes).toHaveLength(2);
    expect(state.index).toBe(1);
    expect(state.routes[1].name).toBe("Profile");
  });

  it("push stores optional params", () => {
    stack.push("Profile", { userId: "42" });
    const { routes } = stack.getState();
    expect(routes[1].params).toEqual({ userId: "42" });
  });

  it("push multiple screens increments index correctly", () => {
    stack.push("Profile");
    stack.push("Settings");
    expect(stack.getState().index).toBe(2);
    expect(stack.getState().routes[2].name).toBe("Settings");
  });

  it("pop removes the top screen", () => {
    stack.push("Profile");
    stack.pop();
    const state = stack.getState();
    expect(state.index).toBe(0);
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0].name).toBe("Home");
  });

  it("pop does nothing when already at the root", () => {
    stack.pop();
    const state = stack.getState();
    expect(state.index).toBe(0);
    expect(state.routes).toHaveLength(1);
  });

  it("canGoBack returns false at the root", () => {
    expect(stack.canGoBack()).toBe(false);
  });

  it("canGoBack returns true after a push", () => {
    stack.push("Profile");
    expect(stack.canGoBack()).toBe(true);
  });

  it("canGoBack returns false after push then pop", () => {
    stack.push("Profile");
    stack.pop();
    expect(stack.canGoBack()).toBe(false);
  });

  it("replace swaps the current screen without adding a history entry", () => {
    stack.push("Profile");
    stack.replace("Settings");
    const state = stack.getState();
    expect(state.routes).toHaveLength(2);
    expect(state.routes[1].name).toBe("Settings");
    expect(state.index).toBe(1);
  });

  it("replace stores optional params", () => {
    stack.replace("Profile", { tab: "bio" });
    const state = stack.getState();
    expect(state.routes[0].params).toEqual({ tab: "bio" });
  });

  it("reset clears the stack to a single screen", () => {
    stack.push("Profile");
    stack.push("Settings");
    stack.reset("Home");
    const state = stack.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.index).toBe(0);
    expect(state.routes[0].name).toBe("Home");
  });

  it("reset with params stores params correctly", () => {
    stack.push("Profile");
    stack.reset("Settings", { fromReset: true });
    const state = stack.getState();
    expect(state.routes[0].params).toEqual({ fromReset: true });
  });

  it("throws when pushing an unregistered screen", () => {
    expect(() => stack.push("Unknown")).toThrow();
  });

  it("throws when replacing with an unregistered screen", () => {
    expect(() => stack.replace("Ghost")).toThrow();
  });

  it("throws when resetting to an unregistered screen", () => {
    expect(() => stack.reset("Nope")).toThrow();
  });

  it("throws when screens is empty", () => {
    expect(() =>
      createStackNavigator({ screens: {} })
    ).toThrow();
  });

  it("throws when initialRoute is not in screens", () => {
    expect(() =>
      createStackNavigator({
        screens: { Home: { component: "HomeScreen" } },
        initialRoute: "NotExist",
      })
    ).toThrow();
  });

  it("getState returns a snapshot (mutations do not affect returned object)", () => {
    const before = stack.getState();
    stack.push("Profile");
    const after = stack.getState();
    expect(before.routes).toHaveLength(1);
    expect(after.routes).toHaveLength(2);
  });
});

// ===========================================================================
// Tab Navigator
// ===========================================================================

describe("createTabNavigator", () => {
  let tabs: TabNavigator;

  beforeEach(() => {
    tabs = createTabNavigator(makeTabConfig());
  });

  it("returns an object with switchTab, getActiveTab, and getTabs", () => {
    expect(typeof tabs.switchTab).toBe("function");
    expect(typeof tabs.getActiveTab).toBe("function");
    expect(typeof tabs.getTabs).toBe("function");
  });

  it("initialises on the configured initialRoute", () => {
    expect(tabs.getActiveTab()).toBe("Feed");
  });

  it("defaults to the first tab when initialRoute is omitted", () => {
    const t = createTabNavigator({
      screens: {
        A: { component: "AScreen" },
        B: { component: "BScreen" },
      },
    });
    expect(t.getActiveTab()).toBe("A");
  });

  it("switchTab changes the active tab", () => {
    tabs.switchTab("Search");
    expect(tabs.getActiveTab()).toBe("Search");
  });

  it("switchTab to a different tab updates correctly", () => {
    tabs.switchTab("Inbox");
    expect(tabs.getActiveTab()).toBe("Inbox");
  });

  it("getTabs returns all registered tabs", () => {
    const list = tabs.getTabs();
    expect(list).toHaveLength(3);
    const names = list.map((t) => t.name);
    expect(names).toContain("Feed");
    expect(names).toContain("Search");
    expect(names).toContain("Inbox");
  });

  it("getTabs includes icon and badge config", () => {
    const list = tabs.getTabs();
    const inbox = list.find((t) => t.name === "Inbox")!;
    expect(inbox.config.icon).toBe("mail");
    expect(inbox.config.badge).toBe(3);
  });

  it("throws when switching to an unregistered tab", () => {
    expect(() => tabs.switchTab("Nonexistent")).toThrow();
  });

  it("throws when screens is empty", () => {
    expect(() => createTabNavigator({ screens: {} })).toThrow();
  });

  it("throws when initialRoute is not in screens", () => {
    expect(() =>
      createTabNavigator({
        screens: { Home: { component: "HomeScreen" } },
        initialRoute: "Missing",
      })
    ).toThrow();
  });
});

// ===========================================================================
// Drawer Navigator
// ===========================================================================

describe("createDrawerNavigator", () => {
  let drawer: DrawerNavigator;

  beforeEach(() => {
    drawer = createDrawerNavigator(makeDrawerConfig());
  });

  it("returns an object with openDrawer, closeDrawer, toggleDrawer, isDrawerOpen, navigate, getState", () => {
    expect(typeof drawer.openDrawer).toBe("function");
    expect(typeof drawer.closeDrawer).toBe("function");
    expect(typeof drawer.toggleDrawer).toBe("function");
    expect(typeof drawer.isDrawerOpen).toBe("function");
    expect(typeof drawer.navigate).toBe("function");
    expect(typeof drawer.getState).toBe("function");
  });

  it("drawer is closed by default", () => {
    expect(drawer.isDrawerOpen()).toBe(false);
  });

  it("openDrawer sets isDrawerOpen to true", () => {
    drawer.openDrawer();
    expect(drawer.isDrawerOpen()).toBe(true);
  });

  it("closeDrawer sets isDrawerOpen to false", () => {
    drawer.openDrawer();
    drawer.closeDrawer();
    expect(drawer.isDrawerOpen()).toBe(false);
  });

  it("toggleDrawer opens when closed", () => {
    drawer.toggleDrawer();
    expect(drawer.isDrawerOpen()).toBe(true);
  });

  it("toggleDrawer closes when open", () => {
    drawer.openDrawer();
    drawer.toggleDrawer();
    expect(drawer.isDrawerOpen()).toBe(false);
  });

  it("toggleDrawer alternates state correctly over multiple calls", () => {
    drawer.toggleDrawer(); // open
    drawer.toggleDrawer(); // close
    drawer.toggleDrawer(); // open
    expect(drawer.isDrawerOpen()).toBe(true);
  });

  it("initialises on the configured initialRoute", () => {
    expect(drawer.getState().currentScreen).toBe("Dashboard");
  });

  it("navigate changes the current screen", () => {
    drawer.navigate("Reports");
    expect(drawer.getState().currentScreen).toBe("Reports");
  });

  it("navigate stores optional params", () => {
    drawer.navigate("Account", { section: "billing" });
    expect(drawer.getState().params).toEqual({ section: "billing" });
  });

  it("navigate closes the drawer automatically", () => {
    drawer.openDrawer();
    drawer.navigate("Reports");
    expect(drawer.isDrawerOpen()).toBe(false);
  });

  it("throws when navigating to an unregistered screen", () => {
    expect(() => drawer.navigate("Ghost")).toThrow();
  });

  it("throws when screens is empty", () => {
    expect(() => createDrawerNavigator({ screens: {} })).toThrow();
  });

  it("throws when initialRoute is not in screens", () => {
    expect(() =>
      createDrawerNavigator({
        screens: { Home: { component: "HomeScreen" } },
        initialRoute: "Missing",
      })
    ).toThrow();
  });

  it("getState returns a snapshot that does not change on further navigations", () => {
    const snap = drawer.getState();
    drawer.navigate("Reports");
    // The original snapshot must still reflect Dashboard.
    expect(snap.currentScreen).toBe("Dashboard");
  });
});
