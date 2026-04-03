import type { ReactivityGraphModel, TrackedNode } from "./graph-model.js";
import { calculateLayout } from "./graph-layout.js";

export type RenderOptions = {
  width?: number;
  height?: number;
  recentThresholdMs?: number;
};

const NODE_COLORS: Record<string, string> = {
  state: "#4A90D9",
  derived: "#27AE60",
  effect: "#E67E22",
};

const RECENT_HIGHLIGHT = "#FFD700";
const DEFAULT_RECENT_THRESHOLD_MS = 5000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderGraph(
  model: ReactivityGraphModel,
  options: RenderOptions = {}
): string {
  const {
    width = 800,
    height = 600,
    recentThresholdMs = DEFAULT_RECENT_THRESHOLD_MS,
  } = options;

  const nodeList = Array.from(model.nodes.values());
  const layout = calculateLayout(nodeList, model.edges);

  // Build a quick position map
  const posMap = new Map(layout.map((l) => [l.id, l]));

  const now = Date.now();

  // Render edges (arrows) first so they appear behind nodes
  const edgeSvg = model.edges
    .map((edge) => {
      const from = posMap.get(edge.from);
      const to = posMap.get(edge.to);
      if (!from || !to) return "";

      // Connect right-center of source to left-center of target
      const x1 = from.x + from.width;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;

      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)" />`;
    })
    .filter(Boolean)
    .join("\n    ");

  // Render nodes
  const nodeSvg = nodeList
    .map((node) => {
      const pos = posMap.get(node.id);
      if (!pos) return "";

      const isRecent = now - node.lastUpdated < recentThresholdMs && node.lastUpdated > 0;
      const fillColor = NODE_COLORS[node.type] ?? "#999";
      const stroke = isRecent ? RECENT_HIGHLIGHT : "#333";
      const strokeWidth = isRecent ? 3 : 1;
      const label = escapeXml(node.name);
      const typeLabel = escapeXml(node.type);

      return [
        `<g class="node" data-id="${escapeXml(node.id)}" data-type="${typeLabel}">`,
        `  <rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}"`,
        `        fill="${fillColor}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="4" ry="4" />`,
        `  <text x="${pos.x + pos.width / 2}" y="${pos.y + pos.height / 2 + 5}"`,
        `        text-anchor="middle" font-size="12" fill="#fff" font-family="sans-serif">${label}</text>`,
        `</g>`,
      ].join("\n    ");
    })
    .filter(Boolean)
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="#1e1e2e" />
    ${edgeSvg}
    ${nodeSvg}
</svg>`;
}

export function renderNodeDetail(node: TrackedNode): string {
  const deps = [] as string[]; // Caller should pass deps if needed; simple version uses node data
  const valueStr = escapeXml(JSON.stringify(node.value ?? null));
  const nameStr = escapeXml(node.name);
  const typeStr = escapeXml(node.type);

  return `<div class="node-detail">
  <h3>${nameStr} <span class="node-type">(${typeStr})</span></h3>
  <dl>
    <dt>Current value</dt>
    <dd><code>${valueStr}</code></dd>
    <dt>Update count</dt>
    <dd>${node.updateCount}</dd>
    <dt>Last updated</dt>
    <dd>${node.lastUpdated > 0 ? new Date(node.lastUpdated).toISOString() : "never"}</dd>
    ${deps.length > 0 ? `<dt>Dependencies</dt><dd>${deps.map(escapeXml).join(", ")}</dd>` : ""}
  </dl>
</div>`;
}
