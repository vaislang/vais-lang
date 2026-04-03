export { generateChromeManifest } from "./manifest.js";
export type { ChromeManifest } from "./manifest.js";

export { generateFirefoxManifest } from "./manifest-firefox.js";
export type { FirefoxManifest } from "./manifest-firefox.js";

export {
  detectVaisXRuntime,
  initBridge,
  ContentBridge,
} from "./content-script.js";
export type { BridgeMessage, MessageHandler } from "./content-script.js";

export { createPanel, PanelController } from "./devtools-panel.js";

export { getPopupState, renderPopup } from "./popup.js";
export type { PopupState } from "./popup.js";
