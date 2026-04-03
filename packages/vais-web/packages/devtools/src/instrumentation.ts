import type { InspectorServer } from "./inspector.js";
import type {
  ComponentNode,
  ReactivityEdge,
  ReactivityNode,
  PerformanceEntry,
} from "./protocol.js";

export class Instrumentation {
  private inspector: InspectorServer;
  private components: Map<string, ComponentNode> = new Map();
  private componentState: Map<string, Record<string, unknown>> = new Map();

  constructor(inspector: InspectorServer) {
    this.inspector = inspector;
  }

  trackComponent(
    id: string,
    name: string,
    props: Record<string, unknown>
  ): void {
    const node: ComponentNode = {
      id,
      name,
      props,
      children: [],
    };
    this.components.set(id, node);

    this.inspector.broadcast({
      type: "component-tree",
      tree: this.getComponentTree(),
    });
  }

  removeComponent(id: string): void {
    this.components.delete(id);
    this.componentState.delete(id);

    this.inspector.broadcast({
      type: "component-tree",
      tree: this.getComponentTree(),
    });
  }

  trackStateChange(
    componentId: string,
    key: string,
    value: unknown
  ): void {
    const existing = this.componentState.get(componentId) ?? {};
    const updated = { ...existing, [key]: value };
    this.componentState.set(componentId, updated);

    this.inspector.broadcast({
      type: "state-update",
      componentId,
      state: updated,
    });
  }

  trackReactivityGraph(
    nodes: ReactivityNode[],
    edges: ReactivityEdge[]
  ): void {
    this.inspector.broadcast({
      type: "reactivity-graph",
      nodes,
      edges,
    });
  }

  trackPerformance(entry: PerformanceEntry): void {
    this.inspector.broadcast({
      type: "performance-entry",
      entry,
    });
  }

  getComponentTree(): ComponentNode[] {
    return Array.from(this.components.values());
  }
}
