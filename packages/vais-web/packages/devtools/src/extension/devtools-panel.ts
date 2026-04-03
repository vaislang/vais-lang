import type { ContentBridge } from "./content-script.js";

// Minimal type declarations for Chrome DevTools APIs (not relying on @types/chrome)
type ChromeDevtoolsPanel = {
  onShown: { addListener: (cb: () => void) => void };
  onHidden: { addListener: (cb: () => void) => void };
};

declare global {
  const chrome: {
    devtools: {
      panels: {
        create: (
          title: string,
          iconPath: string,
          pagePath: string,
          callback?: (panel: ChromeDevtoolsPanel) => void
        ) => void;
      };
    };
  } | undefined;
}

// Creates the DevTools panel
export function createPanel(): void {
  if (typeof chrome !== "undefined" && chrome?.devtools?.panels) {
    chrome.devtools.panels.create(
      "VaisX",
      "icons/icon16.png",
      "panel.html"
    );
  }
}

export class PanelController {
  private bridge: ContentBridge;
  private active = false;

  constructor(bridge: ContentBridge) {
    this.bridge = bridge;
  }

  activate(): void {
    this.active = true;
    this.requestComponentTree();
    this.requestReactivityGraph();
  }

  deactivate(): void {
    this.active = false;
  }

  requestComponentTree(): void {
    this.bridge.send({
      source: "vaisx-extension",
      type: "request-component-tree",
    });
  }

  requestReactivityGraph(): void {
    this.bridge.send({
      source: "vaisx-extension",
      type: "request-reactivity-graph",
    });
  }

  isActive(): boolean {
    return this.active;
  }
}
