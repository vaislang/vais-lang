export type BridgeMessage = {
  source: string;
  type: string;
  payload?: unknown;
};

export type MessageHandler = (message: BridgeMessage) => void;

type WindowLike = {
  __VAISX_DEVTOOLS__?: unknown;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  postMessage: (message: unknown, targetOrigin: string) => void;
};

function getWindow(): WindowLike | undefined {
  if (typeof globalThis !== "undefined" && "addEventListener" in globalThis) {
    return globalThis as unknown as WindowLike;
  }
  return undefined;
}

// Detect whether the VaisX runtime hook exists on the page
export function detectVaisXRuntime(): boolean {
  const win = getWindow();
  return win !== undefined && "__VAISX_DEVTOOLS__" in win;
}

// ContentBridge: page <-> extension message bridge
export class ContentBridge {
  private handlers: MessageHandler[] = [];
  private connected = false;

  connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;

    const win = getWindow();
    if (win) {
      win.addEventListener("message", (event: unknown) => {
        const evt = event as { source?: unknown; data?: unknown };
        if (
          evt.data &&
          typeof evt.data === "object" &&
          (evt.data as Record<string, unknown>)["source"] === "vaisx-page"
        ) {
          const msg = evt.data as BridgeMessage;
          for (const handler of this.handlers) {
            handler(msg);
          }
        }
      });
    }
  }

  send(message: BridgeMessage): void {
    const win = getWindow();
    if (win) {
      win.postMessage({ ...message, source: "vaisx-extension" }, "*");
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }
}

// initBridge: sets up the page <-> extension message bridge
export function initBridge(): void {
  const bridge = new ContentBridge();
  bridge.connect();
}
