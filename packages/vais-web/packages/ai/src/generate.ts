/**
 * Component generator for @vaisx/ai.
 *
 * Provides a pipeline for converting natural-language prompts into
 * VaisX (.vaisx) or TypeScript component code via an AI provider.
 *
 * Main exports:
 *  - createComponentGenerator  — factory that wires up the full pipeline
 *  - buildPrompt               — construct a few-shot system + user prompt
 *  - parseGeneratedCode        — extract code blocks & filename from LLM output
 *  - validateGeneratedCode     — basic structural validation of generated code
 *  - ComponentTemplate         — preset component templates
 */

import type { AIProvider } from "./types.js";

// ─── Options & Result types ───────────────────────────────────────────────────

/**
 * Options that control what the generator produces.
 */
export interface GenerateOptions {
  /** Target language for the generated component. Defaults to "vais". */
  language?: "vais" | "ts";
  /** Style preset: "minimal" produces a bare-bones skeleton,
   *  "full" adds styling, props, and emits. Defaults to "minimal". */
  style?: "minimal" | "full";
  /** When true the generator also produces a companion test file. */
  includeTests?: boolean;
}

/**
 * The result returned by the component generator.
 */
export interface GenerateResult {
  /** The generated component source code. */
  code: string;
  /** Suggested file name for the component (e.g. "MyButton.vaisx"). */
  filename: string;
  /** Language of the generated code. */
  language: "vais" | "ts";
  /** Optional companion test source when `includeTests` was requested. */
  tests?: string;
}

// ─── Parsed code block ───────────────────────────────────────────────────────

/**
 * Internal representation of a single extracted code block.
 */
export interface ParsedCodeBlock {
  /** Raw source inside the fenced code block. */
  code: string;
  /** Language tag on the fence (e.g. "vaisx", "typescript"). */
  lang: string;
  /** Filename extracted from a leading comment or header, if present. */
  filename: string | null;
}

// ─── Validation result ───────────────────────────────────────────────────────

/**
 * Result returned by validateGeneratedCode.
 */
export interface ValidationResult {
  /** True when all checks pass. */
  valid: boolean;
  /** List of human-readable error messages (empty when valid). */
  errors: string[];
}

// ─── Component templates ─────────────────────────────────────────────────────

/**
 * Preset template identifiers.
 */
export type TemplateId = "button" | "form" | "card" | "list" | "modal";

/**
 * A component template preset.
 */
export interface ComponentTemplate {
  /** Unique identifier. */
  id: TemplateId;
  /** Human-readable label. */
  label: string;
  /** Short description used in prompts. */
  description: string;
  /** The skeleton source code for this template. */
  source: string;
}

/**
 * Built-in component templates indexed by TemplateId.
 */
export const COMPONENT_TEMPLATES: Record<TemplateId, ComponentTemplate> = {
  button: {
    id: "button",
    label: "Button",
    description: "A simple interactive button component",
    source: `<template>
  <button class="btn" @click="handleClick">
    <slot>{{ label }}</slot>
  </button>
</template>

<script>
export default {
  name: "MyButton",
  props: {
    label: { type: String, default: "Click me" },
    disabled: { type: Boolean, default: false },
  },
  methods: {
    handleClick(event) {
      if (!this.disabled) {
        this.$emit("click", event);
      }
    },
  },
};
</script>`,
  },

  form: {
    id: "form",
    label: "Form",
    description: "A data-entry form component with validation",
    source: `<template>
  <form class="form" @submit.prevent="handleSubmit">
    <slot />
    <button type="submit">Submit</button>
  </form>
</template>

<script>
export default {
  name: "MyForm",
  emits: ["submit"],
  methods: {
    handleSubmit() {
      this.$emit("submit");
    },
  },
};
</script>`,
  },

  card: {
    id: "card",
    label: "Card",
    description: "A content card with header, body, and footer slots",
    source: `<template>
  <div class="card">
    <div class="card-header"><slot name="header" /></div>
    <div class="card-body"><slot /></div>
    <div class="card-footer"><slot name="footer" /></div>
  </div>
</template>

<script>
export default {
  name: "MyCard",
};
</script>`,
  },

  list: {
    id: "list",
    label: "List",
    description: "A dynamic list component with item rendering",
    source: `<template>
  <ul class="list">
    <li v-for="item in items" :key="item.id" class="list-item">
      <slot name="item" :item="item">{{ item.label }}</slot>
    </li>
  </ul>
</template>

<script>
export default {
  name: "MyList",
  props: {
    items: { type: Array, default: () => [] },
  },
};
</script>`,
  },

  modal: {
    id: "modal",
    label: "Modal",
    description: "A dialog/modal overlay component",
    source: `<template>
  <teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal">
        <div class="modal-header">
          <slot name="header" />
          <button class="modal-close" @click="close">×</button>
        </div>
        <div class="modal-body"><slot /></div>
        <div class="modal-footer"><slot name="footer" /></div>
      </div>
    </div>
  </teleport>
</template>

<script>
export default {
  name: "MyModal",
  props: {
    visible: { type: Boolean, default: false },
  },
  emits: ["close"],
  methods: {
    close() {
      this.$emit("close");
    },
  },
};
</script>`,
  },
};

