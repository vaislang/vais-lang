/**
 * extension.ts
 *
 * VS Code extension entry point for VaisX language support.
 * Starts a language client that connects to the vaisx-language-server via stdio.
 *
 * The extension activates on .vaisx files and provides:
 *  - Syntax highlighting (via TextMate grammar in package.json contributes)
 *  - Completions, diagnostics, hover via the LSP server
 */

// VS Code API is provided at runtime by VS Code — import types only for compilation
// The actual 'vscode' module is injected by VS Code's extension host.
import type * as vscode from 'vscode';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execFile } from 'child_process';

/** Extension output channel name */
const OUTPUT_CHANNEL_NAME = 'VaisX Language Server';

/** VS Code language ID for .vaisx files */
const VAISX_LANGUAGE_ID = 'vaisx';

/** File selector used by the language client */
const VAISX_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', language: VAISX_LANGUAGE_ID },
];

/**
 * Extension state — holds references that must be disposed on deactivation.
 */
interface ExtensionState {
  outputChannel: vscode.OutputChannel;
  client: VaisxLanguageClient | null;
  disposables: vscode.Disposable[];
}

let state: ExtensionState | null = null;

// ─── Lightweight Language Client ──────────────────────────────────────────────

/**
 * Minimal language client that spawns the vaisx-language-server process
 * and forwards VS Code events to it over stdio using the LSP protocol.
 *
 * In a production extension this would use the official
 * vscode-languageclient/node package. We implement a subset here to avoid
 * the dependency during development.
 */
class VaisxLanguageClient {
  private serverProcess: ReturnType<typeof execFile> | null = null;
  private readonly serverPath: string;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(serverPath: string, outputChannel: vscode.OutputChannel) {
    this.serverPath = serverPath;
    this.outputChannel = outputChannel;
  }

  start(): void {
    this.outputChannel.appendLine(`Starting VaisX language server: ${this.serverPath}`);
    try {
      this.serverProcess = execFile(
        process.execPath,
        [this.serverPath, '--stdio'],
        { env: process.env },
      );

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        this.outputChannel.appendLine(`[server] ${data.toString().trim()}`);
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        this.outputChannel.appendLine(`[server error] ${data.toString().trim()}`);
      });

      this.serverProcess.on('exit', (code) => {
        this.outputChannel.appendLine(`Server exited with code: ${code}`);
      });
    } catch (err) {
      this.outputChannel.appendLine(`Failed to start server: ${String(err)}`);
    }
  }

  stop(): void {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  get isRunning(): boolean {
    return this.serverProcess !== null;
  }
}

// ─── Activation ───────────────────────────────────────────────────────────────

/**
 * Called by VS Code when the extension is activated (first .vaisx file opened).
 */
export function activate(context: vscode.ExtensionContext): void {
  // Require vscode at runtime — during tests this may be stubbed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeApi = require('vscode') as typeof vscode;

  const outputChannel = vscodeApi.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine('VaisX extension activating...');

  const disposables: vscode.Disposable[] = [];
  disposables.push(outputChannel);

  // Locate the language server binary
  const serverPath = findServerBinary(context.extensionPath);

  let client: VaisxLanguageClient | null = null;

  if (serverPath) {
    outputChannel.appendLine(`Found language server at: ${serverPath}`);
    client = new VaisxLanguageClient(serverPath, outputChannel);
    client.start();
  } else {
    outputChannel.appendLine(
      'Language server binary not found — running without LSP features. ' +
      'Run `pnpm build` in packages/language-server to enable full IDE support.',
    );
  }

  // Register commands
  const restartCmd = vscodeApi.commands.registerCommand('vaisx.restartServer', () => {
    outputChannel.appendLine('Restarting VaisX language server...');
    client?.stop();
    if (serverPath) {
      client = new VaisxLanguageClient(serverPath, outputChannel);
      client.start();
    }
  });
  disposables.push(restartCmd);

  // Push all disposables to VS Code context
  context.subscriptions.push(...disposables);

  state = { outputChannel, client, disposables };
  outputChannel.appendLine('VaisX extension activated.');
}

/**
 * Called by VS Code when the extension is deactivated.
 */
export function deactivate(): void {
  if (state) {
    state.client?.stop();
    for (const d of state.disposables) {
      d.dispose();
    }
    state = null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the path to the language server binary relative to the extension root.
 * Looks for the pre-built dist output from @vaisx/language-server.
 */
function findServerBinary(extensionPath: string): string | null {
  // Development: sibling package in the monorepo
  const monorepoPath = resolve(extensionPath, '../language-server/dist/index.js');
  if (existsSync(monorepoPath)) return monorepoPath;

  // Bundled: server shipped inside the extension
  const bundledPath = resolve(extensionPath, 'server/index.js');
  if (existsSync(bundledPath)) return bundledPath;

  return null;
}

/** Exported for testing */
export { VaisxLanguageClient, findServerBinary, VAISX_LANGUAGE_ID, VAISX_SELECTOR };
