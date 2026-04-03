/**
 * Console output helpers for the VaisX CLI.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

export function info(msg: string): void {
  console.log(`${CYAN}vaisx${RESET} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${GREEN}vaisx${RESET} ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`${YELLOW}vaisx${RESET} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${RED}vaisx${RESET} ${msg}`);
}

export function dim(msg: string): string {
  return `${DIM}${msg}${RESET}`;
}

export function bold(msg: string): string {
  return `${BOLD}${msg}${RESET}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
