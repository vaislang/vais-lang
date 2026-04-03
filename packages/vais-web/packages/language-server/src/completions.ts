/**
 * completions.ts
 *
 * Auto-completion provider for .vaisx files.
 * Provides completions for:
 *  - VaisX built-in components
 *  - VaisX directives (v-if, v-for, etc.)
 *  - HTML elements
 *  - Props for known components
 *  - VaisX reactivity APIs
 */

import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  MarkupKind,
  VAISX_DIRECTIVES,
  BUILTIN_COMPONENTS,
  VAISX_APIS,
} from './lsp-types.js';
import type { Position } from './lsp-types.js';
import {
  parseVaisxFile,
  extractComponents,
  getBlockAtPosition,
  type ComponentInfo,
} from './parser-bridge.js';

/** Common HTML elements to include in template completions */
const HTML_ELEMENTS = [
  'div', 'span', 'p', 'a', 'button', 'input', 'form', 'label',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'main',
  'nav', 'section', 'article', 'aside', 'figure', 'img', 'video',
  'canvas', 'select', 'option', 'textarea', 'pre', 'code', 'strong',
  'em', 'br', 'hr', 'slot',
];

/** Directive documentation */
const DIRECTIVE_DOCS: Record<string, string> = {
  'v-if': 'Conditionally render the element based on an expression.',
  'v-else': 'Render this element when the preceding v-if is false.',
  'v-else-if': 'Else-if chain for v-if.',
  'v-for': 'Render the element multiple times using a list. Usage: `v-for="item in list"`.',
  'v-bind': 'Dynamically bind an attribute. Shorthand: `:attr="value"`.',
  'v-on': 'Attach an event listener. Shorthand: `@event="handler"`.',
  'v-show': 'Toggle element visibility (CSS display) based on expression.',
  'v-model': 'Create a two-way binding on a form element or component.',
  'v-slot': 'Declare a named or scoped slot.',
};

/** Built-in component props */
const BUILTIN_COMPONENT_PROPS: Record<string, Array<{ name: string; type: string; description: string }>> = {
  Button: [
    { name: 'variant', type: 'string', description: 'Visual variant: "primary" | "secondary" | "ghost"' },
    { name: 'disabled', type: 'boolean', description: 'Whether the button is disabled' },
    { name: 'type', type: 'string', description: 'HTML button type: "button" | "submit" | "reset"' },
    { name: 'onClick', type: 'function', description: 'Click event handler' },
  ],
  Input: [
    { name: 'value', type: 'string', description: 'Input value' },
    { name: 'placeholder', type: 'string', description: 'Placeholder text' },
    { name: 'disabled', type: 'boolean', description: 'Whether the input is disabled' },
    { name: 'type', type: 'string', description: 'Input type: "text" | "email" | "password" | "number"' },
    { name: 'onChange', type: 'function', description: 'Change event handler' },
  ],
  Link: [
    { name: 'href', type: 'string', description: 'Navigation target URL' },
    { name: 'external', type: 'boolean', description: 'Opens in a new tab' },
  ],
  Head: [
    { name: 'title', type: 'string', description: 'Page title' },
  ],
  Modal: [
    { name: 'open', type: 'boolean', description: 'Whether the modal is visible' },
    { name: 'onClose', type: 'function', description: 'Handler called when modal is closed' },
    { name: 'title', type: 'string', description: 'Modal header title' },
  ],
  Dropdown: [
    { name: 'items', type: 'array', description: 'List of dropdown items' },
    { name: 'onSelect', type: 'function', description: 'Selection handler' },
    { name: 'placeholder', type: 'string', description: 'Placeholder when nothing is selected' },
  ],
  Table: [
    { name: 'data', type: 'array', description: 'Row data array' },
    { name: 'columns', type: 'array', description: 'Column definition array' },
  ],
  Toast: [
    { name: 'message', type: 'string', description: 'Toast message text' },
    { name: 'type', type: 'string', description: 'Toast type: "success" | "error" | "warning" | "info"' },
    { name: 'duration', type: 'number', description: 'Auto-dismiss delay in milliseconds' },
  ],
};

export interface CompletionContext {
  /** Full document text */
  documentText: string;
  /** Cursor position */
  position: Position;
  /** Trigger character if invoked by one */
  triggerCharacter?: string;
}

/**
 * Get completion items for the given context.
 */
export function getCompletions(ctx: CompletionContext): CompletionList {
  const parsed = parseVaisxFile(ctx.documentText);
  const block = getBlockAtPosition(parsed, ctx.position);

  if (!block) {
    return { isIncomplete: false, items: getTopLevelCompletions() };
  }

  if (block.type === 'template') {
    const userComponents = parsed.script
      ? extractComponents(parsed.script.content)
      : [];
    return {
      isIncomplete: false,
      items: getTemplateCompletions(ctx, userComponents),
    };
  }

  if (block.type === 'script') {
    return { isIncomplete: false, items: getScriptCompletions() };
  }

  return { isIncomplete: false, items: [] };
}

/** Completions when cursor is not inside any block (top-level of file) */
function getTopLevelCompletions(): CompletionItem[] {
  return [
    {
      label: '<script lang="ts">',
      kind: CompletionItemKind.Snippet,
      detail: 'VaisX script block',
      insertText: '<script lang="ts">\n$0\n</script>',
    },
    {
      label: '<template>',
      kind: CompletionItemKind.Snippet,
      detail: 'VaisX template block',
      insertText: '<template>\n  $0\n</template>',
    },
    {
      label: '<style>',
      kind: CompletionItemKind.Snippet,
      detail: 'VaisX style block',
      insertText: '<style>\n  $0\n</style>',
    },
  ];
}

