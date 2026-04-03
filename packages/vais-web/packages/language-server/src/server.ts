/**
 * server.ts
 *
 * Lightweight LSP server implementation using Node.js stdio transport.
 * Handles the LSP message framing (Content-Length header protocol) and
 * dispatches JSON-RPC requests to the appropriate providers.
 *
 * The server does NOT depend on vscode-languageserver — it implements the
 * subset of the LSP protocol needed for .vaisx files directly.
 */

import { createInterface } from 'readline';
import type { Readable, Writable } from 'stream';
import {
  TextDocumentSyncKind,
  ErrorCodes,
  type LSPMessage,
  type LSPRequest,
  type LSPResponse,
  type InitializeParams,
  type InitializeResult,
  type ServerCapabilities,
} from './lsp-types.js';
import { getCompletions } from './completions.js';
import { getDiagnostics } from './diagnostics.js';
import { getHover } from './hover.js';

/** In-memory document store keyed by URI */
export interface TextDocument {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

const documents = new Map<string, TextDocument>();

/** Tracks whether a `shutdown` request has been received (LSP spec compliance) */
let shutdownReceived = false;

/** Server capabilities advertised in the initialize response */
const SERVER_CAPABILITIES: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Full,
  completionProvider: {
    triggerCharacters: ['<', '.', '@', ':'],
    resolveProvider: false,
  },
  hoverProvider: true,
  diagnosticProvider: {
    interFileDependencies: false,
    workspaceDiagnostics: false,
  },
};

// ─── Message framing ─────────────────────────────────────────────────────────

let inputBuffer = '';

function sendMessage(output: Writable, message: LSPMessage): void {
  const json = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
  output.write(header + json);
}

function sendResponse(output: Writable, id: number | string | null, result: unknown): void {
  const response: LSPResponse = { jsonrpc: '2.0', id, result };
  sendMessage(output, response);
}

function sendError(
  output: Writable,
  id: number | string | null,
  code: number,
  message: string,
): void {
  const response: LSPResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
  sendMessage(output, response);
}

function sendNotification(output: Writable, method: string, params: unknown): void {
  sendMessage(output, { jsonrpc: '2.0', method, params });
}

// ─── Request dispatch ─────────────────────────────────────────────────────────

function handleMessage(output: Writable, msg: LSPMessage): void {
  if (!msg.method) return; // Response messages — ignore

  const method = msg.method;
  const id = (msg as LSPRequest).id ?? null;
  const params = msg.params as Record<string, unknown> | undefined;

  switch (method) {
    case 'initialize': {
      const result: InitializeResult = {
        capabilities: SERVER_CAPABILITIES,
        serverInfo: { name: 'vaisx-language-server', version: '0.1.0' },
      };
      sendResponse(output, id, result);
      break;
    }

    case 'initialized':
      // No-op notification — server is ready
      break;

    case 'shutdown':
      shutdownReceived = true;
      sendResponse(output, id, null);
      break;

    case 'exit':
      process.exit(shutdownReceived ? 0 : 1);
      break;

    case 'textDocument/didOpen': {
      const item = (params as { textDocument: { uri: string; languageId: string; version: number; text: string } }).textDocument;
      documents.set(item.uri, {
        uri: item.uri,
        languageId: item.languageId,
        version: item.version,
        text: item.text,
      });
      publishDiagnostics(output, item.uri, item.text);
      break;
    }

    case 'textDocument/didChange': {
      const { textDocument, contentChanges } = params as {
        textDocument: { uri: string; version: number };
        contentChanges: Array<{ range?: unknown; text: string }>;
      };
      const doc = documents.get(textDocument.uri);
      if (doc) {
        // For simplicity, apply full-text replacement (treat all changes as full sync)
        for (const change of contentChanges) {
          doc.text = change.text;
        }
        doc.version = textDocument.version;
        publishDiagnostics(output, doc.uri, doc.text);
      }
      break;
    }

    case 'textDocument/didClose': {
      const { textDocument } = params as { textDocument: { uri: string } };
      documents.delete(textDocument.uri);
      break;
    }

    case 'textDocument/completion': {
      const { textDocument, position } = params as {
        textDocument: { uri: string };
        position: { line: number; character: number };
      };
      const doc = documents.get(textDocument.uri);
      if (!doc) {
        sendResponse(output, id, { isIncomplete: false, items: [] });
        break;
      }
      const completions = getCompletions({
        documentText: doc.text,
        position,
      });
      sendResponse(output, id, completions);
      break;
    }

    case 'textDocument/hover': {
      const { textDocument, position } = params as {
        textDocument: { uri: string };
        position: { line: number; character: number };
      };
      const doc = documents.get(textDocument.uri);
      if (!doc) {
        sendResponse(output, id, null);
        break;
      }
      const hover = getHover({ documentText: doc.text, position });
      sendResponse(output, id, hover);
      break;
    }

    default:
      if (id !== null) {
        sendError(output, id, ErrorCodes.MethodNotFound, `Method not found: ${method}`);
      }
  }
}

