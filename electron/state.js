// Mutable singleton state shared across the main-process modules.
// Each consumer requires this once and reads/writes the same object.

module.exports = {
  /** @type {import('electron').BrowserWindow | null} */
  mainWindow: null,
  /** @type {import('electron').BrowserWindow | null} */
  videoWindow: null,
  /** @type {import('./mpv-controller.js').MpvController | null} */
  mpv: null,
  /** @type {string | null} */
  captureDir: null,
  /** @type {import('./transcode.js').TranscodeJob | null} */
  currentJob: null,
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  lastVideoBounds: null,
  /** Whether a UI overlay (modal etc.) is currently open in the renderer. */
  overlayActive: false,
};