/** Completions inside a <template> block */
function getTemplateCompletions(
  ctx: CompletionContext,
  userComponents: ComponentInfo[],
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const lineText = getLineAt(ctx.documentText, ctx.position.line);
  const beforeCursor = lineText.slice(0, ctx.position.character);

  const isInOpenTag = isInsideOpenTag(beforeCursor);
  const tagName = isInOpenTag ? getTagName(beforeCursor) : null;

  // If we're inside an open tag, provide directive/prop completions
  if (isInOpenTag && tagName) {
    // Directive completions
    for (const directive of VAISX_DIRECTIVES) {
      items.push({
        label: directive,
        kind: CompletionItemKind.Keyword,
        detail: 'VaisX directive',
        documentation: {
          kind: MarkupKind.Markdown,
          value: DIRECTIVE_DOCS[directive] ?? '',
        },
        insertText: `${directive}="$1"`,
        sortText: `0_${directive}`,
      });
    }

    // Props for built-in components
    if (tagName in BUILTIN_COMPONENT_PROPS) {
      for (const prop of BUILTIN_COMPONENT_PROPS[tagName]) {
        items.push({
          label: prop.name,
          kind: CompletionItemKind.Property,
          detail: `${prop.name}: ${prop.type}`,
          documentation: prop.description,
          sortText: `1_${prop.name}`,
        });
      }
    }

    // Props for user-defined components
    for (const component of userComponents) {
      if (component.name === tagName) {
        for (const prop of component.props) {
          items.push({
            label: prop.name,
            kind: CompletionItemKind.Property,
            detail: `${prop.name}: ${prop.type}`,
          });
        }
      }
    }

    return items;
  }

  // Tag completions — built-in components
  for (const comp of BUILTIN_COMPONENTS) {
    items.push({
      label: comp,
      kind: CompletionItemKind.Class,
      detail: 'VaisX built-in component',
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Built-in VaisX \`<${comp}>\` component.`,
      },
      insertText: `<${comp}$1></${comp}>`,
      sortText: `0_${comp}`,
    });
  }

  // Tag completions — user-defined components
  for (const component of userComponents) {
    items.push({
      label: component.name,
      kind: CompletionItemKind.Class,
      detail: 'User component',
      insertText: `<${component.name}$1></${component.name}>`,
      sortText: `1_${component.name}`,
    });
  }

  // Tag completions — HTML elements
  for (const el of HTML_ELEMENTS) {
    items.push({
      label: el,
      kind: CompletionItemKind.Value,
      detail: 'HTML element',
      insertText: `<${el}$1></${el}>`,
      sortText: `2_${el}`,
    });
  }

  return items;
}

/** Completions inside a <script> block */
function getScriptCompletions(): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const api of VAISX_APIS) {
    items.push({
      label: api,
      kind: CompletionItemKind.Function,
      detail: 'VaisX reactivity API',
      documentation: getApiDoc(api),
      sortText: `0_${api}`,
    });
  }

  return items;
}

/** Returns documentation string for a VaisX API */
function getApiDoc(api: string): string {
  const docs: Record<string, string> = {
    __vx_state: 'Creates a reactive state signal. Usage: `let count = __vx_state(0);`',
    __vx_derived: 'Creates a derived (computed) signal from an expression.',
    __vx_effect: 'Registers a side effect that re-runs when dependencies change.',
    __vx_ref: 'Creates a reference to a DOM element or component instance.',
    __vx_computed: 'Creates a memoized computed value.',
  };
  return docs[api] ?? '';
}

/** Returns the text of a specific line from the document */
export function getLineAt(documentText: string, line: number): string {
  const lines = documentText.split('\n');
  return lines[line] ?? '';
}

/** Returns true if the cursor appears to be inside an open tag's attribute list */
export function isInsideOpenTag(textBeforeCursor: string): boolean {
  // Find the last '<' that isn't a closing tag
  const lastOpen = textBeforeCursor.lastIndexOf('<');
  if (lastOpen === -1) return false;
  const slice = textBeforeCursor.slice(lastOpen);
  // Must not have '>' after the '<', and not be a closing tag
  return !slice.includes('>') && !slice.startsWith('</');
}

/** Extracts the tag name from text ending inside an open tag */
export function getTagName(textBeforeCursor: string): string | null {
  const lastOpen = textBeforeCursor.lastIndexOf('<');
  if (lastOpen === -1) return null;
  const slice = textBeforeCursor.slice(lastOpen + 1).trim();
  const m = /^(\w[\w-]*)/.exec(slice);
  return m ? m[1] : null;
}

/**
 * Get prop completions for a specific component (used for targeted prop lookup).
 */
export function getPropsForComponent(componentName: string): CompletionItem[] {
  const props = BUILTIN_COMPONENT_PROPS[componentName] ?? [];
  return props.map((prop) => ({
    label: prop.name,
    kind: CompletionItemKind.Property,
    detail: `${prop.name}: ${prop.type}`,
    documentation: prop.description,
  }));
}

/**
 * Get all directive completions (for testing).
 */
export function getDirectiveCompletions(): CompletionItem[] {
  return VAISX_DIRECTIVES.map((directive) => ({
    label: directive,
    kind: CompletionItemKind.Keyword,
    detail: 'VaisX directive',
    documentation: {
      kind: MarkupKind.Markdown,
      value: DIRECTIVE_DOCS[directive] ?? '',
    },
  }));
}
