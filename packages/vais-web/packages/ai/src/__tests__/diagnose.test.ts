/**
 * @vaisx/ai — Error diagnosis tests
 *
 * Covers: buildDiagnosticPrompt, parseDiagnosticResponse, matchOfflinePattern,
 *         createErrorDiagnoser, createErrorHandler, and CommonErrors patterns.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  matchOfflinePattern,
  createErrorDiagnoser,
  createErrorHandler,
  CommonErrors,
} from "../diagnose.js";
import type { ErrorContext, DiagnosisResult } from "../diagnose.js";
import type { AIProvider } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeError(message: string, name = "Error"): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function makeMockProvider(response: string): AIProvider {
  return {
    id: "mock",
    name: "Mock Provider",
    async chat(_messages, _options) {
      return response;
    },
    async complete(_prompt, _options) {
      return response;
    },
  };
}

// ─── buildDiagnosticPrompt ────────────────────────────────────────────────────

describe("buildDiagnosticPrompt", () => {
  it("includes the error type and message", () => {
    const error = makeError("Something went wrong", "TypeError");
    const prompt = buildDiagnosticPrompt(error);
    expect(prompt).toContain("TypeError");
    expect(prompt).toContain("Something went wrong");
  });

  it("includes the stack trace when available via context", () => {
    const error = makeError("boom");
    const context: ErrorContext = { stackTrace: "at MyComponent (app.js:10:5)" };
    const prompt = buildDiagnosticPrompt(error, context);
    expect(prompt).toContain("at MyComponent (app.js:10:5)");
  });

  it("includes source code when provided", () => {
    const error = makeError("boom");
    const context: ErrorContext = { sourceCode: "const x = signal();" };
    const prompt = buildDiagnosticPrompt(error, context);
    expect(prompt).toContain("const x = signal();");
  });

  it("includes component name when provided", () => {
    const error = makeError("boom");
    const context: ErrorContext = { componentName: "UserProfile" };
    const prompt = buildDiagnosticPrompt(error, context);
    expect(prompt).toContain("UserProfile");
  });

  it("includes props when provided", () => {
    const error = makeError("boom");
    const context: ErrorContext = { props: { userId: 42 } };
    const prompt = buildDiagnosticPrompt(error, context);
    expect(prompt).toContain("userId");
    expect(prompt).toContain("42");
  });

  it("requests a JSON response format", () => {
    const prompt = buildDiagnosticPrompt(makeError("err"));
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("confidence");
  });

  it("works without any context argument", () => {
    const prompt = buildDiagnosticPrompt(makeError("standalone error"));
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ─── parseDiagnosticResponse ──────────────────────────────────────────────────

describe("parseDiagnosticResponse — JSON path", () => {
  it("parses a valid JSON response", () => {
    const json = JSON.stringify({
      summary: "Test error",
      cause: "A test cause",
      suggestion: "A test suggestion",
      confidence: 0.9,
    });
    const result = parseDiagnosticResponse(json);
    expect(result.summary).toBe("Test error");
    expect(result.cause).toBe("A test cause");
    expect(result.suggestion).toBe("A test suggestion");
    expect(result.confidence).toBeCloseTo(0.9);
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const response =
      "```json\n" +
      JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 0.8 }) +
      "\n```";
    const result = parseDiagnosticResponse(response);
    expect(result.summary).toBe("s");
  });

  it("extracts fixCode when present", () => {
    const json = JSON.stringify({
      summary: "s",
      cause: "c",
      suggestion: "sg",
      fixCode: "const x = 1;",
      confidence: 0.75,
    });
    const result = parseDiagnosticResponse(json);
    expect(result.fixCode).toBe("const x = 1;");
  });

  it("omits fixCode when absent in JSON", () => {
    const json = JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 0.5 });
    const result = parseDiagnosticResponse(json);
    expect(result.fixCode).toBeUndefined();
  });

  it("clamps confidence to [0, 1] range", () => {
    const json = JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 2.5 });
    const result = parseDiagnosticResponse(json);
    expect(result.confidence).toBe(1);
  });
});

describe("parseDiagnosticResponse — free-text fallback", () => {
  it("extracts sections from free-text response", () => {
    const text =
      "Summary: The signal was called outside a component\n" +
      "Cause: Signals must be inside component scope\n" +
      "Suggestion: Move signal() inside the component function";
    const result = parseDiagnosticResponse(text);
    expect(result.summary).toContain("signal");
    expect(result.cause).toContain("component scope");
    expect(result.suggestion).toContain("Move signal");
  });

  it("falls back gracefully for completely unstructured text", () => {
    const result = parseDiagnosticResponse("Something broke badly.");
    expect(typeof result.summary).toBe("string");
    expect(typeof result.cause).toBe("string");
    expect(typeof result.suggestion).toBe("string");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("extracts confidence value from free text", () => {
    const text = "Summary: err\nCause: c\nSuggestion: s\nConfidence: 0.72";
    const result = parseDiagnosticResponse(text);
    expect(result.confidence).toBeCloseTo(0.72);
  });
});

// ─── matchOfflinePattern ──────────────────────────────────────────────────────

describe("matchOfflinePattern", () => {
  it("returns null when no pattern matches", () => {
    const error = makeError("Something entirely unrelated to VaisX");
    expect(matchOfflinePattern(error)).toBeNull();
  });

  it("matches signalNotInComponent pattern", () => {
    const error = makeError("signal() called outside component context");
    const result = matchOfflinePattern(error);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("signalNotInComponent");
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it("matches undefinedProp pattern", () => {
    const error = makeError("Cannot read properties of undefined (reading 'title')");
    const result = matchOfflinePattern(error);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("undefinedProp");
  });

  it("matches missingTemplate pattern", () => {
    const error = makeError("Template not found: ButtonPrimary");
    const result = matchOfflinePattern(error);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("missingTemplate");
  });

  it("matches hydrationMismatch pattern", () => {
    const error = makeError("Hydration mismatch: server and client content differ");
    const result = matchOfflinePattern(error);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("hydrationMismatch");
  });

  it("matches infiniteLoop pattern", () => {
    const error = makeError("Maximum update depth exceeded");
    const result = matchOfflinePattern(error);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("infiniteLoop");
  });

  it("includes a fixCode for signalNotInComponent when componentName is provided", () => {
    const error = makeError("signal() outside component");
    const ctx: ErrorContext = { componentName: "Counter" };
    const result = matchOfflinePattern(error, ctx);
    expect(result?.fixCode).toContain("Counter");
  });
});

// ─── CommonErrors patterns ────────────────────────────────────────────────────

describe("CommonErrors", () => {
  it("signalNotInComponent has a valid pattern and diagnoser", () => {
    const entry = CommonErrors.signalNotInComponent;
    expect(entry.pattern).toBeInstanceOf(RegExp);
    const result = entry.diagnose(makeError("signal()"));
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("cause");
    expect(result).toHaveProperty("suggestion");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("undefinedProp extracts the prop name from the error message", () => {
    const error = makeError("Cannot read property 'email' of undefined");
    const result = CommonErrors.undefinedProp.diagnose(error);
    expect(result.summary).toContain("email");
  });

  it("missingTemplate has a confidence above 0.8", () => {
    const result = CommonErrors.missingTemplate.diagnose(makeError("Template not found"));
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

// ─── createErrorDiagnoser ────────────────────────────────────────────────────

describe("createErrorDiagnoser", () => {
  it("returns a DiagnosisResult for a known offline pattern without calling the provider", async () => {
    const provider = makeMockProvider("should not be called");
    const completeSpy = vi.spyOn(provider, "complete");

    const diagnoser = createErrorDiagnoser(provider);
    const error = makeError("signal() called outside component");
    const result = await diagnoser.diagnose(error);

    expect(completeSpy).not.toHaveBeenCalled();
    expect(result.summary).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("calls the provider for unrecognised errors", async () => {
    const llmResponse = JSON.stringify({
      summary: "LLM summary",
      cause: "LLM cause",
      suggestion: "LLM suggestion",
      confidence: 0.7,
    });
    const provider = makeMockProvider(llmResponse);
    const completeSpy = vi.spyOn(provider, "complete");

    const diagnoser = createErrorDiagnoser(provider);
    const result = await diagnoser.diagnose(makeError("Some completely unknown error XYZ123"));

    expect(completeSpy).toHaveBeenCalledOnce();
    expect(result.summary).toBe("LLM summary");
  });

  it("passes context to the LLM prompt when provided", async () => {
    const provider = makeMockProvider(
      JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 0.6 }),
    );
    const completeSpy = vi.spyOn(provider, "complete");

    const diagnoser = createErrorDiagnoser(provider);
    const ctx: ErrorContext = { componentName: "TestWidget", sourceCode: "let x = 1;" };
    await diagnoser.diagnose(makeError("Unknown error ZZZ"), ctx);

    const prompt = completeSpy.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("TestWidget");
    expect(prompt).toContain("let x = 1;");
  });

  it("returns a DiagnosisResult with all required fields", async () => {
    const provider = makeMockProvider(
      JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 0.55 }),
    );
    const diagnoser = createErrorDiagnoser(provider);
    const result = await diagnoser.diagnose(makeError("Totally unknown ZZZ error"));

    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("cause");
    expect(result).toHaveProperty("suggestion");
    expect(result).toHaveProperty("confidence");
  });
});

// ─── createErrorHandler ───────────────────────────────────────────────────────

describe("createErrorHandler", () => {
  let provider: AIProvider;

  beforeEach(() => {
    provider = makeMockProvider(
      JSON.stringify({ summary: "s", cause: "c", suggestion: "sg", confidence: 0.6 }),
    );
  });

  it("handleError returns a DiagnosisResult", async () => {
    const diagnoser = createErrorDiagnoser(provider);
    const handler = createErrorHandler(diagnoser);
    const result = await handler.handleError(makeError("signal() outside component"));
    expect(result).toHaveProperty("summary");
  });

  it("getHistory starts empty", () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    expect(handler.getHistory()).toHaveLength(0);
  });

  it("getHistory grows after each handleError call", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    await handler.handleError(makeError("signal() outside component"));
    await handler.handleError(makeError("signal() outside component"));
    expect(handler.getHistory()).toHaveLength(2);
  });

  it("each history entry has error, result, and timestamp", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    await handler.handleError(makeError("signal() outside component"));
    const [entry] = handler.getHistory();
    expect(entry).toHaveProperty("error");
    expect(entry).toHaveProperty("result");
    expect(entry).toHaveProperty("timestamp");
    expect(typeof entry!.timestamp).toBe("string");
  });

  it("clearHistory empties the history", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    await handler.handleError(makeError("signal() outside component"));
    handler.clearHistory();
    expect(handler.getHistory()).toHaveLength(0);
  });

  it("getHistory returns a copy — mutations do not affect internal state", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    await handler.handleError(makeError("signal() outside component"));
    const copy = handler.getHistory();
    copy.pop();
    expect(handler.getHistory()).toHaveLength(1);
  });

  it("records the original error object in history", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    const error = makeError("signal() outside component");
    await handler.handleError(error);
    const [entry] = handler.getHistory();
    expect(entry!.error).toBe(error);
  });

  it("timestamp is a valid ISO string", async () => {
    const handler = createErrorHandler(createErrorDiagnoser(provider));
    await handler.handleError(makeError("signal() outside component"));
    const [entry] = handler.getHistory();
    expect(() => new Date(entry!.timestamp)).not.toThrow();
    expect(new Date(entry!.timestamp).getTime()).not.toBeNaN();
  });
});
