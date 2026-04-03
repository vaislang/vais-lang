import type { ReactivityNode, ReactivityEdge } from "../../protocol.js";
import type { GraphLayout, VisualNode } from "./types.js";
import { computeLayout } from "./layout.js";

export class ReactivityTracker {
  private layout: GraphLayout;
  private nodeMap: Map<string, VisualNode>;

  constructor() {
    this.layout = { nodes: [], edges: [], width: 0, height: 0 };
    this.nodeMap = new Map();
  }

  updateGraph(nodes: ReactivityNode[], edges: ReactivityEdge[]): GraphLayout {
    const newLayout = computeLayout(nodes, edges);

    // Highlight nodes that changed compared to previous layout
    for (const newNode of newLayout.nodes) {
      const prevNode = this.nodeMap.get(newNode.id);

      if (!prevNode) {
        // New node — highlight it
        newNode.highlighted = true;
        newNode.updateCount = 0;
      } else {
        // Preserve updateCount and check for value change
        newNode.updateCount = prevNode.updateCount;
        if (prevNode.value !== newNode.value) {
          newNode.highlighted = true;
          newNode.updateCount += 1;
        } else {
          newNode.highlighted = false;
        }
      }
    }

    // Rebuild nodeMap
    this.nodeMap = new Map(newLayout.nodes.map((n) => [n.id, n]));
    this.layout = newLayout;

    return this.layout;
  }

  updateNodeValue(nodeId: string, value: unknown): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    node.value = value;
    node.updateCount += 1;
    node.highlighted = true;
  }

  getLayout(): GraphLayout {
    return this.layout;
  }

  clearHighlights(): void {
    for (const node of this.layout.nodes) {
      node.highlighted = false;
    }
  }
}