// ─── buildPrompt ─────────────────────────────────────────────────────────────

/**
 * Build a complete prompt string that instructs the LLM to produce a VaisX
 * or TypeScript component.
 *
 * The prompt includes:
 *  1. A system preamble that describes .vaisx file structure and style rules.
 *  2. A few-shot example (minimal button).
 *  3. The user's own prompt.
 *
 * @param userPrompt - The natural-language description of the component.
 * @param options    - Generation options (language, style, includeTests).
 * @returns            A fully-formed prompt string ready to send to an AI provider.
 */
export function buildPrompt(userPrompt: string, options?: GenerateOptions): string {
  const language = options?.language ?? "vais";
  const style = options?.style ?? "minimal";
  const includeTests = options?.includeTests ?? false;

  const langLabel = language === "vais" ? "VaisX (.vaisx)" : "TypeScript (.ts)";
  const fenceTag = language === "vais" ? "vaisx" : "typescript";

  const styleGuide =
    style === "full"
      ? `## Style guide (full)
- Include CSS class names on all elements.
- Define all relevant props with types and defaults.
- Emit events for every user interaction.
- Add JSDoc comments to all exported members.`
      : `## Style guide (minimal)
- Keep the component as small as possible.
- Only include the props and events that are strictly necessary.
- No inline styles; a single className per element is enough.`;

  const testSection = includeTests
    ? `\n\nAlso provide a test file in a second \`\`\`typescript\`\`\` block.
The test file should import the component and contain at least three test cases using vitest.`
    : "";

  const fewShotExample = `## Example

User prompt: "A reusable primary button"

\`\`\`${fenceTag}
// filename: PrimaryButton.${language === "vais" ? "vaisx" : "ts"}
<template>
  <button class="btn-primary" :disabled="disabled" @click="$emit('click', $event)">
    <slot>{{ label }}</slot>
  </button>
</template>

<script>
export default {
  name: "PrimaryButton",
  props: {
    label: { type: String, default: "Button" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["click"],
};
</script>
\`\`\``;

  return `You are an expert ${langLabel} component generator for the VaisX framework.

## VaisX component structure
A .vaisx file contains exactly:
1. A \`<template>\` block — the HTML-like markup.
2. A \`<script>\` block   — the component definition (export default { ... }).
3. (Optional) A \`<style>\` block for scoped CSS.

Rules:
- Always include \`<template>\` and \`<script>\` blocks.
- Use \`this.$emit\` to communicate events to parent components.
- Props must be declared in the \`props\` option.
- Place the filename as a comment on the very first line: \`// filename: ComponentName.vaisx\`

${styleGuide}

${fewShotExample}
${testSection}

## Task

Generate a ${langLabel} component for the following description:

${userPrompt}

Respond with ONLY the fenced code block(s). Do not add any explanation outside the blocks.`;
}

// ─── parseGeneratedCode ───────────────────────────────────────────────────────

/**
 * Extract all fenced code blocks from an LLM response string.
 *
 * Handles:
 *  - \`\`\`vaisx … \`\`\`
 *  - \`\`\`typescript … \`\`\`
 *  - \`\`\`ts … \`\`\`
 *  - Generic \`\`\` … \`\`\` blocks
 *
 * Filename is detected from a leading comment in the form:
 *  \`// filename: MyComponent.vaisx\`
 * or from a line starting with \`// MyComponent.vaisx\`.
 *
 * @param response - The raw text returned by the LLM.
 * @returns          An array of ParsedCodeBlock (may be empty).
 */
export function parseGeneratedCode(response: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];

  // Regex: captures optional language tag and everything up to the closing fence.
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(response)) !== null) {
    const lang = (match[1] ?? "").toLowerCase().trim();
    const rawCode = match[2] ?? "";

    // Attempt to extract a filename from the first line of the code block.
    const firstLine = rawCode.split("\n")[0]?.trim() ?? "";
    let filename: string | null = null;

    // Pattern 1: // filename: MyComponent.vaisx
    const filenamePattern = /^\/\/\s*filename:\s*(\S+)/i;
    // Pattern 2: // MyComponent.vaisx  (bare comment with extension)
    const bareFilenamePattern = /^\/\/\s*(\S+\.(vaisx|ts|tsx|js|jsx))\s*$/i;

    const fm = filenamePattern.exec(firstLine);
    if (fm) {
      filename = fm[1] ?? null;
    } else {
      const bm = bareFilenamePattern.exec(firstLine);
      if (bm) {
        filename = bm[1] ?? null;
      }
    }

    blocks.push({ code: rawCode.trimEnd(), lang, filename });
  }

  return blocks;
}

// ─── validateGeneratedCode ────────────────────────────────────────────────────

