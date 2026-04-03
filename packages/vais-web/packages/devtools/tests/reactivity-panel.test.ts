import { describe, it, expect, beforeEach } from "vitest";
import {
  computeLayout,
  NODE_WIDTH,
  NODE_HEIGHT,
  LAYER_GAP,
  NODE_GAP,
  ReactivityTracker,
  ReactivityGraphModel,
  calculateLayout,
  renderGraph,
  renderNodeDetail,
} from "../src/panels/reactivity/index.js";
import type { ReactivityNode, ReactivityEdge } from "../src/protocol.js";

// ─── computeLayout ────────────────────────────────────────────────────────────

describe("computeLayout", () => {
  it("separates state/derived/effect into layers", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
      { id: "d1", type: "derived", name: "doubled" },
      { id: "e1", type: "effect", name: "logger" },
    ];
    const edges: ReactivityEdge[] = [];

    const layout = computeLayout(nodes, edges);

    const stateNode = layout.nodes.find((n) => n.id === "s1")!;
    const derivedNode = layout.nodes.find((n) => n.id === "d1")!;
    const effectNode = layout.nodes.find((n) => n.id === "e1")!;

    expect(stateNode).toBeDefined();
    expect(derivedNode).toBeDefined();
    expect(effectNode).toBeDefined();

    // state layer: x = 0
    expect(stateNode.x).toBe(0);
    // derived layer: x = NODE_WIDTH + LAYER_GAP
    expect(derivedNode.x).toBe(NODE_WIDTH + LAYER_GAP);
    // effect layer: x = 2 * (NODE_WIDTH + LAYER_GAP)
    expect(effectNode.x).toBe(2 * (NODE_WIDTH + LAYER_GAP));

    // types preserved
    expect(stateNode.type).toBe("state");
    expect(derivedNode.type).toBe("derived");
    expect(effectNode.type).toBe("effect");
  });

  it("positions multiple nodes in same layer vertically", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "a" },
      { id: "s2", type: "state", name: "b" },
      { id: "s3", type: "state", name: "c" },
    ];
    const edges: ReactivityEdge[] = [];

    const layout = computeLayout(nodes, edges);

    const n1 = layout.nodes.find((n) => n.id === "s1")!;
    const n2 = layout.nodes.find((n) => n.id === "s2")!;
    const n3 = layout.nodes.find((n) => n.id === "s3")!;

    // Same x (layer 0)
    expect(n1.x).toBe(0);
    expect(n2.x).toBe(0);
    expect(n3.x).toBe(0);

    // Vertically spaced
    expect(n1.y).toBe(0);
    expect(n2.y).toBe(NODE_HEIGHT + NODE_GAP);
    expect(n3.y).toBe(2 * (NODE_HEIGHT + NODE_GAP));
  });

  it("calculates edge coordinates based on node center points", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
      { id: "d1", type: "derived", name: "doubled" },
    ];
    const edges: ReactivityEdge[] = [{ from: "s1", to: "d1" }];

    const layout = computeLayout(nodes, edges);

    expect(layout.edges).toHaveLength(1);
    const edge = layout.edges[0];

    const stateNode = layout.nodes.find((n) => n.id === "s1")!;
    const derivedNode = layout.nodes.find((n) => n.id === "d1")!;

    expect(edge.from).toBe("s1");
    expect(edge.to).toBe("d1");
    expect(edge.fromX).toBe(stateNode.x + stateNode.width / 2);
    expect(edge.fromY).toBe(stateNode.y + stateNode.height / 2);
    expect(edge.toX).toBe(derivedNode.x + derivedNode.width / 2);
    expect(edge.toY).toBe(derivedNode.y + derivedNode.height / 2);
  });

  it("handles empty input", () => {
    const layout = computeLayout([], []);

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it("sets correct node dimensions", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "x" },
    ];
    const layout = computeLayout(nodes, []);
    const node = layout.nodes[0];

    expect(node.width).toBe(NODE_WIDTH);
    expect(node.height).toBe(NODE_HEIGHT);
    expect(node.label).toBe("x");
    expect(node.updateCount).toBe(0);
    expect(node.highlighted).toBe(false);
  });

  it("skips edges referencing unknown nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
    ];
    const edges: ReactivityEdge[] = [
      { from: "s1", to: "unknown" },
      { from: "unknown", to: "s1" },
    ];

    const layout = computeLayout(nodes, edges);
    expect(layout.edges).toHaveLength(0);
  });
});

