/**
 * A11yAuditor — accessibility audit logic for the vaisx a11y-audit CLI command.
 *
 * Provides file and directory auditing using A11yLinter, with three output
 * formats (text, json, table) and a deterministic exit-code helper.
 *
 * NOTE: This module contains the audit logic class, not the CLI bin entry-point.
 */

import type { LintDiagnostic } from "./types.js";
import { A11yLinter } from "./lint.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result for a single audited file. */
export interface FileResult {
  /** Absolute or relative path to the audited file. */
  filePath: string;
  /** All lint diagnostics produced for this file. */
  diagnostics: LintDiagnostic[];
  /** Number of diagnostics with severity "error" or "warning". */
  violations: number;
  /** Number of diagnostics with severity "info" (informational passes). */
  passes: number;
}

/** Aggregated audit report for one or more files. */
export interface AuditReport {
  /** Per-file results in the order they were audited. */
  files: FileResult[];
  /** Total violation count across all files. */
  totalViolations: number;
  /** Total pass count across all files. */
  totalPasses: number;
  /** Human-readable summary line. */
  summary: string;
}

/** Configuration for A11yAuditor. */
export interface A11yAuditConfig {
  /**
   * Glob patterns to include (relative to the directory being audited).
   * Defaults to ["**\/*.vaisx", "**\/*.html"].
   */
  include?: string[];
  /**
   * Glob patterns to exclude (relative to the directory being audited).
   * Defaults to ["node_modules/**", "dist/**", ".git/**"].
   */
  exclude?: string[];
  /** Minimum severity level to count as a violation. Defaults to "warning". */
  level?: "error" | "warning" | "info";
  /** Output format used by formatReport(). Defaults to "text". */
  format?: "text" | "json" | "table";
}

// ─── Internal FS adapter types (for test injection) ───────────────────────────

/** Minimal directory entry shape returned by readdir({ withFileTypes: true }). */
export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Injectable file-system adapter (subset of node:fs/promises). */
export interface FsAdapter {
  readFile(path: string, encoding: "utf-8"): Promise<string>;
  readdir(path: string, opts: { withFileTypes: true }): Promise<DirEntry[]>;
}

/** Injectable path adapter (subset of node:path). */
export interface PathAdapter {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
}

// ─── Fix-guide map ────────────────────────────────────────────────────────────

/** Per-rule remediation guidance shown in text/table output. */
const RULE_GUIDES: Record<string, string> = {
  "img-alt":
    'Add an alt attribute: <img src="..." alt="Descriptive text"> or alt="" for decorative images.',
  "aria-role":
    "Use a valid WAI-ARIA 1.2 role from https://www.w3.org/TR/wai-aria-1.2/#role_definitions.",
  "aria-props":
    "Use a valid WAI-ARIA 1.2 property from https://www.w3.org/TR/wai-aria-1.2/#state_prop_def.",
  "button-type":
    'Add an explicit type: <button type="button">, <button type="submit">, or <button type="reset">.',
  "label-for":
    'Associate a label: <label for="id">, or add aria-label="..." / aria-labelledby="id" to the input.',
  "heading-order":
    "Do not skip heading levels. Each heading should increase by at most one level (e.g. h1 → h2 → h3).",
  "tabindex-positive":
    'Use tabindex="0" to include an element in natural tab order, or tabindex="-1" for programmatic focus only.',
};

function getGuide(ruleId: string): string {
  return RULE_GUIDES[ruleId] ?? "Refer to the WAI-ARIA Authoring Practices for guidance.";
}

// ─── A11yAuditor ─────────────────────────────────────────────────────────────

/**
 * Accessibility auditor — wraps A11yLinter with file-system I/O, directory
 * traversal, report aggregation, and output formatting.
 *
 * ```ts
 * const auditor = new A11yAuditor();
 * const report  = await auditor.auditDirectory('./src');
 * console.log(auditor.formatReport(report, 'text'));
 * process.exit(auditor.getExitCode(report));
 * ```
 *
 * For unit tests, pass `_fs` and `_path` to inject mock adapters:
 *
 * ```ts
 * const auditor = new A11yAuditor({}, mockFs, mockPath);
 * ```
 */
export class A11yAuditor {
  private readonly config: Required<A11yAuditConfig>;
  private readonly linter: A11yLinter;
  private readonly _fs: FsAdapter | null;
  private readonly _path: PathAdapter | null;

