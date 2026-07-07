const { app, BrowserWindow, protocol } = require('electron');
const state = require('./state.js');
const { createMainWindow, warmupMpv, openFileInRenderer } = require('./windows.js');
const { registerIpc, registerProtocols } = require('./ipc.js');
const { extractFileArg } = require('./utils.js');

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
        bypassCSP: true,
        stream: true,
      },
    },
  ]);

  registerIpc();

  // File passed on first launch (file association / "open with").
  state.pendingOpenPath = extractFileArg(process.argv);

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
    // process cold-start lag. Deferred a tick so it doesn't compete with the
    // initial window paint.
    setTimeout(warmupMpv, 300);
  });

  app.on('window-all-closed', () => {
    if (state.mpv) {
      state.mpv.dispose();
      state.mpv = null;
    }
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}
