const { app, BrowserWindow, protocol } = require('electron');
const state = require('./state.js');
const { createMainWindow, warmupMpv, openFileInRenderer } = require('./windows.js');
const { registerIpc, registerProtocols } = require('./ipc.js');
const { cleanupApp } = require('./cleanup.js');
const { extractFileArg, trackOperation } = require('./utils.js');

// Single instance: a second launch (e.g. double-clicking another video in
// Explorer) forwards its argv to the running instance and exits.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Disable Chromium hardware acceleration so its GPU compositor doesn't fight
  // with mpv's GPU output (which causes either a black video frame or a one-
  // frame playback latency when embedded). UI runs in software, but React +
  // Tailwind have no problem at that scale.
  app.disableHardwareAcceleration();

  // Custom protocol used to serve PNG captures back to the renderer. The path
  // validation lives in the protocol handler (see ipc.js / utils.js).
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'offcut-cap',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);

  registerIpc();

  // File passed on first launch (file association / "open with").
  const initialOpenPath = extractFileArg(process.argv);
  if (initialOpenPath) state.pendingOpenPaths.push(initialOpenPath);

  app.on('second-instance', (_evt, argv, workingDir) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    }
    const file = extractFileArg(argv, workingDir);
    if (file) openFileInRenderer(file);
  });

  app.whenReady().then(async () => {
    registerProtocols();
    await createMainWindow();
    // Pre-spawn mpv in the background so the first file opens without the
    // process cold-start lag. The owned timer is cancelled by cleanup.
    state.warmupTimer = setTimeout(() => {
      state.warmupTimer = null;
      if (state.isQuitting) return;
      void trackOperation(warmupMpv());
    }, 300);
  });

  app.on('before-quit', (event) => {
    state.isQuitting = true;
    state.exitConfirmed = true;
    if (state.cleanupComplete) return;
    event.preventDefault();
    void cleanupApp().finally(() => app.quit());
  });

  app.on('render-process-gone', (_event, webContents) => {
    if (!state.mainWindow || webContents !== state.mainWindow.webContents) return;
    state.isQuitting = true;
    state.exitConfirmed = true;
    if (!state.mainWindow.isDestroyed()) state.mainWindow.destroy();
    void cleanupApp().finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    void cleanupApp().finally(() => {
      if (process.platform !== 'darwin') {
        app.quit();
        return;
      }
      // macOS keeps the menu-bar app alive after the last window closes.
      state.cleanupPromise = null;
      state.cleanupComplete = false;
      state.isQuitting = false;
      state.exitConfirmed = false;
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !state.isQuitting) {
      void createMainWindow();
    }
  });
}
