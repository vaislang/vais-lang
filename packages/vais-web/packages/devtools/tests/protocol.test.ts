import { describe, it, expect } from "vitest";
import type {
  DevToolsMessage,
  DevToolsEvent,
  ComponentNode,
  ReactivityNode,
  ReactivityEdge,
  PerformanceEntry,
} from "../src/protocol.js";

describe("DevToolsMessage protocol types", () => {
  it("subscribe message is valid", () => {
    const msg: DevToolsMessage = { type: "subscribe", channel: "components" };
    expect(msg.type).toBe("subscribe");
    if (msg.type === "subscribe") {
      expect(["components", "reactivity", "performance"]).toContain(msg.channel);
    }
  });

  it("unsubscribe message is valid", () => {
    const msg: DevToolsMessage = { type: "unsubscribe", channel: "components" };
    expect(msg.type).toBe("unsubscribe");
  });

  it("inspect message is valid", () => {
    const msg: DevToolsMessage = { type: "inspect", componentId: "comp-1" };
    expect(msg.type).toBe("inspect");
    if (msg.type === "inspect") {
      expect(msg.componentId).toBe("comp-1");
    }
  });

  it("highlight message is valid", () => {
    const msg: DevToolsMessage = {
      type: "highlight",
      componentId: "comp-1",
      enabled: true,
    };
    expect(msg.type).toBe("highlight");
    if (msg.type === "highlight") {
      expect(msg.componentId).toBe("comp-1");
      expect(msg.enabled).toBe(true);
    }
  });
});

describe("DevToolsEvent protocol types", () => {
  it("component-tree event is valid", () => {
    const node: ComponentNode = {
      id: "comp-1",
      name: "MyComponent",
      props: { foo: "bar" },
      children: [],
    };
    const event: DevToolsEvent = { type: "component-tree", tree: [node] };
    expect(event.type).toBe("component-tree");
    if (event.type === "component-tree") {
      expect(event.tree).toHaveLength(1);
      expect(event.tree[0].id).toBe("comp-1");
    }
  });

  it("state-update event is valid", () => {
    const event: DevToolsEvent = {
      type: "state-update",
      componentId: "comp-1",
      state: { count: 42 },
    };
    expect(event.type).toBe("state-update");
    if (event.type === "state-update") {
      expect(event.componentId).toBe("comp-1");
      expect(event.state).toEqual({ count: 42 });
    }
  });

  it("reactivity-graph event is valid", () => {
    const nodes: ReactivityNode[] = [
      { id: "n1", type: "state", name: "count", value: 0 },
      { id: "n2", type: "derived", name: "doubled" },
    ];
    const edges: ReactivityEdge[] = [{ from: "n1", to: "n2" }];
    const event: DevToolsEvent = { type: "reactivity-graph", nodes, edges };
    expect(event.type).toBe("reactivity-graph");
    if (event.type === "reactivity-graph") {
      expect(event.nodes).toHaveLength(2);
      expect(event.edges).toHaveLength(1);
    }
  });

  it("performance-entry event is valid", () => {
    const entry: PerformanceEntry = {
      componentId: "comp-1",
      type: "render",
      duration: 12.5,
      timestamp: Date.now(),
    };
    const event: DevToolsEvent = { type: "performance-entry", entry };
    expect(event.type).toBe("performance-entry");
    if (event.type === "performance-entry") {
      expect(event.entry.type).toBe("render");
      expect(event.entry.duration).toBe(12.5);
    }
  });
});

describe("ComponentNode nested structure", () => {
  it("supports nested children", () => {
    const child: ComponentNode = {
      id: "child-1",
      name: "Child",
      props: {},
      children: [],
    };
    const parent: ComponentNode = {
      id: "parent-1",
      name: "Parent",
      props: { title: "hello" },
      children: [child],
    };
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].id).toBe("child-1");
  });
});
