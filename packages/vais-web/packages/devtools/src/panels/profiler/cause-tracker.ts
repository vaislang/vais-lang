interface CauseRecord {
  triggerState: string;
  count: number;
  lastTimestamp: number;
}

export class CauseTracker {
  private causes: Map<string, Map<string, CauseRecord>> = new Map();

  trackCause(
    componentId: string,
    triggerState: string,
    timestamp: number
  ): void {
    if (!this.causes.has(componentId)) {
      this.causes.set(componentId, new Map());
    }
    const componentCauses = this.causes.get(componentId)!;

    if (componentCauses.has(triggerState)) {
      const record = componentCauses.get(triggerState)!;
      record.count += 1;
      record.lastTimestamp = timestamp;
    } else {
      componentCauses.set(triggerState, {
        triggerState,
        count: 1,
        lastTimestamp: timestamp,
      });
    }
  }

  getCauses(
    componentId: string
  ): { triggerState: string; count: number; lastTimestamp: number }[] {
    const componentCauses = this.causes.get(componentId);
    if (!componentCauses) return [];
    return [...componentCauses.values()].sort((a, b) => b.count - a.count);
  }

  getMostFrequentCauses(
    limit: number = 5
  ): { componentId: string; triggerState: string; count: number }[] {
    const results: { componentId: string; triggerState: string; count: number }[] =
      [];

    for (const [componentId, componentCauses] of this.causes) {
      for (const record of componentCauses.values()) {
        results.push({
          componentId,
          triggerState: record.triggerState,
          count: record.count,
        });
      }
    }

    results.sort((a, b) => b.count - a.count);
    return results.slice(0, limit);
  }
}
