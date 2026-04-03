import type { ReactivityNode, ReactivityEdge } from "../../protocol.js";

export type TrackedNode = ReactivityNode & {
  updateCount: number;
  lastUpdated: number;
};

export class ReactivityGraphModel {
  nodes: Map<string, TrackedNode> = new Map();
  edges: ReactivityEdge[] = [];

  update(nodes: ReactivityNode[], edges: ReactivityEdge[]): void {
    const nextNodes = new Map<string, TrackedNode>();
    for (const node of nodes) {
      const existing = this.nodes.get(node.id);
      nextNodes.set(node.id, {
        ...node,
        updateCount: existing?.updateCount ?? 0,
        lastUpdated: existing?.lastUpdated ?? 0,
      });
    }
    this.nodes = nextNodes;
    this.edges = [...edges];
  }

  getNode(id: string): TrackedNode | undefined {
    return this.nodes.get(id);
  }

  getDependencies(nodeId: string): string[] {
    // edges where nodeId is the "to" end — nodeId depends on the "from" node
    return this.edges
      .filter((e) => e.to === nodeId)
      .map((e) => e.from);
  }

  getDependents(nodeId: string): string[] {
    // edges where nodeId is the "from" end — nodes that depend on nodeId
    return this.edges
      .filter((e) => e.from === nodeId)
      .map((e) => e.to);
  }

  trackValueChange(nodeId: string, value: unknown): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.value = value;
    node.updateCount += 1;
    node.lastUpdated = Date.now();
  }
}
