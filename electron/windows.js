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

  // The video window is a pure mpv render surface with no interactive content.
  // Make it click-through so mouse events (click-to-pause, double-click
  // fullscreen, right-click menu, and cursor-move that drives the auto-hide UI)
  // fall through to the React UI in the main window beneath it.
  state.videoWindow.setIgnoreMouseEvents(true);

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

// Transparent, click-through, always-on-top overlay used to render the seekbar
// preview thumbnail ABOVE the mpv video window. A plain React element can't do
// this — the mpv window is a separate top-level window that always paints over
// the main window's web content, so any in-page overlay is clipped behind it.
function getPreviewWindow() {
  if (state.previewWindow && !state.previewWindow.isDestroyed()) return state.previewWindow;
  if (!state.mainWindow) throw new Error('Main window not ready');

  const win = new BrowserWindow({
    parent: state.mainWindow,
    width: 200,
    height: 150,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
      backgroundThrottling: false,
      devTools: false,
    },
  });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true); // stack above the (non-always-on-top) mpv window

  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
#wrap{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;box-sizing:border-box}
#t{width:176px;height:99px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#000;box-shadow:0 6px 22px rgba(0,0,0,.75)}
#l{margin-top:4px;padding:1px 7px;border-radius:4px;background:rgba(0,0,0,.85);color:#fff;font:600 11px ui-monospace,Consolas,monospace}
</style><div id="wrap"><img id="t" alt=""><div id="l"></div></div>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.on('closed', () => {
    state.previewWindow = null;
  });
  state.previewWindow = win;
  return win;
}

function showSeekPreview(p) {
  if (!p || !state.mainWindow || state.mainWindow.isDestroyed()) return;
  if (state.overlayActive) return;
  const win = getPreviewWindow();
  const W = 200;
  const H = 150;
  const mc = state.mainWindow.getContentBounds();
  let x = Math.round(mc.x + (Number(p.centerX) || 0) - W / 2);
  const y = Math.round(mc.y + (Number(p.bottomY) || 0) - H);
  x = Math.max(mc.x, Math.min(x, mc.x + mc.width - W));
  win.setBounds({ x, y, width: W, height: H });

  const hasImg = !!p.dataUrl;
  const js =
    '(function(){var t=document.getElementById("t"),l=document.getElementById("l");' +
    'if(t){t.style.display=' +
    (hasImg ? '"block"' : '"none"') +
    ';' +
    (hasImg ? 't.src=' + JSON.stringify(p.dataUrl) + ';' : '') +
    '}if(l)l.textContent=' +
    JSON.stringify(p.label || '') +
    ';})()';
  win.webContents.executeJavaScript(js).catch(() => {});
  if (!win.isVisible()) win.showInactive();
}

function hideSeekPreview() {
  if (state.previewWindow && !state.previewWindow.isDestroyed() && state.previewWindow.isVisible()) {
    state.previewWindow.hide();
  }
}

// Forward mpv status to the renderer. Shared so a pre-warmed controller and the
// IPC handlers bind the same callback (ensureMpv only binds onStatus on the
// first call that creates the controller).
function emitStatus(status) {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('mpv:status', status);
  }
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
    onStatus: onStatus || emitStatus,
  });
  return state.mpv;
}

// Pre-spawn mpv (idle) right after launch so the user's first file opens
// instantly instead of waiting for the mpv process cold start. Best-effort:
// any failure just falls back to the old lazy-start path on first open.
async function warmupMpv() {
  try {
    await ensureMpv(emitStatus).warmup();
  } catch {
    /* ignore — first open() will start mpv the normal way */
  }
}

async function createMainWindow() {
  state.mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0a0a0a',
    title: '싹싹김치 플레이어',
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
    if (state.previewWindow && !state.previewWindow.isDestroyed()) {
      state.previewWindow.destroy();
      state.previewWindow = null;
    }
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
  warmupMpv,
  syncVideoBounds,
  setVideoVisible,
  showSeekPreview,
  hideSeekPreview,
};