  constructor(
    config: A11yAuditConfig = {},
    /** Optional fs adapter — injected in tests; production uses node:fs/promises. */
    fsAdapter?: FsAdapter,
    /** Optional path adapter — injected in tests; production uses node:path. */
    pathAdapter?: PathAdapter
  ) {
    this.config = {
      include: config.include ?? ["**/*.vaisx", "**/*.html"],
      exclude: config.exclude ?? ["node_modules/**", "dist/**", ".git/**"],
      level: config.level ?? "warning",
      format: config.format ?? "text",
    };
    this.linter = new A11yLinter();
    this._fs = fsAdapter ?? null;
    this._path = pathAdapter ?? null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Audit a single .vaisx or .html file.
   *
   * @param filePath  Path to the file to lint.
   * @returns         FileResult with diagnostics, violation count, and pass count.
   */
  async auditFile(filePath: string): Promise<FileResult> {
    const fs = await this._getFs();
    const source = await fs.readFile(filePath, "utf-8");
    return this._lintSource(source, filePath);
  }

  /**
   * Recursively audit all matching files inside a directory.
   *
   * @param dirPath  Root directory to scan.
   * @param options  Optional per-call config overrides (merged with constructor config).
   * @returns        Aggregated AuditReport.
   */
  async auditDirectory(dirPath: string, options?: Partial<A11yAuditConfig>): Promise<AuditReport> {
    const mergedConfig: Required<A11yAuditConfig> = {
      include: options?.include ?? this.config.include,
      exclude: options?.exclude ?? this.config.exclude,
      level: options?.level ?? this.config.level,
      format: options?.format ?? this.config.format,
    };

    const filePaths = await this._collectFiles(dirPath, mergedConfig);
    const fileResults: FileResult[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.auditFile(filePath);
        fileResults.push(result);
      } catch {
        // File unreadable — include an empty result so the path appears in the report
        fileResults.push({
          filePath,
          diagnostics: [],
          violations: 0,
          passes: 0,
        });
      }
    }

    return this._buildReport(fileResults);
  }

  /**
   * Format an AuditReport for output.
   *
   * @param report  The report to format.
   * @param format  "text" | "json" | "table"
   */
  formatReport(report: AuditReport, format: "text" | "json" | "table"): string {
    switch (format) {
      case "json":
        return this._formatJson(report);
      case "table":
        return this._formatTable(report);
      case "text":
      default:
        return this._formatText(report);
    }
  }

