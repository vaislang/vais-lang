import { describe, it, expect, beforeEach } from "vitest";
import { ProfilerModel } from "../src/panels/profiler/profiler-model.js";
import { FlameChartRenderer } from "../src/panels/profiler/flame-chart.js";
import { CauseTracker } from "../src/panels/profiler/cause-tracker.js";
import type { PerformanceEntry } from "../src/protocol.js";

// ─── ProfilerModel ────────────────────────────────────────────────────────────

describe("ProfilerModel", () => {
  let model: ProfilerModel;

  beforeEach(() => {
    model = new ProfilerModel();
  });

  it("starts with empty entries and not recording", () => {
    expect(model.entries).toHaveLength(0);
    expect(model.recording).toBe(false);
  });

  it("startRecording sets recording to true and clears entries", () => {
    model.entries = [
      { componentId: "A", type: "render", duration: 10, timestamp: 100 },
    ];
    model.startRecording();
    expect(model.recording).toBe(true);
    expect(model.entries).toHaveLength(0);
  });

  it("stopRecording returns collected entries and sets recording to false", () => {
    model.startRecording();
    const entry: PerformanceEntry = {
      componentId: "comp-1",
      type: "render",
      duration: 20,
      timestamp: 1000,
    };
    model.addEntry(entry);
    const result = model.stopRecording();
    expect(model.recording).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0].componentId).toBe("comp-1");
  });

  it("addEntry does nothing when not recording", () => {
    const entry: PerformanceEntry = {
      componentId: "comp-1",
      type: "render",
      duration: 20,
      timestamp: 1000,
    };
    model.addEntry(entry);
    expect(model.entries).toHaveLength(0);
  });

  it("addEntry records entry when recording", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "comp-2",
      type: "update",
      duration: 30,
      timestamp: 1100,
    });
    expect(model.entries).toHaveLength(2);
  });

  it("clear resets all entries", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.stopRecording();
    model.clear();
    expect(model.entries).toHaveLength(0);
  });

  it("getEntriesByComponent filters correctly", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "comp-2",
      type: "render",
      duration: 20,
      timestamp: 1100,
    });
    model.addEntry({
      componentId: "comp-1",
      type: "update",
      duration: 15,
      timestamp: 1200,
    });
    model.stopRecording();

    const comp1Entries = model.getEntriesByComponent("comp-1");
    expect(comp1Entries).toHaveLength(2);
    expect(comp1Entries.every((e) => e.componentId === "comp-1")).toBe(true);
  });

  it("getAverageRenderTime returns 0 for unknown component", () => {
    expect(model.getAverageRenderTime("unknown")).toBe(0);
  });

  it("getAverageRenderTime calculates correctly", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 30,
      timestamp: 1100,
    });
    model.stopRecording();

    expect(model.getAverageRenderTime("comp-1")).toBe(20);
  });

  it("getSlowestComponents returns sorted by avgDuration descending", () => {
    model.startRecording();
    model.addEntry({
      componentId: "fast",
      type: "render",
      duration: 5,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "slow",
      type: "render",
      duration: 100,
      timestamp: 1100,
    });
    model.addEntry({
      componentId: "medium",
      type: "render",
      duration: 30,
      timestamp: 1200,
    });
    model.stopRecording();

    const slowest = model.getSlowestComponents();
    expect(slowest[0].componentId).toBe("slow");
    expect(slowest[1].componentId).toBe("medium");
    expect(slowest[2].componentId).toBe("fast");
  });

  it("getSlowestComponents respects limit", () => {
    model.startRecording();
    for (let i = 0; i < 10; i++) {
      model.addEntry({
        componentId: `comp-${i}`,
        type: "render",
        duration: i * 10,
        timestamp: 1000 + i,
      });
    }
    model.stopRecording();

    const slowest = model.getSlowestComponents(3);
    expect(slowest).toHaveLength(3);
  });

  it("getTimeline filters by start and end timestamp", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "comp-2",
      type: "render",
      duration: 20,
      timestamp: 2000,
    });
    model.addEntry({
      componentId: "comp-3",
      type: "render",
      duration: 30,
      timestamp: 3000,
    });
    model.stopRecording();

    const timeline = model.getTimeline(1500, 2500);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].componentId).toBe("comp-2");
  });

  it("getTimeline with no bounds returns all entries", () => {
    model.startRecording();
    model.addEntry({
      componentId: "comp-1",
      type: "render",
      duration: 10,
      timestamp: 1000,
    });
    model.addEntry({
      componentId: "comp-2",
      type: "render",
      duration: 20,
      timestamp: 2000,
    });
    model.stopRecording();

    expect(model.getTimeline()).toHaveLength(2);
  });
});

// ─── FlameChartRenderer ───────────────────────────────────────────────────────