// ─── ReactivityTracker ───────────────────────────────────────────────────────

describe("ReactivityTracker", () => {
  let tracker: ReactivityTracker;

  beforeEach(() => {
    tracker = new ReactivityTracker();
  });

  it("highlights new nodes when graph is updated", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
      { id: "d1", type: "derived", name: "doubled" },
    ];

    const layout = tracker.updateGraph(nodes, []);

    const s1 = layout.nodes.find((n) => n.id === "s1")!;
    const d1 = layout.nodes.find((n) => n.id === "d1")!;

    // New nodes are highlighted
    expect(s1.highlighted).toBe(true);
    expect(d1.highlighted).toBe(true);
  });

  it("highlights node with changed value on second updateGraph", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);

    const updatedNodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 1 },
    ];

    const layout = tracker.updateGraph(updatedNodes, []);
    const s1 = layout.nodes.find((n) => n.id === "s1")!;

    expect(s1.highlighted).toBe(true);
    expect(s1.updateCount).toBe(1);
  });

  it("does not highlight node with unchanged value on second updateGraph", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);

    const layout = tracker.updateGraph(nodes, []);
    const s1 = layout.nodes.find((n) => n.id === "s1")!;

    expect(s1.highlighted).toBe(false);
  });

  it("increments updateCount on updateNodeValue", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);
    tracker.updateNodeValue("s1", 42);

    const layout = tracker.getLayout();
    const s1 = layout.nodes.find((n) => n.id === "s1")!;

    expect(s1.updateCount).toBe(1);
    expect(s1.value).toBe(42);
    expect(s1.highlighted).toBe(true);
  });

  it("accumulates updateCount across multiple updateNodeValue calls", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);
    tracker.updateNodeValue("s1", 1);
    tracker.updateNodeValue("s1", 2);
    tracker.updateNodeValue("s1", 3);

    const layout = tracker.getLayout();
    const s1 = layout.nodes.find((n) => n.id === "s1")!;

    expect(s1.updateCount).toBe(3);
  });

  it("does nothing on updateNodeValue for unknown nodeId", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);

    expect(() => tracker.updateNodeValue("nonexistent", 99)).not.toThrow();

    const layout = tracker.getLayout();
    const s1 = layout.nodes.find((n) => n.id === "s1")!;
    expect(s1.updateCount).toBe(0);
  });

  it("clearHighlights sets all highlighted to false", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
      { id: "d1", type: "derived", name: "doubled" },
    ];

    tracker.updateGraph(nodes, []);
    // All new nodes are highlighted
    tracker.clearHighlights();

    const layout = tracker.getLayout();
    for (const node of layout.nodes) {
      expect(node.highlighted).toBe(false);
    }
  });

  it("clearHighlights works after updateNodeValue", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];

    tracker.updateGraph(nodes, []);
    tracker.clearHighlights();
    tracker.updateNodeValue("s1", 5);

    // highlighted after updateNodeValue
    const beforeClear = tracker.getLayout().nodes.find((n) => n.id === "s1")!;
    expect(beforeClear.highlighted).toBe(true);

    tracker.clearHighlights();

    const afterClear = tracker.getLayout().nodes.find((n) => n.id === "s1")!;
    expect(afterClear.highlighted).toBe(false);
    // updateCount preserved
    expect(afterClear.updateCount).toBe(1);
  });

  it("getLayout returns current layout", () => {
    expect(tracker.getLayout()).toEqual({
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
    });

    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "x" },
    ];

    const layout = tracker.updateGraph(nodes, []);
    expect(tracker.getLayout()).toBe(layout);
  });
});

// ─── ReactivityGraphModel ─────────────────────────────────────────────────────

