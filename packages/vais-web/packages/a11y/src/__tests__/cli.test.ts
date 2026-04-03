/**
 * Tests for A11yAuditor — accessibility audit CLI logic.
 *
 * File-system access is provided via injectable FsAdapter / PathAdapter so
 * tests run without touching the real file system.
 *
 * Coverage: single-file audit, directory audit, report formatting (text/json/table),
 * exit-code determination, include/exclude config.  (≥ 20 tests)
 */

import { describe, it, expect } from "vitest";
import { A11yAuditor } from "../cli.js";
import type { AuditReport, FileResult, FsAdapter, PathAdapter, DirEntry } from "../cli.js";
import * as nodePath from "node:path";

// ─── Source fixtures ──────────────────────────────────────────────────────────

const CLEAN_HTML = `
<h1>Title</h1>
<img src="pic.jpg" alt="A picture">
<button type="button">Click</button>
<label for="name">Name</label>
<input id="name" type="text">
`;

const VIOLATION_HTML = `
<img src="photo.jpg">
<button>Submit</button>
<input type="text">
`;

// ─── FsAdapter / PathAdapter factories ───────────────────────────────────────

/**
 * Build a FsAdapter backed by a simple in-memory file map and a directory
 * structure map.
 *
 * `files`: filePath → content
 * `dirs`:  dirPath  → array of DirEntry
 */
function makeFs(
  files: Record<string, string>,
  dirs: Record<string, DirEntry[]>
): FsAdapter {
  return {
    async readFile(path: string): Promise<string> {
      if (path in files) return files[path];
      throw new Error(`ENOENT: ${path}`);
    },
    async readdir(path: string): Promise<DirEntry[]> {
      return dirs[path] ?? [];
    },
  };
}

/** Use the real node:path for path operations. */
const realPath: PathAdapter = {
  join: nodePath.join,
  relative: nodePath.relative,
};

/** Convenience: build an A11yAuditor with mock fs/path. */
function makeAuditor(
  files: Record<string, string>,
  dirs: Record<string, DirEntry[]> = {},
  config: ConstructorParameters<typeof A11yAuditor>[0] = {}
): A11yAuditor {
  return new A11yAuditor(config, makeFs(files, dirs), realPath);
}

// ─── auditFile ────────────────────────────────────────────────────────────────

