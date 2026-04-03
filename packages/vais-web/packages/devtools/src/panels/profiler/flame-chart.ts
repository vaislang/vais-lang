import type { PerformanceEntry } from "../../protocol.js";

export interface FlameChartOptions {
  width?: number;
  height?: number;
  thresholds?: { fast: number; slow: number };
}

const DEFAULT_THRESHOLDS = { fast: 16, slow: 50 };
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 200;
const BAR_HEIGHT = 20;
const BAR_PADDING = 2;

export class FlameChartRenderer {
  render(entries: PerformanceEntry[], options?: FlameChartOptions): string {
    const width = options?.width ?? DEFAULT_WIDTH;
    const height = options?.height ?? DEFAULT_HEIGHT;
    const thresholds = options?.thresholds ?? DEFAULT_THRESHOLDS;

    if (entries.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
    }

    const minTime = Math.min(...entries.map((e) => e.timestamp));
    const maxTime = Math.max(...entries.map((e) => e.timestamp + e.duration));
    const totalDuration = maxTime - minTime || 1;

    const rects = entries
      .map((entry) => {
        const x = ((entry.timestamp - minTime) / totalDuration) * width;
        const rectWidth = Math.max(
          1,
          (entry.duration / totalDuration) * width
        );
        const y = BAR_PADDING;
        const color = this.getColor(entry.duration, thresholds);
        const label = `${entry.componentId} (${entry.duration.toFixed(1)}ms)`;

        return `  <rect x="${x.toFixed(2)}" y="${y}" width="${rectWidth.toFixed(2)}" height="${BAR_HEIGHT}" fill="${color}">
    <title>${label}</title>
  </rect>`;
      })
      .join("\n");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">\n${rects}\n</svg>`;
  }

  private getColor(
    duration: number,
    thresholds: { fast: number; slow: number }
  ): string {
    if (duration <= thresholds.fast) return "green";
    if (duration >= thresholds.slow) return "red";
    return "yellow";
  }
}