describe("ReactivityGraphModel", () => {
  let model: ReactivityGraphModel;

  beforeEach(() => {
    model = new ReactivityGraphModel();
  });

  const sampleNodes: ReactivityNode[] = [
    { id: "s1", type: "state", name: "count", value: 0 },
    { id: "d1", type: "derived", name: "doubled" },
    { id: "e1", type: "effect", name: "logger" },
  ];
  const sampleEdges: ReactivityEdge[] = [
    { from: "s1", to: "d1" },
    { from: "d1", to: "e1" },
  ];

  it("update populates nodes and edges", () => {
    model.update(sampleNodes, sampleEdges);

    expect(model.nodes.size).toBe(3);
    expect(model.edges).toHaveLength(2);
  });

  it("getNode returns correct node", () => {
    model.update(sampleNodes, sampleEdges);

    const node = model.getNode("s1");
    expect(node).toBeDefined();
    expect(node?.name).toBe("count");
    expect(node?.type).toBe("state");
  });

  it("getNode returns undefined for unknown id", () => {
    model.update(sampleNodes, sampleEdges);
    expect(model.getNode("unknown")).toBeUndefined();
  });

  it("getDependencies returns nodes that the given node depends on", () => {
    model.update(sampleNodes, sampleEdges);

    // d1 depends on s1 (edge from s1 to d1)
    expect(model.getDependencies("d1")).toEqual(["s1"]);
    // s1 has no dependencies
    expect(model.getDependencies("s1")).toEqual([]);
  });

  it("getDependents returns nodes that depend on the given node", () => {
    model.update(sampleNodes, sampleEdges);

    // s1 is depended on by d1
    expect(model.getDependents("s1")).toEqual(["d1"]);
    // e1 has no dependents
    expect(model.getDependents("e1")).toEqual([]);
  });

  it("trackValueChange increments updateCount and sets lastUpdated", () => {
    model.update(sampleNodes, sampleEdges);

    const before = Date.now();
    model.trackValueChange("s1", 42);
    const after = Date.now();

    const node = model.getNode("s1");
    expect(node?.updateCount).toBe(1);
    expect(node?.value).toBe(42);
    expect(node?.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(node?.lastUpdated).toBeLessThanOrEqual(after);
  });

  it("trackValueChange accumulates updateCount", () => {
    model.update(sampleNodes, sampleEdges);

    model.trackValueChange("s1", 1);
    model.trackValueChange("s1", 2);
    model.trackValueChange("s1", 3);

    expect(model.getNode("s1")?.updateCount).toBe(3);
  });

  it("trackValueChange does nothing for unknown node", () => {
    model.update(sampleNodes, sampleEdges);
    expect(() => model.trackValueChange("unknown", 99)).not.toThrow();
  });

  it("update preserves updateCount and lastUpdated for existing nodes", () => {
    model.update(sampleNodes, sampleEdges);
    model.trackValueChange("s1", 5);
    const prevCount = model.getNode("s1")!.updateCount;
    const prevLastUpdated = model.getNode("s1")!.lastUpdated;

    // Update with same nodes
    model.update(sampleNodes, sampleEdges);

    const node = model.getNode("s1")!;
    expect(node.updateCount).toBe(prevCount);
    expect(node.lastUpdated).toBe(prevLastUpdated);
  });

  it("initial updateCount and lastUpdated are zero for new nodes", () => {
    model.update(sampleNodes, sampleEdges);

    const node = model.getNode("s1")!;
    expect(node.updateCount).toBe(0);
    expect(node.lastUpdated).toBe(0);
  });
});

// ─── calculateLayout ──────────────────────────────────────────────────────────

describe("calculateLayout", () => {
  it("returns all nodes in the result", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
      { id: "d1", type: "derived", name: "doubled" },
      { id: "e1", type: "effect", name: "logger" },
    ];
    const edges: ReactivityEdge[] = [
      { from: "s1", to: "d1" },
      { from: "d1", to: "e1" },
    ];

    const layout = calculateLayout(nodes, edges);

    expect(layout).toHaveLength(3);
    const ids = layout.map((n) => n.id);
    expect(ids).toContain("s1");
    expect(ids).toContain("d1");
    expect(ids).toContain("e1");
  });

  it("returns empty array for empty input", () => {
    expect(calculateLayout([], [])).toEqual([]);
  });

  it("each layout node has id, x, y, width, height", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
    ];
    const layout = calculateLayout(nodes, []);

    expect(layout).toHaveLength(1);
    const n = layout[0];
    expect(typeof n.id).toBe("string");
    expect(typeof n.x).toBe("number");
    expect(typeof n.y).toBe("number");
    expect(typeof n.width).toBe("number");
    expect(typeof n.height).toBe("number");
    expect(n.width).toBeGreaterThan(0);
    expect(n.height).toBeGreaterThan(0);
  });

  it("positions do not overlap for multiple nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "a" },
      { id: "s2", type: "state", name: "b" },
      { id: "s3", type: "state", name: "c" },
    ];
    const layout = calculateLayout(nodes, []);

    // Check no two nodes occupy the same (x, y) position
    const positions = layout.map((n) => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it("nodes downstream of source have larger x", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
      { id: "d1", type: "derived", name: "doubled" },
    ];
    const edges: ReactivityEdge[] = [{ from: "s1", to: "d1" }];

    const layout = calculateLayout(nodes, edges);
    const s1 = layout.find((n) => n.id === "s1")!;
    const d1 = layout.find((n) => n.id === "d1")!;

    expect(d1.x).toBeGreaterThan(s1.x);
  });
});

