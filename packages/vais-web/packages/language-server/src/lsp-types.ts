/**
 * Local LSP type definitions — lightweight mock of vscode-languageserver protocol types.
 * These match the LSP specification so the server can be connected to a real client
 * without changing any logic.
 */

export const enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2,
}

export const enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export const enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export const enum MarkupKind {
  PlainText = 'plaintext',
  Markdown = 'markdown',
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface TextDocumentContentChangeEvent {
  range?: Range;
  text: string;
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | MarkupContent;
  insertText?: string;
  sortText?: string;
}

export interface MarkupContent {
  kind: MarkupKind;
  value: string;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

export interface Diagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
}

export interface Hover {
  contents: MarkupContent | string;
  range?: Range;
}

export interface InitializeParams {
  processId?: number | null;
  rootUri?: string | null;
  capabilities: ClientCapabilities;
}

export interface ClientCapabilities {
  textDocument?: {
    completion?: {
      completionItem?: {
        documentationFormat?: MarkupKind[];
      };
    };
  };
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface ServerCapabilities {
  textDocumentSync?: TextDocumentSyncKind | { change: TextDocumentSyncKind };
  completionProvider?: {
    triggerCharacters?: string[];
    resolveProvider?: boolean;
  };
  hoverProvider?: boolean;
  diagnosticProvider?: {
    interFileDependencies: boolean;
    workspaceDiagnostics?: boolean;
  };
}

export interface LSPMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: LSPError;
}

export interface LSPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface LSPRequest extends LSPMessage {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface LSPNotification extends LSPMessage {
  method: string;
  params?: unknown;
}

export interface LSPResponse extends LSPMessage {
  id: number | string | null;
  result?: unknown;
  error?: LSPError;
}

/** LSP error codes */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002,
  RequestCancelled: -32800,
} as const;

/** VaisX directives for completion */
export const VAISX_DIRECTIVES = [
  'v-if',
  'v-else',
  'v-else-if',
  'v-for',
  'v-bind',
  'v-on',
  'v-show',
  'v-model',
  'v-slot',
] as const;

/** Built-in VaisX components */
export const BUILTIN_COMPONENTS = [
  'Button',
  'Input',
  'Link',
  'Head',
  'Modal',
  'Dropdown',
  'Table',
  'Toast',
] as const;

/** VaisX state/reactivity APIs */
export const VAISX_APIS = [
  '__vx_state',
  '__vx_derived',
  '__vx_effect',
  '__vx_ref',
  '__vx_computed',
] as const;