function publishDiagnostics(output: Writable, uri: string, text: string): void {
  const diagnostics = getDiagnostics(text);
  sendNotification(output, 'textDocument/publishDiagnostics', { uri, diagnostics });
}

// ─── Connection / transport ───────────────────────────────────────────────────

/**
 * Start the LSP server reading from the given input stream and writing to output.
 * The default is process.stdin / process.stdout (stdio transport).
 */
export function startServer(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): void {
  const rl = createInterface({ input, terminal: false });
  let contentLength = -1;
  let body = '';

  // LSP uses a two-part framing: HTTP-like headers then JSON body
  rl.on('line', (line) => {
    if (line.startsWith('Content-Length:')) {
      contentLength = parseInt(line.slice('Content-Length:'.length).trim(), 10);
    } else if (line === '' || line === '\r') {
      // Blank line after headers — next data is the JSON body
      // We'll receive it via the 'data' event on the underlying stream
      // but readline already buffers it. Use a temporary listener approach.
    }
  });

  // For proper LSP framing we need raw stream access
  // Restart using raw 'data' events instead of readline.
  // rl.close() leaves the stream in paused state — resume it explicitly so that
  // the 'data' listener below receives events correctly.
  rl.close();
  input.resume();

  let rawBuffer = Buffer.alloc(0);

  input.on('data', (chunk: Buffer | string) => {
    rawBuffer = Buffer.concat([rawBuffer, Buffer.from(chunk)]);
    processBuffer(output);
  });

  function processBuffer(out: Writable): void {
    while (true) {
      // Look for the header/body separator
      const rawStr = rawBuffer.toString('utf8');
      const headerEnd = rawStr.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = rawStr.slice(0, headerEnd);
      const lenMatch = /Content-Length:\s*(\d+)/i.exec(headers);
      if (!lenMatch) break;

      const bodyLength = parseInt(lenMatch[1], 10);
      const bodyStart = headerEnd + 4; // after \r\n\r\n

      if (rawBuffer.length < bodyStart + bodyLength) break; // Wait for more data

      const bodyStr = rawBuffer.slice(bodyStart, bodyStart + bodyLength).toString('utf8');
      rawBuffer = rawBuffer.slice(bodyStart + bodyLength);

      try {
        const msg = JSON.parse(bodyStr) as LSPMessage;
        handleMessage(out, msg);
      } catch {
        // Malformed JSON — ignore
      }
    }
  }
}

/** Expose the document store for testing */
export function getDocuments(): Map<string, TextDocument> {
  return documents;
}

/** Clear document store (for tests) */
export function clearDocuments(): void {
  documents.clear();
}

/** Expose shutdown flag for testing */
export function isShutdownReceived(): boolean {
  return shutdownReceived;
}

/** Reset server state (for tests) */
export function resetServerState(): void {
  documents.clear();
  shutdownReceived = false;
}