// ─── renderGraph / renderNodeDetail ───────────────────────────────────────────

describe("renderGraph", () => {
  let model: ReactivityGraphModel;

  beforeEach(() => {
    model = new ReactivityGraphModel();
  });

  it("returns an SVG string", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];
    model.update(nodes, []);

    const svg = renderGraph(model);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("includes all nodes in the SVG output", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
      { id: "d1", type: "derived", name: "doubled" },
    ];
    const edges: ReactivityEdge[] = [{ from: "s1", to: "d1" }];
    model.update(nodes, edges);

    const svg = renderGraph(model);
    expect(svg).toContain("count");
    expect(svg).toContain("doubled");
  });

  it("includes edge lines in the SVG output", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
      { id: "d1", type: "derived", name: "doubled" },
    ];
    const edges: ReactivityEdge[] = [{ from: "s1", to: "d1" }];
    model.update(nodes, edges);

    const svg = renderGraph(model);
    expect(svg).toContain("<line");
  });

  it("applies blue fill for state nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count" },
    ];
    model.update(nodes, []);

    const svg = renderGraph(model);
    // state color is blue (#4A90D9)
    expect(svg).toContain("#4A90D9");
  });

  it("applies green fill for derived nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "d1", type: "derived", name: "doubled" },
    ];
    model.update(nodes, []);

    const svg = renderGraph(model);
    // derived color is green (#27AE60)
    expect(svg).toContain("#27AE60");
  });

  it("applies orange fill for effect nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "e1", type: "effect", name: "logger" },
    ];
    model.update(nodes, []);

    const svg = renderGraph(model);
    // effect color is orange (#E67E22)
    expect(svg).toContain("#E67E22");
  });

  it("highlights recently updated nodes", () => {
    const nodes: ReactivityNode[] = [
      { id: "s1", type: "state", name: "count", value: 0 },
    ];
    model.update(nodes, []);
    model.trackValueChange("s1", 1);

    const svg = renderGraph(model);
    // Recently updated nodes use gold highlight stroke
    expect(svg).toContain("#FFD700");
  });

  it("returns empty SVG for model with no nodes", () => {
    const svg = renderGraph(model);
    expect(svg).toContain("<svg");
  });
});

describe("renderNodeDetail", () => {
  it("includes node name and type", () => {
    const model = new ReactivityGraphModel();
    model.update([{ id: "s1", type: "state", name: "count", value: 42 }], []);
    const node = model.getNode("s1")!;

    const html = renderNodeDetail(node);
    expect(html).toContain("count");
    expect(html).toContain("state");
  });

  it("includes the current value", () => {
    const model = new ReactivityGraphModel();
    model.update([{ id: "s1", type: "state", name: "count", value: 42 }], []);
    const node = model.getNode("s1")!;

    const html = renderNodeDetail(node);
    expect(html).toContain("42");
  });

  it("includes update count", () => {
    const model = new ReactivityGraphModel();
    model.update([{ id: "s1", type: "state", name: "count", value: 0 }], []);
    model.trackValueChange("s1", 1);
    model.trackValueChange("s1", 2);
    const node = model.getNode("s1")!;

    const html = renderNodeDetail(node);
    expect(html).toContain("2");
  });
});
