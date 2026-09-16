const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const state = require('./state.js');
const { MpvController } = require('./mpv-controller.js');
const { cleanupApp } = require('./cleanup.js');
const {
  canonicalExistingPath,
  getHwnd,
  pathKey,
  resolveBinary,
  spawnTracked,
} = require('./utils.js');

const isDev = !app.isPackaged;
const QUIT_PROMPT_TIMEOUT_MS = 10_000;

function isAllowedRendererUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (isDev) return url.origin === 'http://localhost:3011' && url.pathname === '/';
  if (url.protocol !== 'file:') return false;
  try {
    const expected = canonicalExistingPath(path.join(__dirname, '..', 'dist', 'index.html'));
    const actual = canonicalExistingPath(fileURLToPath(url));
    return pathKey(actual) === pathKey(expected);
  } catch {
    return false;
  }
}

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

function applyVideoVisibility() {
  if (!state.videoWindow || state.videoWindow.isDestroyed()) return;
  const shouldShow = state.desiredVideoVisible &&
    !state.overlayActive &&
    !!state.mainWindow &&
    !state.mainWindow.isDestroyed() &&
    !state.mainWindow.isMinimized();
  state.videoWindow.setOpacity(shouldShow ? 1 : 0);
  if (shouldShow && !state.videoWindow.isVisible()) state.videoWindow.showInactive();
}

function setVideoVisible(visible) {
  state.desiredVideoVisible = !!visible;
  applyVideoVisibility();
}

function syncVideoBounds() {
  if (!state.videoWindow || state.videoWindow.isDestroyed()) return;
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  if (!state.lastVideoBounds) return;
  const mc = state.mainWindow.getContentBounds();
  const b = state.lastVideoBounds;
  state.videoWindow.setBounds({
    x: Math.round(mc.x + b.x),
    y: Math.round(mc.y + b.y),
    width: Math.max(1, Math.round(b.width)),
    height: Math.max(1, Math.round(b.height)),
  });
  applyVideoVisibility();
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

// Route a file-open request to the renderer (so recent-files / playlist logic
// stays in one place). Queued until the renderer signals app:rendererReady —
// did-finish-load fires before React effects register their subscriptions, so
// a plain send() could vanish into the void.
function openFileInRenderer(p) {
  if (state.rendererReady && state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('app:open-file', p);
  } else if (!state.pendingOpenPaths.includes(p)) {
    state.pendingOpenPaths.push(p);
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
  if (state.isQuitting) return;
  try {
    await ensureMpv(emitStatus).warmup();
  } catch {
    /* ignore — first open() will start mpv the normal way */
  }
  if (state.isQuitting) return;
  // Touch ffprobe/ffmpeg so their ~200MB binaries are in the OS file cache
  // before the first probe/thumbnail — avoids a cold-start stall on open.
  for (const bin of ['ffprobe.exe', 'ffmpeg.exe']) {
    if (state.isQuitting) return;
    const p = resolveBinary(bin);
    if (!p) continue;
    try {
      const proc = spawnTracked(
        p,
        ['-version'],
        { windowsHide: true, stdio: 'ignore' },
        5_000,
      );
      proc.on('error', () => {});
    } catch {
      /* best-effort */
    }
  }
}

async function createMainWindow() {
  state.exitConfirmed = false;
  state.rendererReady = false;
  state.overlayActive = false;
  state.desiredVideoVisible = false;
  state.lastVideoBounds = null;
  if (state.quitPromptTimer) {
    clearTimeout(state.quitPromptTimer);
    state.quitPromptTimer = null;
  }

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

  state.mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  state.mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl)) event.preventDefault();
  });
  state.mainWindow.webContents.on('did-start-loading', () => {
    state.rendererReady = false;
    state.navigationGeneration += 1;
    state.approvedOutputPaths.clear();
    state.approvedOutputDirs.clear();
    state.generatedPaths.clear();
  });

  // Attach OS shutdown hooks before navigation starts so a shutdown during the
  // initial renderer load cannot be blocked by the later close prompt.
  state.mainWindow.on('query-session-end', () => {
    state.isQuitting = true;
    state.exitConfirmed = true;
    if (state.quitPromptTimer) {
      clearTimeout(state.quitPromptTimer);
      state.quitPromptTimer = null;
    }
    void cleanupApp();
  });
  state.mainWindow.on('session-end', () => {
    state.isQuitting = true;
    state.exitConfirmed = true;
    void cleanupApp();
  });

  state.mainWindow.on('move', syncVideoBounds);
  state.mainWindow.on('resize', syncVideoBounds);
  state.mainWindow.on('minimize', () => applyVideoVisibility());
  state.mainWindow.on('restore', syncVideoBounds);
  state.mainWindow.on('focus', () => {
    if (state.overlayActive) return;
    syncVideoBounds();
  });
  state.mainWindow.on('enter-full-screen', () => {
    state.mainWindow?.webContents.send('window:fullscreen', true);
    syncVideoBounds();
    setTimeout(syncVideoBounds, 60);
  });
  state.mainWindow.on('leave-full-screen', () => {
    state.mainWindow?.webContents.send('window:fullscreen', false);
    syncVideoBounds();
    setTimeout(syncVideoBounds, 60);
  });

  if (isDev) {
    await state.mainWindow.loadURL('http://localhost:3011');
    state.mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await state.mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  state.mainWindow.on('close', (event) => {
    if (state.exitConfirmed || state.isQuitting) return;
    event.preventDefault();
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('app:exit-ad');
    }
    if (state.quitPromptTimer) clearTimeout(state.quitPromptTimer);
    state.quitPromptTimer = setTimeout(() => {
      state.quitPromptTimer = null;
      state.exitConfirmed = true;
      if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.close();
    }, QUIT_PROMPT_TIMEOUT_MS);
    state.quitPromptTimer.unref?.();
  });

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;
    state.rendererReady = false;
    if (state.quitPromptTimer) {
      clearTimeout(state.quitPromptTimer);
      state.quitPromptTimer = null;
    }
    if (state.previewWindow && !state.previewWindow.isDestroyed()) {
      state.previewWindow.destroy();
      state.previewWindow = null;
    }
    if (state.videoWindow && !state.videoWindow.isDestroyed()) {
      state.videoWindow.destroy();
      state.videoWindow = null;
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
  openFileInRenderer,
};
