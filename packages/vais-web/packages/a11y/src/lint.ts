/**
 * A11yLinter — compile-time static accessibility linter for VaisX templates.
 *
 * Parses HTML/template source strings using regex-based tag extraction and
 * emits LintDiagnostic entries for accessibility violations.
 *
 * Rules implemented (WAI-ARIA 1.2):
 *   img-alt          — <img> missing alt attribute (error)
 *   aria-role        — invalid WAI-ARIA role value (error)
 *   aria-props       — invalid aria-* attribute name (error)
 *   button-type      — <button> missing type attribute (warning)
 *   label-for        — <input> without associated <label> or aria-label (warning)
 *   heading-order    — heading levels skip (h1→h3 etc.) (warning)
 *   tabindex-positive — tabindex value > 0 (warning)
 */

import type { LintDiagnostic } from "./types.js";

// ─── WAI-ARIA 1.2 Valid Roles ────────────────────────────────────────────────

const VALID_ARIA_ROLES = new Set([
  // Document structure roles
  "article", "banner", "cell", "columnheader", "complementary", "contentinfo",
  "definition", "directory", "document", "feed", "figure", "form", "generic",
  "group", "heading", "img", "list", "listitem", "main", "math", "navigation",
  "none", "note", "presentation", "region", "row", "rowgroup", "rowheader",
  "search", "section", "sectionhead", "separator", "table", "term", "toolbar",
  "tooltip",
  // Widget roles
  "alert", "alertdialog", "application", "button", "checkbox", "columnheader",
  "combobox", "dialog", "grid", "gridcell", "link", "listbox", "log", "marquee",
  "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter",
  "option", "progressbar", "radio", "radiogroup", "scrollbar", "searchbox",
  "slider", "spinbutton", "status", "switch", "tab", "tablist", "tabpanel",
  "textbox", "timer", "tree", "treegrid", "treeitem",
  // Live region roles
  "log", "marquee", "status", "timer",
  // Landmark roles
  "banner", "complementary", "contentinfo", "form", "main", "navigation",
  "region", "search",
]);

// ─── WAI-ARIA 1.2 Valid aria-* Properties ───────────────────────────────────

const VALID_ARIA_PROPS = new Set([
  "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-braillelabel",
  "aria-brailleroledescription", "aria-busy", "aria-checked", "aria-colcount",
  "aria-colindex", "aria-colindextext", "aria-colspan", "aria-controls",
  "aria-current", "aria-describedby", "aria-description", "aria-details",
  "aria-disabled", "aria-dropeffect", "aria-errormessage", "aria-expanded",
  "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid",
  "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-level",
  "aria-live", "aria-modal", "aria-multiline", "aria-multiselectable",
  "aria-orientation", "aria-owns", "aria-placeholder", "aria-posinset",
  "aria-pressed", "aria-readonly", "aria-relevant", "aria-required",
  "aria-roledescription", "aria-rowcount", "aria-rowindex", "aria-rowindextext",
  "aria-rowspan", "aria-selected", "aria-setsize", "aria-sort", "aria-valuemax",
  "aria-valuemin", "aria-valuenow", "aria-valuetext",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

/** Per-rule severity override configuration. */
export type RuleSeverity = "error" | "warning" | "info";

export interface A11yLintConfig {
  /** Override severity for individual rules. Key = ruleId, value = desired severity. */
  rules?: Partial<Record<string, RuleSeverity>>;
  /** Default filename to use in diagnostics when lint() is called without filename. */
  filename?: string;
}

/** An extracted HTML tag with its parsed attributes and source position. */
interface ParsedTag {
  /** Tag name, lowercase (e.g. "img", "button"). */
  tagName: string;
  /** Raw attribute string (everything inside the opening tag after the tag name). */
  attrs: Record<string, string | true>;
  /** 1-based line number of the opening `<`. */
  line: number;
  /** 1-based column number of the opening `<`. */
  column: number;
  /** Whether this is a self-closing tag (`<img />`). */
  selfClosing: boolean;
  /** Full raw match string (for debugging). */
  raw: string;
}

// ─── Parser Helpers ──────────────────────────────────────────────────────────

/**
 * Parse attribute string into a key→value map.
 * Handles: attr, attr="val", attr='val', attr=val (unquoted).
 * Boolean attributes (no value) are stored as `true`.
 */
function parseAttrs(attrStr: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  // Match: name, name="val", name='val', name=val
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:\-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    if (m[2] !== undefined) {
      attrs[name] = m[2];
    } else if (m[3] !== undefined) {
      attrs[name] = m[3];
    } else if (m[4] !== undefined) {
      attrs[name] = m[4];
    } else {
      attrs[name] = true;
    }
  }
  return attrs;
}

/**
 * Convert a character offset in source to { line, column } (both 1-based).
 */
function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

/**
 * Extract all opening tags (and self-closing tags) from source.
 * Skips comments <!-- ... --> and CDATA/script content heuristically.
 */
function parseTags(source: string): ParsedTag[] {
  const tags: ParsedTag[] = [];

  // Remove HTML comments to avoid false positives
  const stripped = source.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));

  // Match opening or self-closing tags: <tagname ...attrs... [/]>
  const tagRe = /<([a-zA-Z][a-zA-Z0-9\-]*)(\s[^>]*)?(\/?)>/g;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(stripped)) !== null) {
    const tagName = m[1].toLowerCase();
    const attrStr = m[2] ?? "";
    const selfClosing = m[3] === "/";
    const raw = m[0];
    const offset = m.index;
    const { line, column } = offsetToLineCol(source, offset);

    tags.push({
      tagName,
      attrs: parseAttrs(attrStr),
      line,
      column,
      selfClosing,
      raw,
    });
  }

  return tags;
}