describe("auditFile", () => {
  it("returns zero violations for clean HTML", async () => {
    const auditor = makeAuditor({ "src/App.html": CLEAN_HTML });
    const result = await auditor.auditFile("src/App.html");

    expect(result.violations).toBe(0);
    expect(result.filePath).toBe("src/App.html");
  });

  it("returns diagnostics for a file with violations", async () => {
    const auditor = makeAuditor({ "src/Bad.html": VIOLATION_HTML });
    const result = await auditor.auditFile("src/Bad.html");

    expect(result.violations).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("filePath in FileResult matches the argument passed", async () => {
    const auditor = makeAuditor({ "/absolute/path/Component.vaisx": CLEAN_HTML });
    const result = await auditor.auditFile("/absolute/path/Component.vaisx");

    expect(result.filePath).toBe("/absolute/path/Component.vaisx");
  });

  it("diagnostics contain the correct file field", async () => {
    const auditor = makeAuditor({ "views/Page.html": VIOLATION_HTML });
    const result = await auditor.auditFile("views/Page.html");

    expect(result.diagnostics.every((d) => d.file === "views/Page.html")).toBe(true);
  });

  it("reports img-alt violation when alt is missing", async () => {
    const auditor = makeAuditor({ "test.html": '<img src="x.jpg">' });
    const result = await auditor.auditFile("test.html");

    expect(result.diagnostics.some((d) => d.ruleId === "img-alt")).toBe(true);
  });

  it("violation count equals number of error/warning diagnostics", async () => {
    const auditor = makeAuditor({ "test.html": VIOLATION_HTML });
    const result = await auditor.auditFile("test.html");

    const expected = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "warning"
    ).length;
    expect(result.violations).toBe(expected);
  });

  it("passes property equals count of non-violation diagnostics", async () => {
    const auditor = makeAuditor({ "test.html": VIOLATION_HTML });
    const result = await auditor.auditFile("test.html");

    const expectedPasses = result.diagnostics.filter(
      (d) => d.severity !== "error" && d.severity !== "warning"
    ).length;
    expect(result.passes).toBe(expectedPasses);
  });
});

// ─── auditDirectory ───────────────────────────────────────────────────────────

describe("auditDirectory", () => {
  it("returns AuditReport with required fields", async () => {
    const dirs = {
      "/project/src": [{ name: "App.html", isDirectory: () => false }],
    };
    const auditor = makeAuditor({ "/project/src/App.html": CLEAN_HTML }, dirs);
    const report = await auditor.auditDirectory("/project/src");

    expect(report).toHaveProperty("files");
    expect(report).toHaveProperty("totalViolations");
    expect(report).toHaveProperty("totalPasses");
    expect(report).toHaveProperty("summary");
  });

  it("aggregates violations from multiple files", async () => {
    const dirs = {
      "/src": [
        { name: "clean.html", isDirectory: () => false },
        { name: "bad.html", isDirectory: () => false },
      ],
    };
    const files = {
      "/src/clean.html": CLEAN_HTML,
      "/src/bad.html": VIOLATION_HTML,
    };
    const auditor = makeAuditor(files, dirs);
    const report = await auditor.auditDirectory("/src");

    expect(report.files).toHaveLength(2);
    expect(report.totalViolations).toBeGreaterThan(0);
  });

  it("totalViolations is sum of per-file violations", async () => {
    const dirs = {
      "/src": [
        { name: "a.html", isDirectory: () => false },
        { name: "b.html", isDirectory: () => false },
      ],
    };
    const files = { "/src/a.html": VIOLATION_HTML, "/src/b.html": VIOLATION_HTML };
    const auditor = makeAuditor(files, dirs);
    const report = await auditor.auditDirectory("/src");

    const sum = report.files.reduce((n, f) => n + f.violations, 0);
    expect(report.totalViolations).toBe(sum);
  });

  it("summary mentions 'passed' when no violations", async () => {
    const dirs = { "/src": [{ name: "clean.html", isDirectory: () => false }] };
    const auditor = makeAuditor({ "/src/clean.html": CLEAN_HTML }, dirs);
    const report = await auditor.auditDirectory("/src");

    expect(report.summary).toMatch(/pass/i);
  });

  it("summary mentions violation count when violations exist", async () => {
    const dirs = { "/src": [{ name: "bad.html", isDirectory: () => false }] };
    const auditor = makeAuditor({ "/src/bad.html": VIOLATION_HTML }, dirs);
    const report = await auditor.auditDirectory("/src");

    expect(report.summary).toMatch(/violation/i);
  });

  it("recursively walks sub-directories", async () => {
    const dirs = {
      "/root": [{ name: "sub", isDirectory: () => true }],
      "/root/sub": [{ name: "nested.html", isDirectory: () => false }],
    };
    const auditor = makeAuditor({ "/root/sub/nested.html": CLEAN_HTML }, dirs);
    const report = await auditor.auditDirectory("/root");

    expect(report.files).toHaveLength(1);
    expect(report.files[0].filePath).toMatch(/nested\.html/);
  });

  it("excludes node_modules by default", async () => {
    const dirs = {
      "/root": [
        { name: "node_modules", isDirectory: () => true },
        { name: "index.html", isDirectory: () => false },
      ],
      "/root/node_modules": [{ name: "lib.html", isDirectory: () => false }],
    };
    const files = {
      "/root/index.html": CLEAN_HTML,
      "/root/node_modules/lib.html": CLEAN_HTML,
    };
    const auditor = makeAuditor(files, dirs);
    const report = await auditor.auditDirectory("/root");

    expect(report.files.every((f) => !f.filePath.includes("node_modules"))).toBe(true);
    expect(report.files).toHaveLength(1);
  });

  it("respects custom include option", async () => {
    const dirs = {
      "/src": [
        { name: "page.html", isDirectory: () => false },
        { name: "component.vaisx", isDirectory: () => false },
        { name: "script.js", isDirectory: () => false },
      ],
    };
    const files = {
      "/src/page.html": CLEAN_HTML,
      "/src/component.vaisx": CLEAN_HTML,
    };
    const auditor = makeAuditor(files, dirs, { include: ["**/*.vaisx"] });
    const report = await auditor.auditDirectory("/src");

    expect(report.files).toHaveLength(1);
    expect(report.files[0].filePath).toMatch(/\.vaisx$/);
  });

  it("respects custom exclude option passed as options argument", async () => {
    const dirs = {
      "/src": [
        { name: "skip.html", isDirectory: () => false },
        { name: "keep.html", isDirectory: () => false },
      ],
    };
    const files = { "/src/skip.html": CLEAN_HTML, "/src/keep.html": CLEAN_HTML };
    const auditor = makeAuditor(files, dirs);
    const report = await auditor.auditDirectory("/src", { exclude: ["**/skip.html"] });

    expect(report.files.every((f) => !f.filePath.includes("skip.html"))).toBe(true);
    expect(report.files).toHaveLength(1);
  });

  it("returns empty files array for empty directory", async () => {
    const dirs = { "/empty": [] };
    const auditor = makeAuditor({}, dirs);
    const report = await auditor.auditDirectory("/empty");

    expect(report.files).toHaveLength(0);
    expect(report.totalViolations).toBe(0);
  });
});

// ─── formatReport — text ──────────────────────────────────────────────────────

describe("formatReport — text", () => {
  function makeReport(violations: number): AuditReport {
    const diagnostics =
      violations > 0
        ? [
            {
              file: "test.html",
              line: 2,
              column: 1,
              ruleId: "img-alt",
              message: "img element is missing an alt attribute.",
              severity: "error" as const,
            },
          ]
        : [];

    const file: FileResult = {
      filePath: "test.html",
      diagnostics,
      violations,
      passes: violations === 0 ? 1 : 0,
    };

    return {
      files: [file],
      totalViolations: violations,
      totalPasses: violations === 0 ? 1 : 0,
      summary:
        violations === 0
          ? "All 1 file(s) passed accessibility checks."
          : `Found ${violations} violation(s) in 1 of 1 file(s).`,
    };
  }

  it("text output contains the file path", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(1), "text");
    expect(output).toContain("test.html");
  });

  it("text output contains rule ID for violation", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(1), "text");
    expect(output).toContain("img-alt");
  });

  it("text output contains fix guidance", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(1), "text");
    expect(output.toLowerCase()).toContain("fix");
  });

  it("text output contains summary line", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(0), "text");
    expect(output.toLowerCase()).toContain("summary");
  });

  it("text output shows total violations count", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(1), "text");
    expect(output).toContain("1");
  });

  it("text output severity is uppercase", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(1), "text");
    expect(output).toContain("[ERROR]");
  });
});

