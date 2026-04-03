export type VisualNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type: "state" | "derived" | "effect";
  value?: unknown;
  updateCount: number;
  highlighted: boolean;
};

export type VisualEdge = {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export type GraphLayout = {
  nodes: VisualNode[];
  edges: VisualEdge[];
  width: number;
  height: number;
};
