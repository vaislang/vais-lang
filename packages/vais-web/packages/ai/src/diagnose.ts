/**
 * Error Auto-Diagnosis utilities for @vaisx/ai.
 *
 * Provides LLM-powered runtime error diagnosis, offline pattern matching,
 * diagnostic prompt construction, and error handler with history management.
 */

import type { AIProvider } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Contextual information about where and how an error occurred.
 */
export interface ErrorContext {
  /** The source code snippet where the error originated. */
  sourceCode?: string;
  /** The full stack trace of the error. */
  stackTrace?: string;
  /** The name of the VaisX component where the error occurred. */
  componentName?: string;
  /** The props passed to the component at the time of the error. */
  props?: Record<string, unknown>;
}

/**
 * The result of an LLM-powered or offline error diagnosis.
 */
export interface DiagnosisResult {
  /** A brief one-line summary of the error. */
  summary: string;
  /** The identified root cause. */
  cause: string;
  /** A human-readable suggestion for fixing the error. */
  suggestion: string;
  /** Optional code fix snippet. */
  fixCode?: string;
  /** Confidence score between 0 and 1. */
  confidence: number;
}

/**
 * A recorded diagnosis entry stored in the error handler history.
 */
export interface DiagnosisEntry {
  /** The original error that was diagnosed. */
  error: Error;
  /** The resulting diagnosis. */
  result: DiagnosisResult;
  /** ISO timestamp of when the diagnosis was performed. */
  timestamp: string;
}

/**
 * An error diagnoser that uses an AIProvider to analyse runtime errors.
 */
export interface ErrorDiagnoser {
  /**
   * Diagnose an error, optionally with surrounding context.
   *
   * @param error   - The error to diagnose.
   * @param context - Optional context about the error location.
   * @returns         A DiagnosisResult describing the error and a fix.
   */
  diagnose(error: Error, context?: ErrorContext): Promise<DiagnosisResult>;
}

/**
 * A global error handler that captures errors, auto-diagnoses them,
 * and maintains a history of past diagnoses.
 */
export interface ErrorHandler {
  /**
   * Capture an error and automatically diagnose it.
   *
   * @param error - The error to capture and diagnose.
   * @returns       The resulting diagnosis.
   */
  handleError(error: Error): Promise<DiagnosisResult>;
  /** Return a copy of the full diagnosis history. */
  getHistory(): DiagnosisEntry[];
  /** Clear all recorded diagnoses from history. */
  clearHistory(): void;
}

// ─── Common VaisX error patterns ──────────────────────────────────────────────

/**
 * A named offline pattern that can match error messages without LLM calls.
 */
interface ErrorPattern {
  /** Machine-readable identifier for this pattern. */
  id: string;
  /** Regex that matches the error message. */
  pattern: RegExp;
  /** Build a DiagnosisResult for a matching error. */
  diagnose(error: Error, context?: ErrorContext): DiagnosisResult;
}

/**
 * Catalogue of common VaisX runtime error patterns.
 * These are matched offline (no LLM call) for fast, reliable diagnosis.
 */
