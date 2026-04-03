import { describe, it, expect, vi, beforeEach } from "vitest";
import { Instrumentation } from "../src/instrumentation.js";
import { InspectorServer } from "../src/inspector.js";
import type { DevToolsEvent, PerformanceEntry } from "../src/protocol.js";

function createMockInspector(): InspectorServer & {
  broadcastCalls: DevToolsEvent[];
} {
  const inspector = new InspectorServer({ port: 19098 });
  const broadcastCalls: DevToolsEvent[] = [];

  vi.spyOn(inspector, "broadcast").mockImplementation((event) => {
    broadcastCalls.push(event);
  });

  return Object.assign(inspector, { broadcastCalls });
}

describe("Instrumentation", () => {
  let inspector: ReturnType<typeof createMockInspector>;
  let instrumentation: Instrumentation;

  beforeEach(() => {
    inspector = createMockInspector();
    instrumentation = new Instrumentation(inspector);
  });

  describe("trackComponent", () => {
    it("registers a component and broadcasts component-tree", () => {
      instrumentation.trackComponent("c1", "App", { title: "hello" });

      expect(inspector.broadcastCalls).toHaveLength(1);
      const event = inspector.broadcastCalls[0];
      expect(event.type).toBe("component-tree");
      if (event.type === "component-tree") {
        expect(event.tree).toHaveLength(1);
        expect(event.tree[0]).toMatchObject({
          id: "c1",
          name: "App",
          props: { title: "hello" },
          children: [],
        });
      }
    });

    it("accumulates multiple components in the tree", () => {
      instrumentation.trackComponent("c1", "App", {});
      instrumentation.trackComponent("c2", "Header", {});

      const lastEvent =
        inspector.broadcastCalls[inspector.broadcastCalls.length - 1];
      expect(lastEvent.type).toBe("component-tree");
      if (lastEvent.type === "component-tree") {
        expect(lastEvent.tree).toHaveLength(2);
      }
    });
  });

  describe("removeComponent", () => {
    it("removes a component and broadcasts updated tree", () => {
      instrumentation.trackComponent("c1", "App", {});
      instrumentation.trackComponent("c2", "Header", {});

      inspector.broadcastCalls.length = 0; // reset

      instrumentation.removeComponent("c1");

      expect(inspector.broadcastCalls).toHaveLength(1);
      const event = inspector.broadcastCalls[0];
      expect(event.type).toBe("component-tree");
      if (event.type === "component-tree") {
        expect(event.tree).toHaveLength(1);
        expect(event.tree[0].id).toBe("c2");
      }
    });

    it("handles removing a non-existent component gracefully", () => {
      expect(() => instrumentation.removeComponent("nonexistent")).not.toThrow();
    });
  });

  describe("trackStateChange", () => {
    it("broadcasts state-update event", () => {
      instrumentation.trackStateChange("c1", "count", 42);

      expect(inspector.broadcastCalls).toHaveLength(1);
      const event = inspector.broadcastCalls[0];
      expect(event.type).toBe("state-update");
      if (event.type === "state-update") {
        expect(event.componentId).toBe("c1");
        expect(event.state).toEqual({ count: 42 });
      }
    });

    it("merges multiple state changes for the same component", () => {
      instrumentation.trackStateChange("c1", "count", 1);
      instrumentation.trackStateChange("c1", "name", "Alice");

      const lastEvent =
        inspector.broadcastCalls[inspector.broadcastCalls.length - 1];
      expect(lastEvent.type).toBe("state-update");
      if (lastEvent.type === "state-update") {
        expect(lastEvent.state).toEqual({ count: 1, name: "Alice" });
      }
    });

    it("tracks state for different components independently", () => {
      instrumentation.trackStateChange("c1", "x", 10);
      instrumentation.trackStateChange("c2", "y", 20);

      const events = inspector.broadcastCalls.filter(
        (e) => e.type === "state-update"
      );
      expect(events).toHaveLength(2);
    });
  });

  describe("trackReactivityGraph", () => {
    it("broadcasts reactivity-graph event", () => {
      const nodes = [
        { id: "n1", type: "state" as const, name: "count", value: 0 },
      ];
      const edges = [{ from: "n1", to: "n2" }];

      instrumentation.trackReactivityGraph(nodes, edges);

      expect(inspector.broadcastCalls).toHaveLength(1);
      const event = inspector.broadcastCalls[0];
      expect(event.type).toBe("reactivity-graph");
      if (event.type === "reactivity-graph") {
        expect(event.nodes).toEqual(nodes);
        expect(event.edges).toEqual(edges);
      }
    });
  });

  describe("trackPerformance", () => {
    it("broadcasts performance-entry event", () => {
      const entry: PerformanceEntry = {
        componentId: "c1",
        type: "render",
        duration: 5.2,
        timestamp: 1000,
      };

      instrumentation.trackPerformance(entry);

      expect(inspector.broadcastCalls).toHaveLength(1);
      const event = inspector.broadcastCalls[0];
      expect(event.type).toBe("performance-entry");
      if (event.type === "performance-entry") {
        expect(event.entry).toEqual(entry);
      }
    });
  });

  describe("getComponentTree", () => {
    it("returns empty array initially", () => {
      expect(instrumentation.getComponentTree()).toEqual([]);
    });

    it("returns all tracked components", () => {
      instrumentation.trackComponent("c1", "App", {});
      instrumentation.trackComponent("c2", "Nav", { active: true });

      const tree = instrumentation.getComponentTree();
      expect(tree).toHaveLength(2);
      expect(tree.map((n) => n.id)).toContain("c1");
      expect(tree.map((n) => n.id)).toContain("c2");
    });

    it("reflects removals", () => {
      instrumentation.trackComponent("c1", "App", {});
      instrumentation.trackComponent("c2", "Nav", {});
      instrumentation.removeComponent("c1");

      const tree = instrumentation.getComponentTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("c2");
    });
  });
});