describe("FlameChartRenderer", () => {
  let renderer: FlameChartRenderer;

  beforeEach(() => {
    renderer = new FlameChartRenderer();
  });

  it("renders SVG string with rect elements", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "comp-1", type: "render", duration: 10, timestamp: 1000 },
      { componentId: "comp-2", type: "render", duration: 60, timestamp: 1050 },
    ];
    const svg = renderer.render(entries);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<rect");
  });

  it("applies green color for fast renders (duration <= 16ms)", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "fast", type: "render", duration: 10, timestamp: 1000 },
    ];
    const svg = renderer.render(entries);
    expect(svg).toContain('fill="green"');
  });

  it("applies red color for slow renders (duration >= 50ms)", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "slow", type: "render", duration: 80, timestamp: 1000 },
    ];
    const svg = renderer.render(entries);
    expect(svg).toContain('fill="red"');
  });

  it("applies yellow color for medium renders", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "medium", type: "render", duration: 30, timestamp: 1000 },
    ];
    const svg = renderer.render(entries);
    expect(svg).toContain('fill="yellow"');
  });

  it("renders empty SVG for no entries", () => {
    const svg = renderer.render([]);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<rect");
  });

  it("respects custom width and height options", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "comp-1", type: "render", duration: 10, timestamp: 1000 },
    ];
    const svg = renderer.render(entries, { width: 1200, height: 400 });
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="400"');
  });

  it("respects custom thresholds", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "comp-1", type: "render", duration: 20, timestamp: 1000 },
    ];
    // With threshold fast=25, 20ms should be green
    const svg = renderer.render(entries, {
      thresholds: { fast: 25, slow: 60 },
    });
    expect(svg).toContain('fill="green"');
  });

  it("renders a rect for each entry", () => {
    const entries: PerformanceEntry[] = [
      { componentId: "a", type: "render", duration: 10, timestamp: 1000 },
      { componentId: "b", type: "render", duration: 30, timestamp: 1100 },
      { componentId: "c", type: "render", duration: 70, timestamp: 1200 },
    ];
    const svg = renderer.render(entries);
    const rectCount = (svg.match(/<rect/g) ?? []).length;
    expect(rectCount).toBe(3);
  });
});

// ─── CauseTracker ────────────────────────────────────────────────────────────

describe("CauseTracker", () => {
  let tracker: CauseTracker;

  beforeEach(() => {
    tracker = new CauseTracker();
  });

  it("trackCause records a new cause", () => {
    tracker.trackCause("comp-1", "count", 1000);
    const causes = tracker.getCauses("comp-1");
    expect(causes).toHaveLength(1);
    expect(causes[0].triggerState).toBe("count");
    expect(causes[0].count).toBe(1);
    expect(causes[0].lastTimestamp).toBe(1000);
  });

  it("trackCause increments count for repeated causes", () => {
    tracker.trackCause("comp-1", "count", 1000);
    tracker.trackCause("comp-1", "count", 2000);
    tracker.trackCause("comp-1", "count", 3000);
    const causes = tracker.getCauses("comp-1");
    expect(causes).toHaveLength(1);
    expect(causes[0].count).toBe(3);
    expect(causes[0].lastTimestamp).toBe(3000);
  });

  it("getCauses returns empty array for unknown component", () => {
    expect(tracker.getCauses("unknown")).toHaveLength(0);
  });

  it("getCauses tracks multiple states per component", () => {
    tracker.trackCause("comp-1", "count", 1000);
    tracker.trackCause("comp-1", "name", 1100);
    tracker.trackCause("comp-1", "count", 1200);
    const causes = tracker.getCauses("comp-1");
    expect(causes).toHaveLength(2);
    const countCause = causes.find((c) => c.triggerState === "count");
    expect(countCause?.count).toBe(2);
  });

  it("getCauses sorts by count descending", () => {
    tracker.trackCause("comp-1", "rarely", 1000);
    tracker.trackCause("comp-1", "often", 1100);
    tracker.trackCause("comp-1", "often", 1200);
    tracker.trackCause("comp-1", "often", 1300);
    const causes = tracker.getCauses("comp-1");
    expect(causes[0].triggerState).toBe("often");
    expect(causes[0].count).toBe(3);
  });

  it("getMostFrequentCauses aggregates across components", () => {
    tracker.trackCause("comp-1", "count", 1000);
    tracker.trackCause("comp-1", "count", 1100);
    tracker.trackCause("comp-2", "name", 1200);
    tracker.trackCause("comp-2", "name", 1300);
    tracker.trackCause("comp-2", "name", 1400);
    tracker.trackCause("comp-3", "value", 1500);

    const mostFrequent = tracker.getMostFrequentCauses();
    expect(mostFrequent[0].componentId).toBe("comp-2");
    expect(mostFrequent[0].triggerState).toBe("name");
    expect(mostFrequent[0].count).toBe(3);
  });

  it("getMostFrequentCauses respects limit", () => {
    for (let i = 0; i < 10; i++) {
      tracker.trackCause(`comp-${i}`, "state", 1000 + i);
    }
    const result = tracker.getMostFrequentCauses(3);
    expect(result).toHaveLength(3);
  });
});
