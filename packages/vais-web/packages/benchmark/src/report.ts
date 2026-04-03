/**
 * Benchmark result reporter.
 *
 * Generates human-readable markdown tables and ASCII bar charts from
 * BenchmarkResult / FrameworkComparison data.
 */

import type {
  BenchmarkResult,
  FrameworkComparison,
  FrameworkBenchmarkSummary,
} from "./types.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatValue(value: number, unit: string): string {
  if (unit === "bytes") {
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
    return `${value} B`;
  }
  if (unit === "ms") return `${value.toFixed(3)} ms`;
  return `${value} ${unit}`;
}

function padEnd(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - str.length));
}

function padStart(str: string, len: number): string {
  return " ".repeat(Math.max(0, len - str.length)) + str;
}

// ---------------------------------------------------------------------------
// Markdown table
// ---------------------------------------------------------------------------

/**
 * Generate a markdown table from a list of BenchmarkResults that share the
 * same metric.
 */
export function toMarkdownTable(results: BenchmarkResult[]): string {
  if (results.length === 0) return "";

  const metric = results[0].metric;
  const unit = results[0].unit;

  // Find the winner (minimum value)
  const minValue = Math.min(...results.map((r) => r.value));

  const rows = results.map((r) => {
    const isWinner = r.value === minValue;
    const formatted = formatValue(r.value, unit);
    const ratio =
      r.value > 0 && minValue > 0 ? (r.value / minValue).toFixed(2) + "x" : "1.00x";
    const flag = isWinner ? " 🏆" : "";
    return { framework: r.framework + flag, value: formatted, ratio };
  });

  // Column widths
  const fw = Math.max("Framework".length, ...rows.map((r) => r.framework.length));
  const vw = Math.max("Value".length, ...rows.map((r) => r.value.length));
  const rw = Math.max("vs. best".length, ...rows.map((r) => r.ratio.length));

  const sep = `| ${"-".repeat(fw)} | ${"-".repeat(vw)} | ${"-".repeat(rw)} |`;
  const header = `| ${padEnd("Framework", fw)} | ${padEnd("Value", vw)} | ${padEnd("vs. best", rw)} |`;

  const dataRows = rows.map(
    (r) =>
      `| ${padEnd(r.framework, fw)} | ${padEnd(r.value, vw)} | ${padEnd(r.ratio, rw)} |`
  );

  return [
    `### ${metric} (${unit})`,
    "",
    header,
    sep,
    ...dataRows,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// ASCII bar chart
// ---------------------------------------------------------------------------

const BAR_WIDTH = 30;

/**
 * Generate a simple ASCII bar chart for a set of BenchmarkResults.
 *
 * The longest bar corresponds to the highest value; all others are scaled
 * proportionally.
 */
export function toASCIIChart(results: BenchmarkResult[]): string {
  if (results.length === 0) return "";

  const metric = results[0].metric;
  const unit = results[0].unit;
  const maxValue = Math.max(...results.map((r) => r.value));
  const labelWidth = Math.max(...results.map((r) => r.framework.length));

  const lines: string[] = [`${metric} (${unit})`, ""];

  for (const r of results) {
    const barLen = maxValue > 0 ? Math.min(Math.round((r.value / maxValue) * BAR_WIDTH), BAR_WIDTH) : 0;
    const bar = "█".repeat(barLen) + "░".repeat(BAR_WIDTH - barLen);
    const label = padEnd(r.framework, labelWidth);
    const formatted = formatValue(r.value, unit);
    lines.push(`${label} | ${bar} | ${padStart(formatted, 12)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full markdown report
// ---------------------------------------------------------------------------

/**
 * Generate a full markdown benchmark report from per-framework summaries and
 * aggregated comparisons.
 */
export function generateReport(
  summaries: FrameworkBenchmarkSummary[],
  comparisons: FrameworkComparison[]
): string {
  const lines: string[] = [
    "# VaisX Framework Benchmark Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
  ];

  // Summary table with all metrics side by side
  const headers = ["Framework", "Bundle (gz)", "SSR avg", "TTI est.", "Mem delta"];
  const colWidths = headers.map((h) => h.length);

  const summaryRows = summaries.map((s) => [
    s.framework,
    formatValue(s.bundleSize.gzipped, "bytes"),
    formatValue(s.ssr.avgMs, "ms"),
    formatValue(s.hydration.timeToInteractiveMs, "ms"),
    formatValue(Math.max(0, s.memory.delta), "bytes"),
  ]);

  for (const row of summaryRows) {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  }

  const headerRow = `| ${headers.map((h, i) => padEnd(h, colWidths[i])).join(" | ")} |`;
  const sepRow = `| ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`;

  lines.push(headerRow, sepRow);
  for (const row of summaryRows) {
    lines.push(`| ${row.map((cell, i) => padEnd(cell, colWidths[i])).join(" | ")} |`);
  }
  lines.push("");

  // Per-metric breakdown
  lines.push("## Detailed Results", "");

  for (const comp of comparisons) {
    lines.push(toMarkdownTable(comp.results));
    lines.push(
      `> **Winner**: ${comp.winner} — ${comp.improvementRatio.toFixed(2)}x better than next best`,
      ""
    );
    lines.push("```");
    lines.push(toASCIIChart(comp.results));
    lines.push("```", "");
  }

  return lines.join("\n");
}
