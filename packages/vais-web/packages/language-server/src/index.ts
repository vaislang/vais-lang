/**
 * index.ts
 *
 * Entry point for the VaisX Language Server.
 * Starts the LSP server on stdio transport when run directly.
 */

export { startServer, getDocuments, clearDocuments } from './server.js';
export { getCompletions, getDirectiveCompletions, getPropsForComponent } from './completions.js';
export { getDiagnostics } from './diagnostics.js';
export { getHover, getWordAtPosition, isDirective, isBuiltinComponent, isVaisxApi } from './hover.js';
export { parseVaisxFile, extractComponents, extractVariables, getBlockAtPosition } from './parser-bridge.js';
export * from './lsp-types.js';

// Start the server when this module is run directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('index.js');

if (isMain) {
  const { startServer } = await import('./server.js');
  startServer(process.stdin, process.stdout);
}
