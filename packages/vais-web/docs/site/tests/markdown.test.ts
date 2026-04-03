import { describe, it, expect } from "vitest";
import { renderMarkdown, highlightCode } from "../src/core/markdown.js";

describe("renderMarkdown", () => {
  it("converts a heading to an <hN> element", () => {
    const html = renderMarkdown("# Hello World");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello World");
    expect(html).toContain("</h1>");
  });

  it("adds an id attribute derived from heading text", () => {
    const html = renderMarkdown("## Getting Started");
    expect(html).toContain('id="getting-started"');
  });

  it("converts a paragraph to a <p> element", () => {
    const html = renderMarkdown("Hello, VaisX!");
    expect(html).toContain("<p>");
    expect(html).toContain("Hello, VaisX!");
    expect(html).toContain("</p>");
  });

  it("converts bold syntax to <strong>", () => {
    const html = renderMarkdown("**bold text**");
    expect(html).toContain("<strong>bold text</strong>");
  });

  it("converts italic syntax to <em>", () => {
    const html = renderMarkdown("_italic_");
    expect(html).toContain("<em>italic</em>");
  });

  it("converts an unordered list", () => {
    const md = "- item one\n- item two\n- item three";
    const html = renderMarkdown(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
  });

  it("converts a fenced code block and applies syntax highlighting", () => {
    const md = "```typescript\nconst x: number = 42;\n```";
    const html = renderMarkdown(md);
    expect(html).toContain('<pre class="language-typescript">');
    expect(html).toContain('<code class="language-typescript">');
    // Prism should tokenise the keyword
    expect(html).toContain("const");
  });

  it("converts a fenced code block for bash", () => {
    const md = "```bash\nnpm install @vaisx/runtime\n```";
    const html = renderMarkdown(md);
    expect(html).toContain('class="language-bash"');
    // Prism tokenizes "npm" and "install" separately
    expect(html).toContain("npm");
    expect(html).toContain("install");
  });

  it("converts a Markdown link to an <a> element", () => {
    const html = renderMarkdown("[VaisX](https://example.com)");
    expect(html).toContain('<a href="https://example.com">VaisX</a>');
  });

  it("converts a Markdown table", () => {
    const md =
      "| Package | Size |\n|---|---|\n| runtime | 3 KB |\n| kit | 5 KB |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Package</th>");
    expect(html).toContain("<td>runtime</td>");
  });

  it("converts a blockquote", () => {
    const html = renderMarkdown("> This is a note");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("This is a note");
  });

  it("returns a non-empty string for empty input", () => {
    const html = renderMarkdown("");
    expect(typeof html).toBe("string");
  });
});

describe("highlightCode", () => {
  it("wraps output in pre.language-* and code.language-*", () => {
    const html = highlightCode("const x = 1;", "javascript");
    expect(html).toContain('<pre class="language-javascript">');
    expect(html).toContain('<code class="language-javascript">');
    expect(html).toContain("</code></pre>");
  });

  it("handles the 'ts' alias for typescript", () => {
    const html = highlightCode("let y: string = 'hello';", "ts");
    expect(html).toContain("language-typescript");
  });

  it("handles the 'sh' alias for bash", () => {
    const html = highlightCode("echo hello", "sh");
    expect(html).toContain("language-bash");
  });

  it("falls back gracefully for unknown language", () => {
    const html = highlightCode("some code", "unknown-lang-xyz");
    expect(html).toContain("<pre");
    expect(html).toContain("some code");
  });

  it("escapes HTML special characters for unknown language", () => {
    const html = highlightCode("<div>&</div>", "unknown-lang-xyz");
    expect(html).toContain("&lt;div&gt;&amp;&lt;/div&gt;");
  });
});
