import type { ReactivityNode, ReactivityEdge } from "../../protocol.js";
import type { GraphLayout, VisualNode, VisualEdge } from "./types.js";

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 60;
export const LAYER_GAP = 200;
export const NODE_GAP = 80;

const LAYER_ORDER: Array<ReactivityNode["type"]> = ["state", "derived", "effect"];

export function computeLayout(
  nodes: ReactivityNode[],
  edges: ReactivityEdge[]
): GraphLayout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Group nodes by type (topological layer assignment: state → derived → effect)
  const layers: Map<ReactivityNode["type"], ReactivityNode[]> = new Map([
    ["state", []],
    ["derived", []],
    ["effect", []],
  ]);

  for (const node of nodes) {
    layers.get(node.type)?.push(node);
  }

  // Build visual nodes with positions
  const visualNodeMap = new Map<string, VisualNode>();

  LAYER_ORDER.forEach((layerType, layerIndex) => {
    const layerNodes = layers.get(layerType) ?? [];
    layerNodes.forEach((node, nodeIndex) => {
      const x = layerIndex * (NODE_WIDTH + LAYER_GAP);
      const y = nodeIndex * (NODE_HEIGHT + NODE_GAP);

      const visualNode: VisualNode = {
        id: node.id,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        label: node.name,
        type: node.type,
        value: node.value,
        updateCount: 0,
        highlighted: false,
      };

      visualNodeMap.set(node.id, visualNode);
    });
  });

  // Calculate canvas dimensions
  const allVisualNodes = Array.from(visualNodeMap.values());

  let maxX = 0;
  let maxY = 0;
  for (const vn of allVisualNodes) {
    if (vn.x + vn.width > maxX) maxX = vn.x + vn.width;
    if (vn.y + vn.height > maxY) maxY = vn.y + vn.height;
  }

  // Compute edge coordinates based on node center points
  const visualEdges: VisualEdge[] = [];

  for (const edge of edges) {
    const fromNode = visualNodeMap.get(edge.from);
    const toNode = visualNodeMap.get(edge.to);

    if (!fromNode || !toNode) continue;

    const visualEdge: VisualEdge = {
      from: edge.from,
      to: edge.to,
      fromX: fromNode.x + fromNode.width / 2,
      fromY: fromNode.y + fromNode.height / 2,
      toX: toNode.x + toNode.width / 2,
      toY: toNode.y + toNode.height / 2,
    };

    visualEdges.push(visualEdge);
  }

  return {
    nodes: allVisualNodes,
    edges: visualEdges,
    width: maxX,
    height: maxY,
  };
}