export const CommonErrors = {
  /**
   * Detect "signal() called outside component" type errors.
   */
  signalNotInComponent: {
    id: "signalNotInComponent",
    pattern: /signal\(\s*\)|useSignal|reactive.*outside.*component|not.*component.*context/i,
    diagnose(_error: Error, context?: ErrorContext): DiagnosisResult {
      return {
        summary: "Signal or reactive primitive used outside a component",
        cause:
          "VaisX signals and reactive primitives (signal(), computed(), effect()) must be " +
          "created inside a component function or a custom hook. They cannot be called at " +
          "module scope or inside plain utility functions.",
        suggestion:
          "Move the signal() call inside the component function body, or wrap it in a " +
          "createRoot() / withOwner() scope if you need it outside a component tree.",
        fixCode: context?.componentName
          ? `// Inside ${context.componentName}:\nfunction ${context.componentName}() {\n  const count = signal(0);\n  // ...\n}`
          : `function MyComponent() {\n  const count = signal(0); // moved inside component\n  // ...\n}`,
        confidence: 0.92,
      };
    },
  } satisfies ErrorPattern,

  /**
   * Detect access of undefined / null props.
   */
  undefinedProp: {
    id: "undefinedProp",
    pattern: /cannot\s+read\s+prop(?:ert(?:y|ies))?\s+of\s+(?:undefined|null)|undefined.*prop|prop.*undefined/i,
    diagnose(error: Error, context?: ErrorContext): DiagnosisResult {
      const propMatch = error.message.match(/['"`](\w+)['"`]/);
      const propName = propMatch?.[1] ?? "unknown";
      return {
        summary: `Undefined prop access: "${propName}"`,
        cause:
          `The prop "${propName}" is undefined or null when the component tries to access it. ` +
          "This usually happens when a parent component does not pass the required prop, or " +
          "when the prop value arrives asynchronously and has not yet been initialised.",
        suggestion:
          `Add a default value or guard: \`props.${propName} ?? defaultValue\`. ` +
          "If the prop is required, validate it with PropTypes or TypeScript and ensure the " +
          "parent always provides it.",
        fixCode: context?.sourceCode
          ? `// Guard the prop access:\nconst value = props.${propName} ?? '';`
          : `const value = props.${propName} ?? ''; // provide a sensible default`,
        confidence: 0.88,
      };
    },
  } satisfies ErrorPattern,

  /**
   * Detect missing or unregistered template / component errors.
   */
  missingTemplate: {
    id: "missingTemplate",
    pattern: /template.*not.*found|unknown.*component|component.*not.*registered|missing.*template/i,
    diagnose(_error: Error, context?: ErrorContext): DiagnosisResult {
      return {
        summary: "Component template not found or not registered",
        cause:
          "VaisX cannot find the template or component definition. This occurs when a " +
          "component is used before it is registered, the import path is wrong, or the " +
          "component name is misspelled.",
        suggestion:
          "Verify the import path and component name spelling. Ensure the component is " +
          "registered before it is first rendered. Check that the build output includes the " +
          "component file.",
        fixCode: context?.componentName
          ? `import { ${context.componentName} } from './components/${context.componentName}';\n// Register before use`
          : `import { MyComponent } from './components/MyComponent';\n// Ensure import is correct`,
        confidence: 0.85,
      };
    },
  } satisfies ErrorPattern,

  /**
   * Detect hydration mismatch errors.
   */
  hydrationMismatch: {
    id: "hydrationMismatch",
    pattern: /hydrat(?:ion|e).*mismatch|server.*client.*mismatch|mismatch.*hydrat/i,
    diagnose(_error: Error, _context?: ErrorContext): DiagnosisResult {
      return {
        summary: "Server/client hydration mismatch detected",
        cause:
          "The HTML rendered on the server does not match what the client-side VaisX runtime " +
          "expects. Common causes: date/time values, random numbers, browser-only APIs used " +
          "during SSR, or conditional rendering that differs between environments.",
        suggestion:
          "Wrap browser-only code in onMount() or a typeof window !== 'undefined' guard. " +
          "Avoid Math.random() and Date.now() in render paths without seeding. Use " +
          "suppressHydrationWarning sparingly as a last resort.",
        confidence: 0.9,
      };
    },
  } satisfies ErrorPattern,

  /**
   * Detect infinite update / effect loop errors.
   */
  infiniteLoop: {
    id: "infiniteLoop",
    pattern: /maximum\s+update\s+depth|infinite\s+loop|too\s+many\s+re.?renders|effect.*loop/i,
    diagnose(_error: Error, _context?: ErrorContext): DiagnosisResult {
      return {
        summary: "Infinite update loop detected",
        cause:
          "An effect or computed value is triggering a state update that in turn re-triggers " +
          "the same effect, causing an infinite cycle. This often happens when an effect " +
          "writes to a signal it also reads, or when object/array references are recreated " +
          "on every render.",
        suggestion:
          "Review effect() dependencies. Avoid writing to signals inside computed(). " +
          "Memoize objects and arrays with createMemo() or useMemo() so their references " +
          "remain stable between renders.",
        confidence: 0.87,
      };
    },
  } satisfies ErrorPattern,
} as const;

/** Union of the known CommonErrors pattern ids. */
type CommonErrorId = keyof typeof CommonErrors;

// ─── Offline pattern matching ──────────────────────────────────────────────────

/**
 * Attempt to match an error against the known offline patterns.
 *
 * @param error   - The error to match.
 * @param context - Optional context.
 * @returns         A DiagnosisResult if a pattern matches, otherwise null.
 */
export function matchOfflinePattern(
  error: Error,
  context?: ErrorContext,
): (DiagnosisResult & { patternId: CommonErrorId }) | null {
  const message = `${error.message} ${context?.stackTrace ?? error.stack ?? ""}`;

  for (const [id, entry] of Object.entries(CommonErrors) as Array<[CommonErrorId, ErrorPattern]>) {
    if (entry.pattern.test(message)) {
      return { ...entry.diagnose(error, context), patternId: id };
    }
  }

  return null;
}

// ─── Prompt construction ──────────────────────────────────────────────────────

/**
 * Build the diagnostic prompt that will be sent to the LLM.
 *
 * The prompt includes:
 * - The error message and type
 * - Stack trace (if available)
 * - Relevant source code (if provided)
 * - VaisX-specific component context
 *
 * @param error   - The runtime error to diagnose.
 * @param context - Optional contextual information.
 * @returns         A formatted string prompt ready for the LLM.
 */
export function buildDiagnosticPrompt(error: Error, context?: ErrorContext): string {
  const lines: string[] = [];

  lines.push("You are an expert VaisX framework debugger. Analyse the following runtime error and return a JSON diagnosis.");
  lines.push("");
  lines.push("## Error Information");
  lines.push(`**Type**: ${error.name}`);
  lines.push(`**Message**: ${error.message}`);

  const stack = context?.stackTrace ?? error.stack;
  if (stack) {
    lines.push("");
    lines.push("## Stack Trace");
    lines.push("```");
    lines.push(stack.trim());
    lines.push("```");
  }

  if (context?.sourceCode) {
    lines.push("");
    lines.push("## Relevant Source Code");
    lines.push("```typescript");
    lines.push(context.sourceCode.trim());
    lines.push("```");
  }

  if (context?.componentName) {
    lines.push("");
    lines.push("## VaisX Context");
    lines.push(`**Component**: ${context.componentName}`);
  }

  if (context?.props && Object.keys(context.props).length > 0) {
    lines.push(`**Props**: ${JSON.stringify(context.props, null, 2)}`);
  }

  lines.push("");
  lines.push("## Instructions");
  lines.push(
    "Respond ONLY with a valid JSON object matching this exact schema:\n" +
    "{\n" +
    '  "summary": "one-line summary of the error",\n' +
    '  "cause": "detailed explanation of the root cause",\n' +
    '  "suggestion": "step-by-step fix instructions",\n' +
    '  "fixCode": "optional corrected code snippet (omit key if not applicable)",\n' +
    '  "confidence": 0.0\n' +
    "}\n" +
    "The confidence field must be a number between 0 and 1. Do not include any text outside the JSON object.",
  );

  return lines.join("\n");
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/**
 * Parse the LLM response into a DiagnosisResult.
 *
 * First attempts strict JSON parsing. If that fails, falls back to section-based
 * free-text extraction using heading patterns.
 *
 * @param response - The raw LLM response text.
 * @returns          A DiagnosisResult extracted from the response.
 */
export function parseDiagnosticResponse(response: string): DiagnosisResult {
  const trimmed = response.trim();

  // ── JSON parse attempt ───────────────────────────────────────────────────

  // Strip markdown code fences if present.
  const jsonContent = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Find the first { ... } block in the response.
  const jsonStart = jsonContent.indexOf("{");
  const jsonEnd = jsonContent.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    try {
      const candidate = jsonContent.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(candidate) as Record<string, unknown>;

      const summary = typeof parsed["summary"] === "string" ? parsed["summary"] : "";
      const cause = typeof parsed["cause"] === "string" ? parsed["cause"] : "";
      const suggestion = typeof parsed["suggestion"] === "string" ? parsed["suggestion"] : "";
      const fixCode = typeof parsed["fixCode"] === "string" ? parsed["fixCode"] : undefined;
      const rawConf = parsed["confidence"];
      const confidence =
        typeof rawConf === "number" ? Math.max(0, Math.min(1, rawConf)) : 0.5;

      if (summary || cause || suggestion) {
        return { summary, cause, suggestion, fixCode, confidence };
      }
    } catch {
      // Fall through to text-based parsing.
    }
  }

  // ── Free-text / section-based fallback ───────────────────────────────────

  return parseFreeTextResponse(trimmed);
}

/**
 * Section-based fallback parser for LLM responses that are not valid JSON.
 * Looks for common heading patterns such as "Summary:", "Cause:", etc.
 */
function parseFreeTextResponse(text: string): DiagnosisResult {
  function extractSection(heading: string): string {
    const pattern = new RegExp(
      `(?:^|\\n)(?:#+\\s*)?${heading}:?\\s*([\\s\\S]*?)(?=\\n(?:#+\\s*)?(?:Summary|Cause|Root Cause|Suggestion|Fix Code|Confidence)|$)`,
      "i",
    );
    const match = text.match(pattern);
    return match?.[1]?.trim() ?? "";
  }

  const summary =
    extractSection("Summary") ||
    extractSection("Error Summary") ||
    text.split("\n")[0]?.trim() ||
    "Unknown error";

  const cause =
    extractSection("Cause") ||
    extractSection("Root Cause") ||
    extractSection("Analysis") ||
    "Unable to determine cause from the provided response.";

  const suggestion =
    extractSection("Suggestion") ||
    extractSection("Fix") ||
    extractSection("Resolution") ||
    "Review the error message and stack trace for more details.";

  const fixCode = extractSection("Fix Code") || extractSection("Code Fix") || undefined;

  // Try to find a confidence value in the text.
  const confMatch = text.match(/confidence[:\s]+([0-9]*\.?[0-9]+)/i);
  const confidence = confMatch ? Math.max(0, Math.min(1, parseFloat(confMatch[1]!))) : 0.5;

  return {
    summary,
    cause,
    suggestion,
    fixCode: fixCode || undefined,
    confidence,
  };
}

// ─── Error Diagnoser ──────────────────────────────────────────────────────────

/**
 * Create an error diagnoser backed by an AIProvider.
 *
 * The diagnoser first attempts offline pattern matching. If no pattern matches,
 * it builds a diagnostic prompt and calls the AI provider.
 *
 * @param provider - The AI provider to use for LLM-based diagnosis.
 * @returns          An ErrorDiagnoser instance.
 *
 * @example
 * ```ts
 * const provider = createOpenAIProvider({ apiKey: 'sk-...' });
 * const diagnoser = createErrorDiagnoser(provider);
 * const result = await diagnoser.diagnose(error, { componentName: 'MyButton' });
 * ```
 */
export function createErrorDiagnoser(provider: AIProvider): ErrorDiagnoser {
  return {
    async diagnose(error: Error, context?: ErrorContext): Promise<DiagnosisResult> {
      // 1. Try offline pattern matching first (fast path).
      const offline = matchOfflinePattern(error, context);
      if (offline) {
        const { patternId: _patternId, ...result } = offline;
        return result;
      }

      // 2. Fall back to LLM-based diagnosis.
      const prompt = buildDiagnosticPrompt(error, context);
      const rawResponse = await provider.complete(prompt, {});
      return parseDiagnosticResponse(rawResponse);
    },
  };
}

// ─── Error Handler ────────────────────────────────────────────────────────────

/**
 * Create a global error handler that wraps a diagnoser and maintains history.
 *
 * @param diagnoser - The ErrorDiagnoser to use for each error.
 * @returns           An ErrorHandler instance.
 *
 * @example
 * ```ts
 * const handler = createErrorHandler(diagnoser);
 * try { ... } catch (err) {
 *   const diagnosis = await handler.handleError(err as Error);
 *   console.log(diagnosis.suggestion);
 * }
 * ```
 */
export function createErrorHandler(diagnoser: ErrorDiagnoser): ErrorHandler {
  const history: DiagnosisEntry[] = [];

  return {
    async handleError(error: Error): Promise<DiagnosisResult> {
      const result = await diagnoser.diagnose(error);
      history.push({
        error,
        result,
        timestamp: new Date().toISOString(),
      });
      return result;
    },

    getHistory(): DiagnosisEntry[] {
      return [...history];
    },

    clearHistory(): void {
      history.length = 0;
    },
  };
}
