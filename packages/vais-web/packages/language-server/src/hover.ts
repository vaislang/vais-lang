/**
 * hover.ts
 *
 * Hover information provider for .vaisx files.
 * Returns documentation for:
 *  - VaisX built-in components
 *  - VaisX directives
 *  - VaisX reactivity APIs
 *  - HTML elements
 */

import { MarkupKind, VAISX_DIRECTIVES, BUILTIN_COMPONENTS, VAISX_APIS } from './lsp-types.js';
import type { Hover, Position, Range } from './lsp-types.js';
import { parseVaisxFile, getBlockAtPosition } from './parser-bridge.js';

/** Maps each word to its hover documentation */
const HOVER_DOCS: Record<string, { title: string; description: string }> = {
  // Built-in components
  Button: {
    title: 'Button',
    description: 'Built-in VaisX Button component.\n\n**Props:** `variant`, `disabled`, `type`, `onClick`',
  },
  Input: {
    title: 'Input',
    description: 'Built-in VaisX Input component.\n\n**Props:** `value`, `placeholder`, `disabled`, `type`, `onChange`',
  },
  Link: {
    title: 'Link',
    description: 'Built-in VaisX Link component for client-side navigation.\n\n**Props:** `href`, `external`',
  },
  Head: {
    title: 'Head',
    description: 'Built-in VaisX Head component for page metadata.\n\n**Props:** `title`',
  },
  Modal: {
    title: 'Modal',
    description: 'Built-in VaisX Modal dialog component.\n\n**Props:** `open`, `onClose`, `title`',
  },
  Dropdown: {
    title: 'Dropdown',
    description: 'Built-in VaisX Dropdown component.\n\n**Props:** `items`, `onSelect`, `placeholder`',
  },
  Table: {
    title: 'Table',
    description: 'Built-in VaisX Table component.\n\n**Props:** `data`, `columns`',
  },
  Toast: {
    title: 'Toast',
    description: 'Built-in VaisX Toast notification component.\n\n**Props:** `message`, `type`, `duration`',
  },

  // Directives
  'v-if': {
    title: 'v-if',
    description: 'Conditionally renders the element.\n\n```html\n<p v-if="count > 0">{{ count }}</p>\n```',
  },
  'v-else': {
    title: 'v-else',
    description: 'Renders when the preceding `v-if` condition is false.',
  },
  'v-else-if': {
    title: 'v-else-if',
    description: 'Chained condition following a `v-if`.',
  },
  'v-for': {
    title: 'v-for',
    description:
      'Renders the element for each item in a list.\n\n```html\n<li v-for="item in items" :key="item.id">{{ item.name }}</li>\n```',
  },
  'v-bind': {
    title: 'v-bind',
    description:
      'Dynamically binds an attribute. Shorthand: `:attr="value"`.\n\n```html\n<img v-bind:src="imageUrl" />\n```',
  },
  'v-on': {
    title: 'v-on',
    description:
      'Attaches an event listener. Shorthand: `@event="handler"`.\n\n```html\n<button v-on:click="handleClick">Click</button>\n```',
  },
  'v-show': {
    title: 'v-show',
    description:
      'Toggles the CSS `display` property based on a condition (element always rendered in DOM).',
  },
  'v-model': {
    title: 'v-model',
    description:
      'Creates a two-way binding between a form element and reactive state.\n\n```html\n<input v-model="searchQuery" />\n```',
  },
  'v-slot': {
    title: 'v-slot',
    description: 'Declares a named or scoped slot target on a component.',
  },

  // Reactivity APIs
  __vx_state: {
    title: '__vx_state(initialValue)',
    description:
      'Creates a reactive signal.\n\n```ts\nlet count = __vx_state(0);\n// count is a reactive variable\ncount++;\n```',
  },
  __vx_derived: {
    title: '__vx_derived(expression)',
    description:
      'Creates a derived (computed) reactive value that updates when dependencies change.\n\n```ts\nlet doubled = __vx_derived(count * 2);\n```',
  },
  __vx_effect: {
    title: '__vx_effect(fn)',
    description:
      'Registers a reactive side effect that re-runs when its dependencies change.\n\n```ts\n__vx_effect(() => { console.log(count); });\n```',
  },
  __vx_ref: {
    title: '__vx_ref()',
    description: 'Creates a reference to a DOM element or component instance.',
  },
  __vx_computed: {
    title: '__vx_computed(fn)',
    description: 'Creates a memoized computed value from a function.',
  },
};

/** HTML element documentation (abbreviated) */
const HTML_ELEMENT_DOCS: Record<string, string> = {
  div: 'Generic block-level container element.',
  span: 'Generic inline container element.',
  p: 'Paragraph of text.',
  a: 'Hyperlink — use the `href` attribute to specify the destination.',
  button: 'Clickable button element.',
  input: 'Interactive form control.',
  img: 'Embeds an image. Requires `alt` attribute for accessibility.',
  ul: 'Unordered (bulleted) list.',
  ol: 'Ordered (numbered) list.',
  li: 'List item within `<ul>` or `<ol>`.',
  form: 'Section containing interactive controls for submitting data.',
  table: 'Tabular data container.',
};

export interface HoverContext {
  documentText: string;
  position: Position;
}

/**
 * Compute hover information at the given position.
 */
export function getHover(ctx: HoverContext): Hover | null {
  const { documentText, position } = ctx;
  const parsed = parseVaisxFile(documentText);
  const block = getBlockAtPosition(parsed, position);

  const lines = documentText.split('\n');
  const line = lines[position.line] ?? '';
  const word = getWordAtPosition(line, position.character);

  if (!word) return null;

  // Check main docs map
  const doc = HOVER_DOCS[word];
  if (doc) {
    return buildHover(doc.title, doc.description, position, line, word);
  }

  // HTML elements (only in template block)
  if (block?.type === 'template') {
    const htmlDoc = HTML_ELEMENT_DOCS[word];
    if (htmlDoc) {
      return buildHover(
        `<${word}>`,
        `HTML element — ${htmlDoc}`,
        position,
        line,
        word,
      );
    }
  }

  return null;
}

/** Extracts the word (identifier) at the given character position */
export function getWordAtPosition(line: string, character: number): string | null {
  // Allow word chars, hyphens (for directives), and underscores
  const wordRe = /[\w-]+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(line)) !== null) {
    if (m.index <= character && character <= m.index + m[0].length) {
      return m[0];
    }
  }
  return null;
}

function buildHover(
  title: string,
  description: string,
  position: Position,
  line: string,
  word: string,
): Hover {
  const start = line.indexOf(word);
  const range: Range | undefined =
    start !== -1
      ? {
          start: { line: position.line, character: start },
          end: { line: position.line, character: start + word.length },
        }
      : undefined;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${title}**\n\n${description}`,
    },
    range,
  };
}

/**
 * Returns whether a token is a known VaisX directive.
 */
export function isDirective(token: string): boolean {
  return (VAISX_DIRECTIVES as readonly string[]).includes(token);
}

/**
 * Returns whether a token is a known built-in component.
 */
export function isBuiltinComponent(token: string): boolean {
  return (BUILTIN_COMPONENTS as readonly string[]).includes(token);
}

/**
 * Returns whether a token is a VaisX reactivity API.
 */
export function isVaisxApi(token: string): boolean {
  return (VAISX_APIS as readonly string[]).includes(token);
}
