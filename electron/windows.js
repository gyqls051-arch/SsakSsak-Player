const { BrowserWindow } = require('electron');
const path = require('node:path');
const state = require('./state.js');
const { MpvController } = require('./mpv-controller.js');
const { resolveBinary, getHwnd } = require('./utils.js');

const isDev = process.env.NODE_ENV === 'development';

function getVideoWindow() {
  if (state.videoWindow && !state.videoWindow.isDestroyed()) return state.videoWindow;
  if (!state.mainWindow) throw new Error('Main window not ready');

  state.videoWindow = new BrowserWindow({
    parent: state.mainWindow,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: false,
      devTools: false,
    },
  });
  // Intentionally no loadURL — let mpv have the HWND uncontested. Adding any
  // content (even a data: URL with an empty body) causes Chromium's compositor
  // to actively paint to the HWND and conflict with mpv's --wid drawing.
  // Also intentionally no preload — sandboxed preload on this child window
  // confused Chromium's HWND ownership and made the video not appear.

  state.videoWindow.on('closed', () => {
    state.videoWindow = null;
  });

  return state.videoWindow;
}

function setVideoVisible(visible) {
  if (!state.videoWindow || state.videoWindow.isDestroyed()) return;
  // setOpacity preserves mpv's D3D context across hide cycles — avoids the
  // black-frame flash when the main window regains focus.
  state.videoWindow.setOpacity(visible ? 1 : 0);
  if (visible && !state.videoWindow.isVisible()) state.videoWindow.showInactive();
}

function syncVideoBounds() {
  if (!state.videoWindow || state.videoWindow.isDestroyed()) return;
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  if (!state.lastVideoBounds) return;
  if (state.overlayActive) {
    setVideoVisible(false);
    return;
  }
  if (state.mainWindow.isMinimized()) {
    setVideoVisible(false);
    return;
  }
  const mc = state.mainWindow.getContentBounds();
  const b = state.lastVideoBounds;
  state.videoWindow.setBounds({
    x: Math.round(mc.x + b.x),
    y: Math.round(mc.y + b.y),
    width: Math.max(1, Math.round(b.width)),
    height: Math.max(1, Math.round(b.height)),
  });
  setVideoVisible(true);
}

function ensureMpv(onStatus) {
  if (state.mpv) return state.mpv;
  const mpvPath = resolveBinary('mpv.exe');
  if (!mpvPath) throw new Error('mpv.exe not found in resources/bin');
  const vw = getVideoWindow();
  const wid = getHwnd(vw);

  state.mpv = new MpvController({
    mpvBinary: mpvPath,
    wid,
    onStatus,
  });
  return state.mpv;
}

async function createMainWindow() {
  state.mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0a0a0a',
    title: 'OFFCUT Player',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload only uses contextBridge / ipcRenderer / webUtils — all of
      // which are available inside the sandbox. This gives us the extra OS
      // isolation Chromium provides without losing any functionality.
      sandbox: true,
      devTools: isDev,
    },
  });

  state.mainWindow.on('move', syncVideoBounds);
  state.mainWindow.on('resize', syncVideoBounds);
  state.mainWindow.on('minimize', () => state.videoWindow?.hide());
  state.mainWindow.on('restore', () => {
    if (state.videoWindow && !state.videoWindow.isDestroyed()) {
      state.videoWindow.showInactive();
    }
    syncVideoBounds();
  });
  state.mainWindow.on('focus', () => {
    if (state.overlayActive) return;
    syncVideoBounds();
  });
  state.mainWindow.on('enter-full-screen', () => {
    state.mainWindow?.webContents.send('window:fullscreen', true);
    setTimeout(syncVideoBounds, 120);
  });
  state.mainWindow.on('leave-full-screen', () => {
    state.mainWindow?.webContents.send('window:fullscreen', false);
    setTimeout(syncVideoBounds, 120);
  });

  if (isDev) {
    await state.mainWindow.loadURL('http://localhost:3011');
    state.mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await state.mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;
    if (state.videoWindow && !state.videoWindow.isDestroyed()) {
      state.videoWindow.destroy();
      state.videoWindow = null;
    }
    if (state.mpv) {
      state.mpv.dispose();
      state.mpv = null;
    }
  });
}

module.exports = {
  createMainWindow,
  getVideoWindow,
  ensureMpv,
  syncVideoBounds,
  setVideoVisible,
};