  /**
   * Return an appropriate process exit code based on the report.
   *
   * @returns 0 if no violations, 1 if one or more violations.
   */
  getExitCode(report: AuditReport): 0 | 1 {
    return report.totalViolations > 0 ? 1 : 0;
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────────

  /** Resolve the fs adapter: injected mock or real node:fs/promises. */
  private async _getFs(): Promise<FsAdapter> {
    if (this._fs) return this._fs;
    // Use indirect import to avoid requiring @types/node in the tsconfig lib list.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = await (new Function("m", "return import(m)"))("node:fs/promises");
    return mod as FsAdapter;
  }

  /** Resolve the path adapter: injected mock or real node:path. */
  private async _getPath(): Promise<PathAdapter> {
    if (this._path) return this._path;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = await (new Function("m", "return import(m)"))("node:path");
    return mod as PathAdapter;
  }

  /** Lint a source string and build a FileResult. */
  private _lintSource(source: string, filePath: string): FileResult {
    const diagnostics = this.linter.lint(source, filePath);
    const violations = diagnostics.filter((d) => this._isViolation(d)).length;
    const passes = diagnostics.filter((d) => !this._isViolation(d)).length;
    return { filePath, diagnostics, violations, passes };
  }

  /** Decide whether a diagnostic counts as a violation given the configured level. */
  private _isViolation(d: LintDiagnostic): boolean {
    const level = this.config.level;
    if (level === "info") return true;
    if (level === "warning") return d.severity === "error" || d.severity === "warning";
    // level === "error"
    return d.severity === "error";
  }

  /** Build an AuditReport from a list of FileResults. */
  private _buildReport(files: FileResult[]): AuditReport {
    const totalViolations = files.reduce((n, f) => n + f.violations, 0);
    const totalPasses = files.reduce((n, f) => n + f.passes, 0);
    const summary =
      totalViolations === 0
        ? `All ${files.length} file(s) passed accessibility checks.`
        : `Found ${totalViolations} violation(s) in ${
            files.filter((f) => f.violations > 0).length
          } of ${files.length} file(s).`;
    return { files, totalViolations, totalPasses, summary };
  }

  /**
   * Collect all files in dirPath that match the include patterns and do not
   * match any of the exclude patterns.
   *
   * Uses Node.js fs APIs with manual recursive traversal to avoid adding a
   * glob library dependency. Patterns are converted to simple RegExps:
   *   **\/foo  → any path ending with /foo
   *   *.ext    → any file with .ext extension
   */
  private async _collectFiles(
    dirPath: string,
    config: Required<A11yAuditConfig>
  ): Promise<string[]> {
    const fs = await this._getFs();
    const path = await this._getPath();

    const includeRe = config.include.map(globToRegex);
    const excludeRe = config.exclude.map(globToRegex);

    const results: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: DirEntry[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Compute path relative to the root dir for pattern matching
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, "/");

        if (excludeRe.some((re) => re.test(relPath))) continue;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          if (includeRe.some((re) => re.test(relPath))) {
            results.push(fullPath);
          }
        }
      }
    };

    await walk(dirPath);
    return results;
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  private _formatText(report: AuditReport): string {
    const lines: string[] = [];

    for (const file of report.files) {
      if (file.diagnostics.length === 0) continue;
      lines.push(`\nFile: ${file.filePath}`);
      lines.push(`  Violations: ${file.violations}  Passes: ${file.passes}`);
      for (const d of file.diagnostics) {
        const loc = `${d.line}:${d.column}`;
        lines.push(`  [${d.severity.toUpperCase()}] ${loc}  ${d.ruleId}  ${d.message}`);
        lines.push(`    Fix: ${getGuide(d.ruleId)}`);
      }
    }

    lines.push("");
    lines.push("Summary: " + report.summary);
    lines.push(`Total violations: ${report.totalViolations}`);
    lines.push(`Total passes:     ${report.totalPasses}`);

    return lines.join("\n");
  }

  private _formatJson(report: AuditReport): string {
    const output = {
      summary: report.summary,
      totalViolations: report.totalViolations,
      totalPasses: report.totalPasses,
      files: report.files.map((f) => ({
        filePath: f.filePath,
        violations: f.violations,
        passes: f.passes,
        diagnostics: f.diagnostics.map((d) => ({
          ...d,
          fix: getGuide(d.ruleId),
        })),
      })),
    };
    return JSON.stringify(output, null, 2);
  }

  private _formatTable(report: AuditReport): string {
    const lines: string[] = [];
    const col1W = Math.max(20, ...report.files.map((f) => f.filePath.length));
    const header =
      pad("File", col1W) + "  " + pad("Violations", 10) + "  " + pad("Passes", 6);
    const separator = "-".repeat(header.length);

    lines.push(separator);
    lines.push(header);
    lines.push(separator);

    for (const f of report.files) {
      lines.push(
        pad(f.filePath, col1W) +
          "  " +
          pad(String(f.violations), 10) +
          "  " +
          pad(String(f.passes), 6)
      );
    }

    lines.push(separator);
    lines.push(
      pad("TOTAL", col1W) +
        "  " +
        pad(String(report.totalViolations), 10) +
        "  " +
        pad(String(report.totalPasses), 6)
    );
    lines.push(separator);
    lines.push("");
    lines.push(report.summary);

    if (report.totalViolations > 0) {
      lines.push("");
      lines.push("Violation details:");
      for (const f of report.files) {
        if (f.violations === 0) continue;
        lines.push(`\n  ${f.filePath}`);
        for (const d of f.diagnostics) {
          if (!this._isViolation(d)) continue;
          lines.push(`    [${d.severity.toUpperCase()}] ${d.ruleId} @ ${d.line}:${d.column}`);
          lines.push(`      ${d.message}`);
          lines.push(`      Fix: ${getGuide(d.ruleId)}`);
        }
      }
    }

    return lines.join("\n");
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

/** Right-pad a string with spaces to width. */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports:
 *   **\/    → zero or more path segments (e.g. **\/*.html matches foo.html and a/b/foo.html)
 *   **      → any characters including /
 *   *       → any characters except /
 *
 * Uses placeholder substitution to avoid re-processing already-converted tokens.
 */
function globToRegex(pattern: string): RegExp {
  const GLOBSTAR_SLASH = "\x00GS\x00";
  const GLOBSTAR = "\x00G\x00";
  const STAR = "\x00S\x00";

  // Phase 1: replace glob tokens with placeholders (longest first)
  let s = pattern
    .replace(/\*\*\//g, GLOBSTAR_SLASH)
    .replace(/\*\*/g, GLOBSTAR)
    .replace(/\*/g, STAR);

  // Phase 2: escape regex special characters (no * remain at this point)
  s = s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  // Phase 3: restore glob constructs as regex equivalents
  s = s
    .replace(new RegExp(GLOBSTAR_SLASH, "g"), "(?:[^/]+/)*")
    .replace(new RegExp(GLOBSTAR, "g"), ".*")
    .replace(new RegExp(STAR, "g"), "[^/]*");

  return new RegExp("^" + s + "$");
}
