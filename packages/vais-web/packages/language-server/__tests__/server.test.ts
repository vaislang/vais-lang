/**
 * server.test.ts
 *
 * Tests for LSP server capabilities and shutdown/exit protocol compliance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';
import {
  startServer,
  resetServerState,
  isShutdownReceived,
} from '../src/server.js';
import { TextDocumentSyncKind } from '../src/lsp-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Encode a JSON-RPC message using LSP framing (Content-Length header). */
function encodeLSP(msg: object): Buffer {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
  return Buffer.from(header + json, 'utf8');
}

/** Parse all LSP-framed messages from a raw buffer. */
function parseLSPMessages(raw: Buffer): object[] {
  const messages: object[] = [];
  let buf = raw;
  while (buf.length > 0) {
    const str = buf.toString('utf8');
    const headerEnd = str.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const headers = str.slice(0, headerEnd);
    const lenMatch = /Content-Length:\s*(\d+)/i.exec(headers);
    if (!lenMatch) break;
    const bodyLen = parseInt(lenMatch[1], 10);
    const bodyStart = headerEnd + 4;
    if (buf.length < bodyStart + bodyLen) break;
    const bodyStr = buf.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
    buf = buf.slice(bodyStart + bodyLen);
    messages.push(JSON.parse(bodyStr));
  }
  return messages;
}

/**
 * Send one LSP message to a started server and collect all response messages
 * written to the output stream. Returns a Promise that resolves once the
 * output has received at least one chunk or a timeout elapses.
 */
async function sendAndReceive(msg: object): Promise<object[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  startServer(input, output);

  // Collect chunks emitted on output
  const chunks: Buffer[] = [];
  let resolveData!: () => void;
  const dataPromise = new Promise<void>((resolve) => {
    resolveData = resolve;
  });
  output.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    resolveData();
  });

  // Write after attaching listener so we don't miss early events
  input.write(encodeLSP(msg));

  // Wait for a response chunk or a timeout (notifications may produce no response)
  await Promise.race([
    dataPromise,
    new Promise<void>((resolve) => setTimeout(resolve, 50)),
  ]);

  // Collect any additional chunks that arrived in this tick
  await new Promise<void>((resolve) => setImmediate(resolve));

  input.destroy();
  output.destroy();

  return parseLSPMessages(Buffer.concat(chunks));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetServerState();
});

describe('initialize — server capabilities', () => {
  it('advertises Full text document sync kind', async () => {
    const responses = await sendAndReceive({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { capabilities: {} },
    });

    expect(responses).toHaveLength(1);
    const result = (responses[0] as { result: { capabilities: { textDocumentSync: number } } }).result;
    expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Full);
    // Numeric value 1 per LSP spec
    expect(result.capabilities.textDocumentSync).toBe(1);
  });

  it('includes completionProvider in capabilities', async () => {
    const responses = await sendAndReceive({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { capabilities: {} },
    });

    const result = (responses[0] as { result: { capabilities: { completionProvider: unknown } } }).result;
    expect(result.capabilities.completionProvider).toBeDefined();
  });

  it('includes hoverProvider in capabilities', async () => {
    const responses = await sendAndReceive({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: { capabilities: {} },
    });

    const result = (responses[0] as { result: { capabilities: { hoverProvider: boolean } } }).result;
    expect(result.capabilities.hoverProvider).toBe(true);
  });
});

describe('shutdown / exit protocol', () => {
  it('shutdownReceived is false initially', () => {
    expect(isShutdownReceived()).toBe(false);
  });

  it('shutdownReceived becomes true after shutdown request', async () => {
    expect(isShutdownReceived()).toBe(false);

    await sendAndReceive({
      jsonrpc: '2.0',
      id: 10,
      method: 'shutdown',
      params: null,
    });

    expect(isShutdownReceived()).toBe(true);
  });

  it('shutdown response has null result per LSP spec', async () => {
    const responses = await sendAndReceive({
      jsonrpc: '2.0',
      id: 11,
      method: 'shutdown',
      params: null,
    });

    expect(responses).toHaveLength(1);
    const response = responses[0] as { id: number; result: null };
    expect(response.id).toBe(11);
    expect(response.result).toBeNull();
  });

  it('exit after shutdown would use code 0 (flag is true)', async () => {
    // Send shutdown to set the flag
    await sendAndReceive({
      jsonrpc: '2.0',
      id: 20,
      method: 'shutdown',
      params: null,
    });

    expect(isShutdownReceived()).toBe(true);
    // The flag being true means process.exit(0) would be called — verified without
    // actually invoking process.exit so the test process stays alive.
  });

  it('exit without shutdown would use code 1 (flag is false)', () => {
    // No shutdown sent — flag remains false
    expect(isShutdownReceived()).toBe(false);
    // The flag being false means process.exit(1) would be called — verified without
    // actually invoking process.exit so the test process stays alive.
  });

  it('resetServerState resets shutdownReceived flag', async () => {
    await sendAndReceive({
      jsonrpc: '2.0',
      id: 30,
      method: 'shutdown',
      params: null,
    });
    expect(isShutdownReceived()).toBe(true);

    resetServerState();
    expect(isShutdownReceived()).toBe(false);
  });
});

describe('exit handler — process.exit code selection', () => {
  it('calls process.exit(1) when exit arrives without prior shutdown', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);

    try {
      const input = new PassThrough();
      const output = new PassThrough();
      startServer(input, output);

      // Do NOT send shutdown first
      input.write(encodeLSP({ jsonrpc: '2.0', method: 'exit', params: null }));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('calls process.exit(0) when exit arrives after shutdown', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);

    try {
      const input = new PassThrough();
      const output = new PassThrough();
      startServer(input, output);

      // Send shutdown first
      input.write(encodeLSP({ jsonrpc: '2.0', id: 99, method: 'shutdown', params: null }));
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Then send exit
      input.write(encodeLSP({ jsonrpc: '2.0', method: 'exit', params: null }));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
