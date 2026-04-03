/**
 * typecheck.ts
 *
 * tsc --noEmit integration for type-checking .vaisx files.
 *
 * Because tsc does not natively understand .vaisx files we:
 *  1. Extract the TypeScript source from `<script lang="ts">` blocks.
 *  2. Write it to a temporary .ts file.
 *  3. Run `tsc --noEmit` via child_process.
 *  4. Parse and return the diagnostics.
 *  5. Clean up the temporary file.
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { promisify } from "util";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { parseScriptBlocks } from "./parser.js";

const execFileAsync = promisify(execFile);

// ─── Public types ────────────────────────────────────────────────────────────

export interface TypeCheckDiagnostic {
  /** Absolute path to the source file that triggered the diagnostic. */
  file: string;
  /** 1-based line number, or undefined when the error is file-level. */
  line?: number;
  /** 1-based column number. */
  column?: number;
  /** TypeScript diagnostic code (e.g. 2322). */
  code: number;
  /** Human-readable message. */
  message: string;
  /** Severity level. */
  severity: "error" | "warning";
}

export interface TypeCheckResult {
  /** Whether all checks passed with no errors. */
  ok: boolean;
  /** All diagnostics emitted by tsc. */
  diagnostics: TypeCheckDiagnostic[];
  /** Raw stdout/stderr from tsc for debugging. */
  raw: string;
}

export interface TypeCheckOptions {
  /** Absolute path to the .vaisx (or .ts) file being checked. */
  filename: string;
  /** Raw source of the file. */
  source: string;
  /**
   * Path to tsconfig.json to use.  When omitted tsc's default resolution
   * is used (walks up from the temp directory).
   */
  tsconfigPath?: string;
  /**
   * When `true` the `source` is treated as raw TypeScript rather than a
   * full .vaisx file.  Defaults to `false`.
   */
  rawTs?: boolean;
}

// ─── Diagnostic parser ───────────────────────────────────────────────────────

/**
 * Parse a line of tsc output in the canonical format:
 *   path/to/file.ts(line,col): error TS2322: message
 */
const DIAGNOSTIC_RE =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/;

function parseDiagnosticLine(line: string): TypeCheckDiagnostic | null {
  const m = DIAGNOSTIC_RE.exec(line.trim());
  if (!m) return null;
  return {
    file: m[1],
    line: parseInt(m[2], 10),
    column: parseInt(m[3], 10),
    severity: m[4] as "error" | "warning",
    code: parseInt(m[5], 10),
    message: m[6],
  };
}

function parseTscOutput(
  raw: string,
  originalFile: string
): TypeCheckDiagnostic[] {
  return raw
    .split("\n")
    .map((l) => parseDiagnosticLine(l))
    .filter((d): d is TypeCheckDiagnostic => d !== null)
    .map((d) => ({ ...d, file: originalFile }));
}

// ─── tsc binary resolution ───────────────────────────────────────────────────

/**
 * Attempt to locate the `tsc` binary shipped with the `typescript` package
 * that is reachable from this package's location.
 */
function resolveTsc(): string {
  try {
    const require = createRequire(import.meta.url);
    const tsEntry = require.resolve("typescript");
    // typescript/lib/typescript.js → typescript/bin/tsc
    const binPath = join(dirname(tsEntry), "..", "bin", "tsc");
    return binPath;
  } catch {
    return "tsc"; // fall back to PATH
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Type-check a .vaisx file (or a raw TypeScript source string) by delegating
 * to the TypeScript compiler (`tsc --noEmit`).
 */
export async function typeCheck(
  options: TypeCheckOptions
): Promise<TypeCheckResult> {
  const { filename, source, rawTs = false } = options;

  // Extract TS source.
  let tsSource: string;
  if (rawTs) {
    tsSource = source;
  } else {
    const { scriptBlocks, hasTypeScript } = parseScriptBlocks(source);
    if (!hasTypeScript) {
      return {
        ok: true,
        diagnostics: [],
        raw: 'No <script lang="ts"> block found — skipping type check.',
      };
    }
    tsSource = scriptBlocks.map((b) => b.source).join("\n");
  }

  // Write to a temp file.
  const tmpFile = join(
    tmpdir(),
    `vaisx-typecheck-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
  );

  try {
    await fs.writeFile(tmpFile, tsSource, "utf8");

    const tscBin = resolveTsc();

    let raw = "";
    let execOk = true;

    try {
      const { stdout, stderr } = await execFileAsync(tscBin, [
        "--noEmit",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "bundler",
        "--skipLibCheck",
        tmpFile,
      ]);
      raw = stdout + stderr;
    } catch (err: unknown) {
      execOk = false;
      const execErr = err as { stdout?: string; stderr?: string };
      raw = (execErr.stdout ?? "") + (execErr.stderr ?? "");
    }

    const diagnostics = parseTscOutput(raw, filename);
    const hasErrors = diagnostics.some((d) => d.severity === "error");

    return { ok: execOk && !hasErrors, diagnostics, raw };
  } finally {
    await fs.unlink(tmpFile).catch(() => {
      // Ignore cleanup failures.
    });
  }
}

// Expose the module's file URL for use in tests / callers.
export const moduleUrl: string = import.meta.url;
export const moduleDir: string = dirname(fileURLToPath(import.meta.url));
