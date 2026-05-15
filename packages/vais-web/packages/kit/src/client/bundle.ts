/**
 * Generate the minimal browser bootstrap emitted as `/client.js`.
 *
 * The bundle is intentionally standalone: static adapter output must be able to
 * run without package resolution, a dev server transform, or Node-only APIs.
 */
export function generateClientBundle(): string {
  return `(() => {
  const w = window;

  function parseMarker(marker) {
    const colon = marker.indexOf(":");
    if (colon === -1) {
      return { componentId: marker, events: [] };
    }
    const events = marker
      .slice(colon + 1)
      .split(",")
      .map((eventName) => eventName.trim())
      .filter(Boolean);
    return { componentId: marker.slice(0, colon), events };
  }

  function deserializeState(encoded) {
    if (!encoded) return {};
    try {
      const parsed = JSON.parse(atob(encoded));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  function hydrateAll() {
    const registry = w.__VAISX_COMPONENTS__ || {};
    const targets = Array.from(document.querySelectorAll("[data-vx]"));
    const hydrated = [];

    for (const element of targets) {
      const marker = parseMarker(element.getAttribute("data-vx") || "");
      const state = deserializeState(element.getAttribute("data-vx-state") || "");
      const mount = registry[marker.componentId];

      if (typeof mount === "function") {
        mount(element, state, { events: marker.events });
      }

      element.removeAttribute("data-vx");
      element.removeAttribute("data-vx-state");
      hydrated.push(marker.componentId);
      element.dispatchEvent(
        new CustomEvent("vaisx:component-hydrated", {
          bubbles: true,
          detail: { componentId: marker.componentId, state },
        })
      );
    }

    w.__VAISX_HYDRATED__ = hydrated;
    document.dispatchEvent(
      new CustomEvent("vaisx:hydrated", {
        detail: { components: hydrated },
      })
    );
    return hydrated;
  }

  w.__VAISX_HYDRATE__ = hydrateAll;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hydrateAll, { once: true });
  } else {
    queueMicrotask(hydrateAll);
  }
})();
`;
}
