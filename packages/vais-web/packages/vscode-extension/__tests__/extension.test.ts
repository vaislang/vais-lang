/**
 * Tests for VS Code extension helper logic.
 * These tests run in Node (not the VS Code runtime), so they can only test
 * the pure utility functions exported from extension.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

// The extension imports 'vscode' at runtime — mock it so the module can load
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

// Import helpers directly (they don't touch the vscode API)
import { findServerBinary, VAISX_LANGUAGE_ID, VAISX_SELECTOR } from '../src/extension.js';

describe('findServerBinary', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Use a nested path to avoid sibling `language-server/` in the real monorepo
    tmpDir = resolve(tmpdir(), `vaisx-ext-test-${Date.now()}`, 'isolated', 'ext');
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no binary is found', () => {
    const result = findServerBinary(tmpDir);
    expect(result).toBeNull();
  });

  it('finds server in monorepo sibling path', () => {
    // Simulate: tmpDir/../language-server/dist/index.js
    const serverDir = resolve(tmpDir, '../language-server/dist');
    mkdirSync(serverDir, { recursive: true });
    writeFileSync(resolve(serverDir, 'index.js'), '// server');

    const result = findServerBinary(tmpDir);
    expect(result).toContain('index.js');
    expect(result).toContain('language-server');
  });

  it('finds bundled server path', () => {
    const serverDir = resolve(tmpDir, 'server');
    mkdirSync(serverDir, { recursive: true });
    writeFileSync(resolve(serverDir, 'index.js'), '// bundled server');

    const result = findServerBinary(tmpDir);
    expect(result).toContain('index.js');
  });
});

describe('VAISX_LANGUAGE_ID', () => {
  it('is "vaisx"', () => {
    expect(VAISX_LANGUAGE_ID).toBe('vaisx');
  });
});

describe('VAISX_SELECTOR', () => {
  it('targets vaisx language', () => {
    const selector = VAISX_SELECTOR as Array<{ scheme: string; language: string }>;
    expect(selector[0].language).toBe('vaisx');
    expect(selector[0].scheme).toBe('file');
  });
});
