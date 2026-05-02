import { afterEach, describe, expect, it } from "vitest";

import { createRouter, type ResolvedRoute } from "../../src/client/navigator.js";
import { eventQueue, hydrateAll } from "../../src/hydration/hydrate.js";
import { renderClientComponent } from "../../src/ssr/component.js";
import { renderToString } from "../../src/ssr/renderer.js";
import type { RouteDefinition } from "../../src/types.js";

const rootRoute: RouteDefinition = {
  pattern: "/",
  segments: [],
  page: "app/page.vaisx",
  layout: "app/layout.vaisx",
  middleware: [],
  children: [
    {
      pattern: "/dashboard",
      segments: [{ type: "static", value: "dashboard" }],
      page: "app/dashboard/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/dashboard/[id]",
          segments: [
            { type: "static", value: "dashboard" },
            { type: "dynamic", value: "id" },
          ],
          page: "app/dashboard/[id]/page.vaisx",
          loading: "app/dashboard/[id]/loading.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
};

afterEach(() => {
  eventQueue.clear();
  document.body.innerHTML = "";
});

describe("E2E — vais-web route hydration runtime", () => {
  it("renders SSR markers, navigates a dynamic route, hydrates state, and replays queued events", async () => {
    const navigations: ResolvedRoute[] = [];
    const router = createRouter({
      routes: rootRoute,
      onNavigate: (route) => {
        navigations.push(route);
      },
    });

    const result = await renderToString({
      route: {
        route: rootRoute.children[0].children[0],
        params: { id: "42" },
        layoutChain: ["app/layout.vaisx"],
        errorBoundary: null,
        loading: "app/dashboard/[id]/loading.vaisx",
        middlewareChain: [],
      },
      renderComponent: async (filePath) => {
        if (filePath.endsWith("layout.vaisx")) {
          return '<section id="app-shell">{slot}</section>';
        }
        return renderClientComponent(
          '<button id="counter">Count</button>',
          "counter:click",
          { count: 7, routeId: "42" }
        );
      },
      scripts: ["/assets/counter.js"],
    });

    document.open();
    document.write(result.html);
    document.close();

    const marker = document.querySelector("[data-vx='counter:click']");
    expect(marker).not.toBeNull();
    eventQueue.capture(marker!, new MouseEvent("click", { bubbles: true }));

    await router.navigate("/dashboard/42", { scroll: false });

    const replayedEvents: string[] = [];
    let hydratedState: Record<string, unknown> | undefined;
    await hydrateAll({
      counter: async () => ({
        default: (target, state) => {
          hydratedState = state;
          target.setAttribute("data-mounted", "true");
          target.addEventListener("click", () => {
            replayedEvents.push(`click:${String(state?.routeId)}`);
          });
          return {};
        },
      }),
    });

    expect(result.html).toContain('<script type="module" src="/assets/counter.js"></script>');
    expect(navigations).toHaveLength(1);
    expect(navigations[0].route.pattern).toBe("/dashboard/[id]");
    expect(navigations[0].params).toEqual({ id: "42" });
    expect(navigations[0].loading).toBe("app/dashboard/[id]/loading.vaisx");
    expect(hydratedState).toEqual({ count: 7, routeId: "42" });
    expect(replayedEvents).toEqual(["click:42"]);
    expect(document.querySelector("[data-vx]")).toBeNull();
    expect(document.querySelector("[data-mounted='true']")).not.toBeNull();
  });
});
