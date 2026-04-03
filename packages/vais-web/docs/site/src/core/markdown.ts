import { marked, Renderer } from "marked";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";

/**
 * Resolve a Prism grammar by language alias.
 * Falls back to plain-text if the language is not registered.
 */
function resolveGrammar(lang: string): { grammar: Prism.Grammar | null; resolvedLang: string } {
  const aliases: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    sh: "bash",
    shell: "bash",
  };
  const resolvedLang = aliases[lang] ?? lang;
  const grammar = Prism.languages[resolvedLang] ?? null;
  return { grammar, resolvedLang };
}

/**
 * Highlight a code block using PrismJS.
 * Returns an escaped HTML string when the language is unknown.
 */
export function highlightCode(code: string, lang: string): string {
  const { grammar, resolvedLang } = resolveGrammar(lang || "plaintext");
  if (!grammar) {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre class="language-plaintext"><code>${escaped}</code></pre>`;
  }
  const highlighted = Prism.highlight(code, grammar, resolvedLang);
  return `<pre class="language-${resolvedLang}"><code class="language-${resolvedLang}">${highlighted}</code></pre>`;
}

/**
 * Configure marked with a custom renderer that delegates code
 * highlighting to PrismJS.
 */
function buildRenderer(): Renderer {
  const renderer = new Renderer();

  renderer.code = (code: string, lang?: string) => {
    return highlightCode(code, lang ?? "plaintext");
  };

  renderer.heading = (text: string, depth: number) => {
    const id = text
      .replace(/<[^>]*>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  return renderer;
}

marked.use({ renderer: buildRenderer() });

/**
 * Convert a Markdown string to an HTML string.
 */
export function renderMarkdown(markdown: string): string {
  const result = marked.parse(markdown);
  // marked.parse can return string | Promise<string>; we always use sync mode.
  if (typeof result !== "string") {
    throw new Error("marked.parse returned a Promise in sync context");
  }
  return result;
}
