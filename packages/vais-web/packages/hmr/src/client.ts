/**
 * HMR client — runs in the browser.
 *
 * Injected into the page by the dev server.
 * Listens for server messages and applies hot updates.
 */

import type {
  HmrServerMessage,
  HmrModuleRecord,
} from "./protocol.js";
import { createHmrModuleRecord } from "./protocol.js";

// ---------------------------------------------------------------------------
// Module registry
// ---------------------------------------------------------------------------

const moduleMap = new Map<string, HmrModuleRecord>();

/**
 * Get or create the HMR module record for a given file.
 * Called by compiler-generated code.
 */
export function getHmrModule(id: string): HmrModuleRecord {
  let record = moduleMap.get(id);
  if (!record) {
    record = createHmrModuleRecord(id);
    moduleMap.set(id, record);
  }
  return record;
}

// ---------------------------------------------------------------------------
// HMR API (injected into each component module as `import.meta.hot`)
// ---------------------------------------------------------------------------

export interface HotContext {
  /** Data object preserved across hot updates. */
  data: Record<string, unknown>;

  /** Accept self-updates. Callback receives the new module. */
  accept(callback?: (mod: unknown) => void): void;

  /** Decline hot updates — forces full reload on change. */
  decline(): void;

  /** Register cleanup before the module is replaced. */
  dispose(callback: (data: Record<string, unknown>) => void): void;

  /** Invalidate: request that the parent re-import this module. */
  invalidate(): void;
}

/**
 * Create an `import.meta.hot`-compatible API for a module.
 */
export function createHotContext(moduleId: string): HotContext {
  const record = getHmrModule(moduleId);

  // Reset callbacks on re-evaluation (new module version)
  record.acceptCallbacks = [];
  record.disposeCallbacks = [];

  return {
    get data() {
      return record.data;
    },

    accept(callback?: (mod: unknown) => void) {
      record.accepted = true;
      if (callback) {
        record.acceptCallbacks.push(callback);
      }
    },

    decline() {
      record.declined = true;
    },

    dispose(callback: (data: Record<string, unknown>) => void) {
      record.disposeCallbacks.push(callback);
    },

    invalidate() {
      // Trigger a re-import from parent
      // For now, this forces full reload
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// CSS hot reload
// ---------------------------------------------------------------------------

function handleCssUpdate(file: string, css: string): void {
  // Find existing <style> tag for this file or create one
  const id = `vaisx-css-${file.replace(/[^a-zA-Z0-9]/g, "-")}`;
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = id;
    styleEl.setAttribute("data-vaisx-file", file);
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
}

// ---------------------------------------------------------------------------
// Component hot reload
// ---------------------------------------------------------------------------

function handleComponentUpdate(file: string, code?: string): void {
  const record = moduleMap.get(file);

  if (!record || record.declined) {
    // No HMR record or declined — full reload
    console.log(`[vaisx:hmr] full reload (${record?.declined ? "declined" : "no record"}): ${file}`);
    window.location.reload();
    return;
  }

  if (!record.accepted) {
    // Module doesn't accept hot updates — full reload
    console.log(`[vaisx:hmr] full reload (not accepted): ${file}`);
    window.location.reload();
    return;
  }

  // Run dispose callbacks (cleanup old module)
  const newData: Record<string, unknown> = {};
  for (const cb of record.disposeCallbacks) {
    cb(newData);
  }
  record.data = newData;

  // If code is provided, evaluate it to get the new module
  if (code) {
    try {
      // Create a blob URL for the new module code
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      import(/* @vite-ignore */ url)
        .then((newModule) => {
          URL.revokeObjectURL(url);
          // Run accept callbacks
          for (const cb of record.acceptCallbacks) {
            cb(newModule);
          }
          console.log(`[vaisx:hmr] updated: ${file}`);
        })
        .catch((err) => {
          URL.revokeObjectURL(url);
          console.error(`[vaisx:hmr] update failed for ${file}:`, err);
          window.location.reload();
        });
    } catch (err) {
      console.error(`[vaisx:hmr] update failed for ${file}:`, err);
      window.location.reload();
    }
  } else {
    // No code provided — just run accept callbacks with undefined
    for (const cb of record.acceptCallbacks) {
      cb(undefined);
    }
    console.log(`[vaisx:hmr] updated (no code): ${file}`);
  }
}

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

export interface HmrClientOptions {
  /** WebSocket URL. Default: derives from current page. */
  wsUrl?: string;
  /** Port. Default: derives from current page. */
  port?: number;
}

/**
 * Connect to the HMR WebSocket server.
 * Called once on page load.
 */
export function connectHmr(options: HmrClientOptions = {}): void {
  if (typeof window === "undefined") return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = options.port ?? (parseInt(window.location.port, 10) || 80);
  const url = options.wsUrl ?? `${protocol}//${host}:${port}/__vaisx_hmr`;

  let ws: WebSocket;
  let retryCount = 0;
  const maxRetries = 10;

  function connect() {
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      console.log("[vaisx:hmr] connected");
      retryCount = 0;
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as HmrServerMessage;

      switch (msg.type) {
        case "connected":
          console.log("[vaisx:hmr] server ready");
          break;

        case "update":
          handleComponentUpdate(msg.file, msg.code);
          break;

        case "css-update":
          handleCssUpdate(msg.file, msg.css);
          break;

        case "full-reload":
          console.log(`[vaisx:hmr] full reload${msg.file ? `: ${msg.file}` : ""}`);
          window.location.reload();
          break;

        case "error":
          console.error(`[vaisx:hmr] error in ${msg.file}: ${msg.message}`);
          // Show error overlay (could be enhanced later)
          break;
      }
    });

    ws.addEventListener("close", () => {
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.log(`[vaisx:hmr] disconnected, retrying in ${delay}ms...`);
        setTimeout(connect, delay);
      } else {
        console.log("[vaisx:hmr] gave up reconnecting");
      }
    });

    ws.addEventListener("error", () => {
      // error event is followed by close event, retry handled there
    });
  }

  connect();
}