/**
 * Perform basic structural validation on generated VaisX component code.
 *
 * Checks performed:
 *  1. \`<template>\` block is present.
 *  2. \`<\/template>\` closing tag is present.
 *  3. \`<script>\` block is present.
 *  4. \`<\/script>\` closing tag is present.
 *  5. Balanced curly braces \`{}\`.
 *  6. Balanced parentheses \`()\`.
 *  7. Balanced square brackets \`[]\`.
 *
 * @param code - The component source code to validate.
 * @returns      A ValidationResult with a boolean and any error messages.
 */
export function validateGeneratedCode(code: string): ValidationResult {
  const errors: string[] = [];

  if (!code || code.trim().length === 0) {
    return { valid: false, errors: ["Code is empty"] };
  }

  // Block presence checks
  if (!/<template[\s>]/i.test(code) && !/<template>/i.test(code)) {
    errors.push("Missing <template> block");
  }
  if (!/<\/template>/i.test(code)) {
    errors.push("Missing </template> closing tag");
  }
  if (!/<script[\s>]/i.test(code) && !/<script>/i.test(code)) {
    errors.push("Missing <script> block");
  }
  if (!/<\/script>/i.test(code)) {
    errors.push("Missing </script> closing tag");
  }

  // Bracket balance check helper
  function checkBalance(
    open: string,
    close: string,
    label: string,
  ): void {
    // Strip string literals and comments to avoid false positives
    const stripped = code
      .replace(/\/\/[^\n]*/g, "")      // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')   // double-quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")   // single-quoted strings
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");  // template literals

    let depth = 0;
    for (const ch of stripped) {
      if (ch === open) depth++;
      else if (ch === close) depth--;
      if (depth < 0) {
        errors.push(`Unmatched closing ${label} '${close}'`);
        return;
      }
    }
    if (depth !== 0) {
      errors.push(`Unmatched opening ${label} '${open}' (depth=${depth})`);
    }
  }

  checkBalance("{", "}", "brace");
  checkBalance("(", ")", "parenthesis");
  checkBalance("[", "]", "bracket");

  return { valid: errors.length === 0, errors };
}

// ─── ComponentGenerator ───────────────────────────────────────────────────────

/**
 * A component generator instance created by createComponentGenerator.
 */
export interface ComponentGenerator {
  /**
   * Generate a VaisX or TypeScript component from a natural-language prompt.
   *
   * @param prompt  - What the component should do.
   * @param options - Generation options.
   * @returns         A GenerateResult with code, filename, and optional tests.
   */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
}

/**
 * Derive a PascalCase component name from an arbitrary prompt string.
 *
 * @example
 * deriveComponentName("a primary button") // "APrimaryButton"
 */
function deriveComponentName(prompt: string): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4); // keep it short

  if (words.length === 0) return "GeneratedComponent";

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Build the filename from a ParsedCodeBlock, a prompt, and the target language.
 */
function resolveFilename(
  block: ParsedCodeBlock,
  prompt: string,
  language: "vais" | "ts",
): string {
  if (block.filename) return block.filename;

  const ext = language === "vais" ? "vaisx" : "ts";
  const name = deriveComponentName(prompt);
  return `${name}.${ext}`;
}

/**
 * Create a component generator backed by the given AI provider.
 *
 * @param provider - An AIProvider (OpenAI, Anthropic, Ollama, …).
 * @returns          A ComponentGenerator with a single `generate` method.
 *
 * @example
 * ```ts
 * const gen = createComponentGenerator(myProvider);
 * const result = await gen.generate("A card with title and body", { style: "full" });
 * console.log(result.code);
 * ```
 */
export function createComponentGenerator(provider: AIProvider): ComponentGenerator {
  return {
    async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
      const language = options?.language ?? "vais";
      const includeTests = options?.includeTests ?? false;

      // 1. Build the LLM prompt
      const fullPrompt = buildPrompt(prompt, options);

      // 2. Call the provider
      const response = await provider.complete(fullPrompt, {});

      // 3. Parse code blocks from the response
      const blocks = parseGeneratedCode(response);

      // Try to find the primary component block
      const componentBlock =
        blocks.find((b) =>
          b.lang === "vaisx" ||
          b.lang === "typescript" ||
          b.lang === "ts" ||
          b.lang === "",
        ) ?? blocks[0];

      if (!componentBlock) {
        throw new Error(
          "No code block found in the AI response. " +
          "The model may not have followed the output format.",
        );
      }

      const code = componentBlock.code;
      const filename = resolveFilename(componentBlock, prompt, language);

      // 4. Optionally extract tests from a second block
      let tests: string | undefined;
      if (includeTests) {
        const testBlock = blocks.find(
          (b, idx) =>
            idx !== blocks.indexOf(componentBlock) &&
            (b.lang === "typescript" || b.lang === "ts"),
        );
        if (testBlock) {
          tests = testBlock.code;
        }
      }

      return { code, filename, language, tests };
    },
  };
}
