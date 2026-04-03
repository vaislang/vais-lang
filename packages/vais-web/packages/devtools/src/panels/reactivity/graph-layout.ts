import type { ReactivityNode, ReactivityEdge } from "../../protocol.js";

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const NODE_WIDTH = 120;
const NODE_HEIGHT = 40;
const H_GAP = 60;
const V_GAP = 60;

/**
 * Layered (topological) layout.
 * Nodes are assigned to layers based on their longest path from a source
 * (no incoming edges). Within each layer nodes are spread vertically.
 */
export function calculateLayout(
  nodes: ReactivityNode[],
  edges: ReactivityEdge[]
): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Build adjacency helpers
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  }

  for (const e of edges) {
    if (!inDegree.has(e.to)) continue;
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    const list = outEdges.get(e.from);
    if (list) list.push(e.to);
  }

  // Kahn's algorithm to assign layers
  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
  }

  const remaining = new Map(inDegree);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layer.get(current) ?? 0;
    for (const neighbor of outEdges.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      if ((layer.get(neighbor) ?? 0) < newLayer) {
        layer.set(neighbor, newLayer);
      }
      const deg = (remaining.get(neighbor) ?? 1) - 1;
      remaining.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  // Nodes that were not reached by Kahn's (cycles) get layer 0
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, l] of layer) {
    const group = layerGroups.get(l) ?? [];
    group.push(id);
    layerGroups.set(l, group);
  }

  // Assign positions
  const result: LayoutNode[] = [];
  for (const [l, ids] of layerGroups) {
    const x = l * (NODE_WIDTH + H_GAP);
    ids.forEach((id, i) => {
      result.push({
        id,
        x,
        y: i * (NODE_HEIGHT + V_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  return result;
}