// ─── formatReport — json ──────────────────────────────────────────────────────

describe("formatReport — json", () => {
  function makeReport(): AuditReport {
    return {
      files: [
        {
          filePath: "src/page.html",
          diagnostics: [
            {
              file: "src/page.html",
              line: 5,
              column: 3,
              ruleId: "button-type",
              message: "<button> element is missing a type attribute.",
              severity: "warning",
            },
          ],
          violations: 1,
          passes: 0,
        },
      ],
      totalViolations: 1,
      totalPasses: 0,
      summary: "Found 1 violation(s) in 1 of 1 file(s).",
    };
  }

  it("json output is valid JSON", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(makeReport(), "json");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("json output contains totalViolations field", () => {
    const auditor = new A11yAuditor();
    const parsed = JSON.parse(auditor.formatReport(makeReport(), "json"));
    expect(parsed).toHaveProperty("totalViolations", 1);
  });

  it("json output contains files array", () => {
    const auditor = new A11yAuditor();
    const parsed = JSON.parse(auditor.formatReport(makeReport(), "json"));
    expect(Array.isArray(parsed.files)).toBe(true);
  });

  it("json diagnostics include fix guidance", () => {
    const auditor = new A11yAuditor();
    const parsed = JSON.parse(auditor.formatReport(makeReport(), "json"));
    const diag = parsed.files[0].diagnostics[0];
    expect(diag).toHaveProperty("fix");
    expect(typeof diag.fix).toBe("string");
    expect(diag.fix.length).toBeGreaterThan(0);
  });

  it("json output contains summary field", () => {
    const auditor = new A11yAuditor();
    const parsed = JSON.parse(auditor.formatReport(makeReport(), "json"));
    expect(parsed).toHaveProperty("summary");
    expect(typeof parsed.summary).toBe("string");
  });
});

// ─── formatReport — table ─────────────────────────────────────────────────────

describe("formatReport — table", () => {
  function makeReport(files: Array<{ filePath: string; violations: number }>): AuditReport {
    const fileResults: FileResult[] = files.map((f) => ({
      filePath: f.filePath,
      diagnostics:
        f.violations > 0
          ? [
              {
                file: f.filePath,
                line: 1,
                column: 1,
                ruleId: "img-alt",
                message: "img element is missing an alt attribute.",
                severity: "error" as const,
              },
            ]
          : [],
      violations: f.violations,
      passes: 0,
    }));

    const total = files.reduce((n, f) => n + f.violations, 0);
    return {
      files: fileResults,
      totalViolations: total,
      totalPasses: 0,
      summary:
        total === 0
          ? `All ${files.length} file(s) passed accessibility checks.`
          : `Found ${total} violation(s).`,
    };
  }

  it("table output contains TOTAL row", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(
      makeReport([{ filePath: "a.html", violations: 2 }]),
      "table"
    );
    expect(output.toUpperCase()).toContain("TOTAL");
  });

  it("table output contains file paths", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(
      makeReport([{ filePath: "src/page.html", violations: 0 }]),
      "table"
    );
    expect(output).toContain("src/page.html");
  });

  it("table output contains violation details for violating files", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(
      makeReport([{ filePath: "bad.html", violations: 1 }]),
      "table"
    );
    expect(output).toContain("img-alt");
  });

  it("table output contains summary", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(
      makeReport([{ filePath: "ok.html", violations: 0 }]),
      "table"
    );
    expect(output.toLowerCase()).toContain("pass");
  });

  it("table output includes fix guidance for violations", () => {
    const auditor = new A11yAuditor();
    const output = auditor.formatReport(
      makeReport([{ filePath: "bad.html", violations: 1 }]),
      "table"
    );
    expect(output.toLowerCase()).toContain("fix");
  });
});

// ─── getExitCode ──────────────────────────────────────────────────────────────

describe("getExitCode", () => {
  function report(violations: number): AuditReport {
    return {
      files: [],
      totalViolations: violations,
      totalPasses: 0,
      summary: "",
    };
  }

  it("returns 0 when there are no violations", () => {
    const auditor = new A11yAuditor();
    expect(auditor.getExitCode(report(0))).toBe(0);
  });

  it("returns 1 when there is one violation", () => {
    const auditor = new A11yAuditor();
    expect(auditor.getExitCode(report(1))).toBe(1);
  });

  it("returns 1 when there are multiple violations", () => {
    const auditor = new A11yAuditor();
    expect(auditor.getExitCode(report(10))).toBe(1);
  });
});
