// ─── Client → Server messages ────────────────────────────────────────────────

export type SubscribeMessage = {
  type: "subscribe";
  channel: "components" | "reactivity" | "performance";
};

export type UnsubscribeMessage = {
  type: "unsubscribe";
  channel: string;
};

export type InspectMessage = {
  type: "inspect";
  componentId: string;
};

export type HighlightMessage = {
  type: "highlight";
  componentId: string;
  enabled: boolean;
};

export type DevToolsMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | InspectMessage
  | HighlightMessage;

// ─── Server → Client events ──────────────────────────────────────────────────

export type ComponentNode = {
  id: string;
  name: string;
  props: Record<string, unknown>;
  children: ComponentNode[];
};

export type ReactivityNode = {
  id: string;
  type: "state" | "derived" | "effect";
  name: string;
  value?: unknown;
};

export type ReactivityEdge = {
  from: string;
  to: string;
};

export type PerformanceEntry = {
  componentId: string;
  type: "render" | "update";
  duration: number;
  timestamp: number;
};

export type ComponentTreeEvent = {
  type: "component-tree";
  tree: ComponentNode[];
};

export type StateUpdateEvent = {
  type: "state-update";
  componentId: string;
  state: Record<string, unknown>;
};

export type ReactivityGraphEvent = {
  type: "reactivity-graph";
  nodes: ReactivityNode[];
  edges: ReactivityEdge[];
};

export type PerformanceEntryEvent = {
  type: "performance-entry";
  entry: PerformanceEntry;
};

export type DevToolsEvent =
  | ComponentTreeEvent
  | StateUpdateEvent
  | ReactivityGraphEvent
  | PerformanceEntryEvent;
