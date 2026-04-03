export type PopupState = {
  detected: boolean;
  version?: string;
};

export function getPopupState(): PopupState {
  // In a real extension context, this would query the content script
  // For now, return a default state
  return { detected: false };
}

export function renderPopup(state: PopupState): string {
  if (state.detected) {
    const versionInfo = state.version
      ? `<p class="version">Version: ${state.version}</p>`
      : "";
    return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>VaisX DevTools</title></head>
  <body>
    <div class="popup detected">
      <h1>VaisX DevTools</h1>
      <p class="status detected">VaisX detected on this page</p>
      ${versionInfo}
    </div>
  </body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>VaisX DevTools</title></head>
  <body>
    <div class="popup">
      <h1>VaisX DevTools</h1>
      <p class="status not-detected">VaisX not detected on this page</p>
    </div>
  </body>
</html>`;
}
