import { afterEach, describe, expect, it, vi } from "vitest";

import { createStaticAdapter } from "../../src/adapters/static.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const browserManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
  },
};

function installGeneratedPage(html: string): void {
  document.open();
  document.write(
    html.replace(
      '<div id="app"></div>',
      `<div id="app">
        <button id="counter" data-vx="counter:click" data-vx-state="${btoa(
          JSON.stringify({ count: 7 })
        )}">pending</button>
      </div>`
    )
  );
  document.close();
}

function executeClientBundle(clientJs: string): void {
  const script = document.createElement("script");
  script.textContent = clientJs;
  document.body.appendChild(script);
}

function installComponentRegistry(): void {
  const script = document.createElement("script");
  script.textContent = `
window.__VAISX_COMPONENTS__ = {
  counter(element, state, meta) {
    element.setAttribute("data-events", meta.events.join(","));
    const start = typeof state.count === "number" ? state.count : 0;
    element.textContent = "count: " + start;
    element.addEventListener("click", () => {
      element.textContent = "count: " + (start + 1);
    });
  }
};
`;
  document.body.appendChild(script);
}

function waitForHydration(): Promise<CustomEvent<{ components: string[] }>> {
  return new Promise((resolve) => {
    document.addEventListener(
      "vaisx:hydrated",
      (event) => resolve(event as CustomEvent<{ components: string[] }>),
      { once: true }
    );
  });
}

describe("E2E - vais-web browser bundle runtime", () => {
  afterEach(() => {
    document.documentElement.innerHTML = "";
    delete (window as typeof window & {
      __VAISX_COMPONENTS__?: Record<string, unknown>;
      __VAISX_HYDRATED__?: string[];
      __VAISX_HYDRATE__?: () => string[];
    }).__VAISX_COMPONENTS__;
    delete (window as typeof window & {
      __VAISX_HYDRATED__?: string[];
    }).__VAISX_HYDRATED__;
    delete (window as typeof window & {
      __VAISX_HYDRATE__?: () => string[];
    }).__VAISX_HYDRATE__;
    vi.restoreAllMocks();
  });

  it("loads static adapter client.js and hydrates SSR markers without console errors", async () => {
    const staticBuild = (await createStaticAdapter().build(browserManifest, {
      type: "static",
    })) as GeneratedBuildResult;
    const indexHtml = staticBuild.generatedFiles?.["dist/index.html"];
    const clientJs = staticBuild.generatedFiles?.["dist/client.js"];

    expect(indexHtml).toContain('<script type="module" src="/client.js"></script>');
    expect(clientJs).toContain("__VAISX_HYDRATE__");
    expect(clientJs).not.toContain("placeholder");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    installGeneratedPage(indexHtml ?? "");

    const hydrated = waitForHydration();
    installComponentRegistry();
    executeClientBundle(clientJs ?? "");
    const hydrationEvent = await hydrated;

    expect(hydrationEvent.detail.components).toEqual(["counter"]);

    const counter = document.querySelector<HTMLButtonElement>("#counter");
    expect(counter).not.toBeNull();
    expect(counter?.getAttribute("data-events")).toBe("click");
    expect(counter?.hasAttribute("data-vx")).toBe(false);
    expect(counter?.hasAttribute("data-vx-state")).toBe(false);
    expect(counter?.textContent).toBe("count: 7");

    counter?.click();
    expect(counter?.textContent).toBe("count: 8");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
