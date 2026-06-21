const { app, BrowserWindow, protocol } = require('electron');
const state = require('./state.js');
const { createMainWindow, warmupMpv } = require('./windows.js');
const { registerIpc, registerProtocols } = require('./ipc.js');

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