// ─── A11yLinter ──────────────────────────────────────────────────────────────

/**
 * Compile-time accessibility linter for VaisX/HTML template strings.
 *
 * ```ts
 * const linter = new A11yLinter();
 * const diagnostics = linter.lint('<img src="photo.jpg">', 'App.vaisx');
 * // → [{ ruleId: 'img-alt', severity: 'error', ... }]
 * ```
 */
export class A11yLinter {
  private readonly config: A11yLintConfig;

  constructor(config: A11yLintConfig = {}) {
    this.config = config;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Lint a VaisX/HTML template source string and return all accessibility diagnostics.
   *
   * @param source   Raw template source text.
   * @param filename Path to the source file (used in diagnostics). Falls back to config.filename or "<unknown>".
   */
  lint(source: string, filename?: string): LintDiagnostic[] {
    const file = filename ?? this.config.filename ?? "<unknown>";
    const diagnostics: LintDiagnostic[] = [];
    const tags = parseTags(source);

    // Per-rule checks
    this.checkImgAlt(tags, file, diagnostics);
    this.checkAriaRole(tags, file, diagnostics);
    this.checkAriaProps(tags, file, diagnostics);
    this.checkButtonType(tags, file, diagnostics);
    this.checkLabelFor(tags, source, file, diagnostics);
    this.checkHeadingOrder(tags, file, diagnostics);
    this.checkTabindexPositive(tags, file, diagnostics);

    return diagnostics;
  }

  // ─── Rule Implementations ────────────────────────────────────────────────

  /**
   * img-alt: <img> tags must have an alt attribute.
   */
  private checkImgAlt(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    for (const tag of tags) {
      if (tag.tagName !== "img") continue;
      if (!("alt" in tag.attrs)) {
        out.push(this.diag(file, tag, "img-alt", "error", "img element is missing an alt attribute."));
      }
    }
  }

  /**
   * aria-role: role attribute value must be a valid WAI-ARIA 1.2 role.
   */
  private checkAriaRole(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    for (const tag of tags) {
      const roleVal = tag.attrs["role"];
      if (roleVal === undefined) continue;
      if (roleVal === true) {
        out.push(this.diag(file, tag, "aria-role", "error", `role attribute has no value. Must be a valid WAI-ARIA role.`));
        continue;
      }
      // A role attribute may contain multiple space-separated tokens
      const roles = roleVal.split(/\s+/).filter(Boolean);
      for (const role of roles) {
        if (!VALID_ARIA_ROLES.has(role)) {
          out.push(
            this.diag(file, tag, "aria-role", "error", `"${role}" is not a valid WAI-ARIA 1.2 role.`)
          );
        }
      }
    }
  }

  /**
   * aria-props: aria-* attribute names must be valid WAI-ARIA 1.2 properties.
   */
  private checkAriaProps(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    for (const tag of tags) {
      for (const attrName of Object.keys(tag.attrs)) {
        if (!attrName.startsWith("aria-")) continue;
        if (!VALID_ARIA_PROPS.has(attrName)) {
          out.push(
            this.diag(file, tag, "aria-props", "error", `"${attrName}" is not a valid WAI-ARIA 1.2 property.`)
          );
        }
      }
    }
  }

  /**
   * button-type: <button> elements should have an explicit type attribute.
   */
  private checkButtonType(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    for (const tag of tags) {
      if (tag.tagName !== "button") continue;
      if (!("type" in tag.attrs)) {
        out.push(
          this.diag(file, tag, "button-type", "warning", '<button> element is missing a type attribute (use type="button", "submit", or "reset").')
        );
      }
    }
  }

  /**
   * label-for: <input> elements should be associated with a <label for="..."> or have aria-label / aria-labelledby.
   *
   * Strategy:
   * 1. If the <input> has aria-label or aria-labelledby → pass.
   * 2. If the <input> has an id, look for a <label for="<id>"> in source → pass.
   * 3. Otherwise → warning.
   *
   * Note: <input type="hidden"> is exempt.
   */
  private checkLabelFor(tags: ParsedTag[], source: string, file: string, out: LintDiagnostic[]): void {
    // Collect label[for] targets from source
    const labelForIds = new Set<string>();
    const labelForRe = /<label[^>]*\bfor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]*))/gi;
    let m: RegExpExecArray | null;
    while ((m = labelForRe.exec(source)) !== null) {
      const id = m[1] ?? m[2] ?? m[3] ?? "";
      if (id) labelForIds.add(id);
    }

    for (const tag of tags) {
      if (tag.tagName !== "input") continue;
      // Skip hidden inputs
      const typeVal = tag.attrs["type"];
      if (typeof typeVal === "string" && typeVal.toLowerCase() === "hidden") continue;

      // aria-label or aria-labelledby present → pass
      if ("aria-label" in tag.attrs || "aria-labelledby" in tag.attrs) continue;

      // id matches a label[for="id"] → pass
      const idVal = tag.attrs["id"];
      if (typeof idVal === "string" && idVal && labelForIds.has(idVal)) continue;

      out.push(
        this.diag(
          file,
          tag,
          "label-for",
          "warning",
          "<input> element is not associated with a <label> element and has no aria-label or aria-labelledby."
        )
      );
    }
  }

  /**
   * heading-order: heading levels must not skip (e.g. h1 → h3 without h2).
   */
  private checkHeadingOrder(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    const headingRe = /^h([1-6])$/;
    let lastLevel = 0;

    for (const tag of tags) {
      const m = headingRe.exec(tag.tagName);
      if (!m) continue;
      const level = parseInt(m[1], 10);

      if (lastLevel > 0 && level > lastLevel + 1) {
        out.push(
          this.diag(
            file,
            tag,
            "heading-order",
            "warning",
            `Heading level skipped: h${lastLevel} → h${level}. Heading levels should not be skipped.`
          )
        );
      }
      lastLevel = level;
    }
  }

  /**
   * tabindex-positive: tabindex values greater than 0 disrupt natural tab order.
   */
  private checkTabindexPositive(tags: ParsedTag[], file: string, out: LintDiagnostic[]): void {
    for (const tag of tags) {
      const val = tag.attrs["tabindex"];
      if (val === undefined || val === true) continue;
      const num = parseInt(val as string, 10);
      if (!isNaN(num) && num > 0) {
        out.push(
          this.diag(
            file,
            tag,
            "tabindex-positive",
            "warning",
            `tabindex="${num}" creates a custom tab order, which can disrupt keyboard navigation. Use tabindex="0" or tabindex="-1" instead.`
          )
        );
      }
    }
  }

  // ─── Diagnostic Factory ──────────────────────────────────────────────────

  private diag(
    file: string,
    tag: ParsedTag,
    ruleId: string,
    defaultSeverity: RuleSeverity,
    message: string
  ): LintDiagnostic {
    const severity = this.config.rules?.[ruleId] ?? defaultSeverity;
    return {
      file,
      line: tag.line,
      column: tag.column,
      ruleId,
      message,
      severity,
    };
  }
}
