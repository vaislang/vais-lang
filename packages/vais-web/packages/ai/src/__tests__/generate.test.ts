/**
 * @vaisx/ai — Component generator tests
 *
 * Covers:
 *  - buildPrompt
 *  - parseGeneratedCode
 *  - validateGeneratedCode
 *  - createComponentGenerator (integration with a mock AIProvider)
 *  - COMPONENT_TEMPLATES preset
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildPrompt,
  parseGeneratedCode,
  validateGeneratedCode,
  createComponentGenerator,
  COMPONENT_TEMPLATES,
} from "../generate.js";
import type {
  GenerateOptions,
  ParsedCodeBlock,
  ValidationResult,
  ComponentGenerator,
} from "../generate.js";
import type { AIProvider, ChatMessage, StreamOptions } from "../types.js";

// ─── Mock AI provider ─────────────────────────────────────────────────────────

function makeProvider(responseText: string): AIProvider {
  return {
    id: "mock",
    name: "Mock Provider",
    chat(_messages: ChatMessage[], _options: StreamOptions): Promise<string> {
      return Promise.resolve(responseText);
    },
    complete(_prompt: string, _options: StreamOptions): Promise<string> {
      return Promise.resolve(responseText);
    },
  };
}

// A valid minimal VaisX component response
const VALID_VAISX_RESPONSE = `Here is your component:

\`\`\`vaisx
// filename: PrimaryButton.vaisx
<template>
  <button class="btn" @click="$emit('click', $event)">
    <slot>{{ label }}</slot>
  </button>
</template>

<script>
export default {
  name: "PrimaryButton",
  props: {
    label: { type: String, default: "Click" },
  },
  emits: ["click"],
};
</script>
\`\`\``;

// A valid TypeScript component response
const VALID_TS_RESPONSE = `\`\`\`typescript
// filename: MyCard.ts
<template>
  <div class="card">
    <slot />
  </div>
</template>

<script>
export default { name: "MyCard" };
</script>
\`\`\``;

// Response that includes tests
const RESPONSE_WITH_TESTS = `\`\`\`vaisx
// filename: Counter.vaisx
<template>
  <div><button @click="count++">+</button><span>{{ count }}</span></div>
</template>

<script>
export default { name: "Counter", data() { return { count: 0 }; } };
</script>
\`\`\`

\`\`\`typescript
// filename: Counter.test.ts
import { describe, it, expect } from "vitest";
describe("Counter", () => {
  it("starts at 0", () => { expect(0).toBe(0); });
});
\`\`\``;

// ─── buildPrompt ──────────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildPrompt("A button component");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the user prompt verbatim", () => {
    const userPrompt = "A unique modal with slide animation";
    const result = buildPrompt(userPrompt);
    expect(result).toContain(userPrompt);
  });

  it("mentions vaisx language by default", () => {
    const result = buildPrompt("button");
    expect(result.toLowerCase()).toContain("vaisx");
  });

  it("mentions typescript when language is ts", () => {
    const result = buildPrompt("button", { language: "ts" });
    expect(result.toLowerCase()).toContain("typescript");
  });

  it("includes minimal style guide when style is minimal", () => {
    const result = buildPrompt("button", { style: "minimal" });
    expect(result).toContain("minimal");
  });

  it("includes full style guide when style is full", () => {
    const result = buildPrompt("button", { style: "full" });
    expect(result).toContain("full");
  });

  it("mentions tests when includeTests is true", () => {
    const result = buildPrompt("button", { includeTests: true });
    expect(result.toLowerCase()).toContain("test");
  });

  it("does NOT mention test file when includeTests is false", () => {
    const result = buildPrompt("button", { includeTests: false });
    // Should not contain "test file" instruction
    expect(result).not.toContain("provide a test file");
  });

  it("includes a few-shot example", () => {
    const result = buildPrompt("card");
    // Few-shot section is present
    expect(result).toContain("## Example");
  });

  it("includes the vaisx structure description", () => {
    const result = buildPrompt("form");
    expect(result).toContain("<template>");
    expect(result).toContain("<script>");
  });
});

// ─── parseGeneratedCode ───────────────────────────────────────────────────────

describe("parseGeneratedCode", () => {
  it("returns an empty array when there are no code blocks", () => {
    const blocks = parseGeneratedCode("No code here, just text.");
    expect(blocks).toHaveLength(0);
  });

  it("parses a single vaisx code block", () => {
    const blocks = parseGeneratedCode(VALID_VAISX_RESPONSE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.lang).toBe("vaisx");
  });

  it("parses a typescript code block", () => {
    const blocks = parseGeneratedCode(VALID_TS_RESPONSE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.lang).toBe("typescript");
  });

  it("extracts filename from // filename: comment", () => {
    const blocks = parseGeneratedCode(VALID_VAISX_RESPONSE);
    expect(blocks[0]!.filename).toBe("PrimaryButton.vaisx");
  });

  it("extracts filename from bare extension comment", () => {
    const response = "```vaisx\n// MyComp.vaisx\n<template></template>\n<script></script>\n```";
    const blocks = parseGeneratedCode(response);
    expect(blocks[0]!.filename).toBe("MyComp.vaisx");
  });

  it("returns null filename when no filename comment is present", () => {
    const response = "```vaisx\n<template></template>\n<script></script>\n```";
    const blocks = parseGeneratedCode(response);
    expect(blocks[0]!.filename).toBeNull();
  });

  it("parses multiple code blocks from one response", () => {
    const blocks = parseGeneratedCode(RESPONSE_WITH_TESTS);
    expect(blocks).toHaveLength(2);
  });

  it("code block contains the raw source code", () => {
    const blocks = parseGeneratedCode(VALID_VAISX_RESPONSE);
    expect(blocks[0]!.code).toContain("<template>");
    expect(blocks[0]!.code).toContain("<script>");
  });

  it("handles generic (untagged) code blocks", () => {
    const response = "```\n<template></template>\n<script></script>\n```";
    const blocks = parseGeneratedCode(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.lang).toBe("");
  });
});

// ─── validateGeneratedCode ────────────────────────────────────────────────────

describe("validateGeneratedCode", () => {
  const validCode = `<template>
  <div class="box">Hello</div>
</template>

<script>
export default { name: "Box" };
</script>`;

  it("returns valid:true for correct component code", () => {
    const result: ValidationResult = validateGeneratedCode(validCode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false and error when <template> is missing", () => {
    const code = `<script>export default {};</script>`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("template"))).toBe(true);
  });

  it("returns valid:false and error when </template> is missing", () => {
    const code = `<template>\n<div></div>\n<script>export default {};</script>`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("template"))).toBe(true);
  });

  it("returns valid:false and error when <script> is missing", () => {
    const code = `<template><div></div></template>`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("script"))).toBe(true);
  });

  it("returns valid:false and error when </script> is missing", () => {
    const code = `<template><div></div></template>\n<script>export default {};`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("script"))).toBe(true);
  });

  it("detects unmatched opening brace", () => {
    const code = `<template><div></div></template>\n<script>export default { name: "X";</script>`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("brace"))).toBe(true);
  });

  it("detects unmatched closing parenthesis", () => {
    const code = `<template><div></div></template>\n<script>console.log("hi"));</script>`;
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("parenthesis"))).toBe(true);
  });

  it("returns valid:false for empty code", () => {
    const result = validateGeneratedCode("");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/empty/i);
  });

  it("accumulates multiple errors", () => {
    const result = validateGeneratedCode("  ");
    // Empty/whitespace-only
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── createComponentGenerator ─────────────────────────────────────────────────

describe("createComponentGenerator", () => {
  it("returns an object with a generate method", () => {
    const gen: ComponentGenerator = createComponentGenerator(makeProvider("```vaisx\n<template></template>\n<script></script>\n```"));
    expect(typeof gen.generate).toBe("function");
  });

  it("generate() resolves with a GenerateResult", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_VAISX_RESPONSE));
    const result = await gen.generate("A primary button");
    expect(result).toHaveProperty("code");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("language");
  });

  it("result.language defaults to 'vais'", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_VAISX_RESPONSE));
    const result = await gen.generate("button");
    expect(result.language).toBe("vais");
  });

  it("result.language is 'ts' when option language:'ts' is set", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_TS_RESPONSE));
    const result = await gen.generate("card", { language: "ts" });
    expect(result.language).toBe("ts");
  });

  it("result.filename comes from the // filename: comment in the response", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_VAISX_RESPONSE));
    const result = await gen.generate("button");
    expect(result.filename).toBe("PrimaryButton.vaisx");
  });

  it("result.filename is derived from prompt when no comment present", async () => {
    const response = "```vaisx\n<template><div></div></template>\n<script>export default {};</script>\n```";
    const gen = createComponentGenerator(makeProvider(response));
    const result = await gen.generate("awesome card component");
    // Should produce a PascalCase filename
    expect(result.filename).toMatch(/\.vaisx$/);
    expect(result.filename.charAt(0)).toMatch(/[A-Z]/);
  });

  it("result.tests is undefined when includeTests is false", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_VAISX_RESPONSE));
    const result = await gen.generate("button", { includeTests: false });
    expect(result.tests).toBeUndefined();
  });

  it("result.tests is populated when includeTests is true and response has test block", async () => {
    const gen = createComponentGenerator(makeProvider(RESPONSE_WITH_TESTS));
    const result = await gen.generate("counter", { includeTests: true });
    expect(result.tests).toBeDefined();
    expect(result.tests).toContain("describe");
  });

  it("result.code contains template and script blocks", async () => {
    const gen = createComponentGenerator(makeProvider(VALID_VAISX_RESPONSE));
    const result = await gen.generate("button");
    expect(result.code).toContain("<template>");
    expect(result.code).toContain("<script>");
  });

  it("throws when the provider returns no code block", async () => {
    const gen = createComponentGenerator(makeProvider("Sorry, I cannot generate that."));
    await expect(gen.generate("button")).rejects.toThrow();
  });

  it("calls provider.complete with a non-empty prompt", async () => {
    const completeSpy = vi.fn().mockResolvedValue(VALID_VAISX_RESPONSE);
    const provider: AIProvider = {
      id: "spy",
      name: "Spy Provider",
      chat: vi.fn(),
      complete: completeSpy,
    };
    const gen = createComponentGenerator(provider);
    await gen.generate("modal");
    expect(completeSpy).toHaveBeenCalledOnce();
    const [promptArg] = completeSpy.mock.calls[0] as [string, StreamOptions];
    expect(promptArg.length).toBeGreaterThan(0);
  });
});

// ─── COMPONENT_TEMPLATES ──────────────────────────────────────────────────────

describe("COMPONENT_TEMPLATES", () => {
  const ids = ["button", "form", "card", "list", "modal"] as const;

  it("contains all expected template ids", () => {
    for (const id of ids) {
      expect(COMPONENT_TEMPLATES).toHaveProperty(id);
    }
  });

  it("each template has a non-empty source", () => {
    for (const id of ids) {
      expect(COMPONENT_TEMPLATES[id].source.length).toBeGreaterThan(0);
    }
  });

  it("each template source contains <template> and <script>", () => {
    for (const id of ids) {
      const src = COMPONENT_TEMPLATES[id].source;
      expect(src).toContain("<template>");
      expect(src).toContain("<script>");
    }
  });

  it("each template has a label string", () => {
    for (const id of ids) {
      expect(typeof COMPONENT_TEMPLATES[id].label).toBe("string");
      expect(COMPONENT_TEMPLATES[id].label.length).toBeGreaterThan(0);
    }
  });

  it("each template has a description string", () => {
    for (const id of ids) {
      expect(typeof COMPONENT_TEMPLATES[id].description).toBe("string");
    }
  });

  it("modal template contains teleport", () => {
    expect(COMPONENT_TEMPLATES.modal.source).toContain("teleport");
  });

  it("list template uses v-for", () => {
    expect(COMPONENT_TEMPLATES.list.source).toContain("v-for");
  });

  it("form template uses @submit", () => {
    expect(COMPONENT_TEMPLATES.form.source).toContain("submit");
  });
});
