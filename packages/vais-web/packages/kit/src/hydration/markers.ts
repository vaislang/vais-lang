/**
 * markers.ts — Parse hydration markers from SSR HTML
 */

export interface HydrationTarget {
  element: Element;
  componentId: string;
  events: string[];   // parsed from data-vx="c0:click,input"
  stateBase64: string; // raw data-vx-state value
}

/**
 * Find all hydration targets in the given root element.
 * Queries all elements with [data-vx] attribute and parses the marker format.
 *
 * data-vx format: "componentId:event1,event2" or just "componentId"
 */
export function findHydrationTargets(root: Element): HydrationTarget[] {
  if (typeof document === "undefined") return [];

  const elements = root.querySelectorAll("[data-vx]");
  const targets: HydrationTarget[] = [];

  for (const element of elements) {
    const dataVx = element.getAttribute("data-vx") ?? "";
    const stateBase64 = element.getAttribute("data-vx-state") ?? "";

    const colonIndex = dataVx.indexOf(":");
    let componentId: string;
    let events: string[];

    if (colonIndex === -1) {
      componentId = dataVx;
      events = [];
    } else {
      componentId = dataVx.slice(0, colonIndex);
      const eventsStr = dataVx.slice(colonIndex + 1);
      events = eventsStr.length > 0
        ? eventsStr.split(",").map((e) => e.trim()).filter((e) => e.length > 0)
        : [];
    }

    targets.push({ element, componentId, events, stateBase64 });
  }

  return targets;
}
