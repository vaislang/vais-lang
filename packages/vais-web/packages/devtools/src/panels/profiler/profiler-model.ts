import type { PerformanceEntry } from "../../protocol.js";

export class ProfilerModel {
  entries: PerformanceEntry[] = [];
  recording: boolean = false;

  startRecording(): void {
    this.recording = true;
    this.entries = [];
  }

  stopRecording(): PerformanceEntry[] {
    this.recording = false;
    return [...this.entries];
  }

  addEntry(entry: PerformanceEntry): void {
    if (this.recording) {
      this.entries.push(entry);
    }
  }

  clear(): void {
    this.entries = [];
  }

  getEntriesByComponent(componentId: string): PerformanceEntry[] {
    return this.entries.filter((e) => e.componentId === componentId);
  }

  getAverageRenderTime(componentId: string): number {
    const componentEntries = this.getEntriesByComponent(componentId);
    if (componentEntries.length === 0) return 0;
    const total = componentEntries.reduce((sum, e) => sum + e.duration, 0);
    return total / componentEntries.length;
  }

  getSlowestComponents(
    limit: number = 5
  ): { componentId: string; avgDuration: number }[] {
    const componentIds = [...new Set(this.entries.map((e) => e.componentId))];
    const results = componentIds.map((componentId) => ({
      componentId,
      avgDuration: this.getAverageRenderTime(componentId),
    }));
    results.sort((a, b) => b.avgDuration - a.avgDuration);
    return results.slice(0, limit);
  }

  getTimeline(start?: number, end?: number): PerformanceEntry[] {
    return this.entries.filter((e) => {
      if (start !== undefined && e.timestamp < start) return false;
      if (end !== undefined && e.timestamp > end) return false;
      return true;
    });
  }
}
