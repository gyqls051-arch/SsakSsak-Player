const { app, ipcMain, dialog, shell, protocol, Menu, clipboard, nativeImage } = require('electron');
const { fileURLToPath } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const state = require('./state.js');
const { runFfprobe } = require('./ffprobe.js');
const { TranscodeJob, listPresets } = require('./transcode.js');
const { buildXmpMarkers } = require('./xmp.js');
const {
  resolveBinary,
  getCaptureDir,
  formatTimeForFilename,
  sanitizeBasename,
  isPathInsideCaptureDir,
  validateMediaInput,
  listVideoFiles,
  uniquePath,
  FF_PROTOCOL_WHITELIST,
  thumbnailWithFfmpeg,
  waveformWithFfmpeg,
  canonicalExistingPath,
  canonicalOutputPath,
  commitTempFile,
  createTempPath,
  isGeneratedPath,
  pathKey,
  recordGeneratedPath,
  spawnTracked,
  trackOperation,
  writeFileAtomic,
} = require('./utils.js');

// Confine a transcode/clip output path to either the capture dir or the
// directory the user explicitly picked via the save dialog. We can't observe
// the dialog here, so we accept any absolute path the user could have chosen,
// but reject traversal and require an absolute, normalized path under an
// existing parent directory. Output extension is constrained to media types.
const ALLOWED_OUTPUT_EXTS = new Set([
  '.mp4', '.mkv', '.mov', '.webm', '.m4v', '.mp3', '.m4a', '.aac', '.wav', '.png',
  '.jpg', '.jpeg', '.gif', '.webp',
]);
const MAX_CAPTURE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_FFMPEG_STDERR_BYTES = 256 * 1024;
const CLIP_TIMEOUT_MS = 60 * 60 * 1_000;

function isPathUnderApprovedDir(pathKeyValue) {
  for (const dirKey of state.approvedOutputDirs) {
    const relative = path.relative(dirKey, pathKeyValue);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      return true;
    }
  }
  return false;
}

function validateOutputPath(output, allowedExts = ALLOWED_OUTPUT_EXTS) {
  const resolved = canonicalOutputPath(output);
  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExts.has(ext)) {
    throw new Error(`허용되지 않은 출력 형식입니다: ${ext || '(확장자 없음)'}`);
  }
  const key = pathKey(resolved);
  if (!state.approvedOutputPaths.has(key) && !isPathUnderApprovedDir(key)) {
    throw new Error('사용자가 승인하지 않은 출력 경로입니다');
  }
  return resolved;
}

function assertTrustedIpcEvent(event) {
  const win = state.mainWindow;
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('신뢰할 수 없는 IPC sender입니다');
  }
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('main frame이 아닌 IPC 호출은 허용되지 않습니다');
  }

  let url;
  try {
    url = new URL(event.senderFrame.url);
  } catch {
    throw new Error('잘못된 IPC origin입니다');
  }
  if (!app.isPackaged) {
    if (url.origin !== 'http://localhost:3011') throw new Error('허용되지 않은 IPC origin입니다');
    return;
  }
  if (url.protocol !== 'file:') throw new Error('production에서는 file origin만 허용됩니다');
  const expected = canonicalExistingPath(path.join(__dirname, '..', 'dist', 'index.html'));
  const actual = canonicalExistingPath(fileURLToPath(url));
  if (pathKey(actual) !== pathKey(expected)) throw new Error('허용되지 않은 production 문서입니다');
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcEvent(event);
    if (state.isQuitting) throw new Error('앱 종료 중에는 새 작업을 시작할 수 없습니다');
    return trackOperation(Promise.resolve().then(() => handler(event, ...args)));
  });
}

function createCoalescingRunner(label) {
  let active = false;
  let pending = null;
  const start = (entry) => {
    if (state.isQuitting) {
      entry.reject(new Error('앱 종료 중에는 새 미리보기 작업을 시작할 수 없습니다'));
      return;
    }
    active = true;
    Promise.resolve()
      .then(entry.task)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        active = false;
        if (pending) {
          const next = pending;
          pending = null;
          start(next);
        }
      });
  };
  return (task) => new Promise((resolve, reject) => {
    const entry = { task, resolve, reject };
    if (!active) {
      start(entry);
      return;
    }
    if (pending) pending.reject(new Error(`${label} 요청이 더 최신 요청으로 대체되었습니다`));
    pending = entry;
  });
}

async function runFfmpegAtomic(ffmpegBin, argsForOutput, finalPath, label) {
  const tempPath = createTempPath(finalPath);
  try {
    await new Promise((resolve, reject) => {
      const proc = spawnTracked(
        ffmpegBin,
        argsForOutput(tempPath),
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
        CLIP_TIMEOUT_MS,
      );
      let stderr = '';
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      proc.stderr.on('data', (chunk) => {
        if (stderr.length < MAX_FFMPEG_STDERR_BYTES) {
          stderr += chunk.toString('utf8').slice(0, MAX_FFMPEG_STDERR_BYTES - stderr.length);
        }
      });
      proc.on('error', rejectOnce);
      proc.on('close', (code) => {
        if (settled) return;
        if (proc.ssakssakTimedOut) {
          rejectOnce(new Error(`${label} 실행 시간이 초과되었습니다`));
        } else if (code === 0) {
          settled = true;
          resolve();
        } else {
          rejectOnce(new Error(`${label} exited ${code}: ${stderr.trim().slice(-500)}`));
        }
      });
    });
    await commitTempFile(tempPath, finalPath);
    return recordGeneratedPath(finalPath);
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw error;
  }
}
const {
  ensureMpv,
  getVideoWindow,
  syncVideoBounds,
  setVideoVisible,
  showSeekPreview,
  hideSeekPreview,
} = require('./windows.js');

function registerProtocols() {
  protocol.handle('offcut-cap', async (request) => {
    try {
      const url = new URL(request.url);
      const decoded = decodeURIComponent(url.pathname).replace(/^\//, '');
      const canonical = canonicalExistingPath(decoded);
      if (!isPathInsideCaptureDir(canonical)) {
        return new Response(null, { status: 403 });
      }
      const data = await fs.promises.readFile(canonical);
      const ext = path.extname(canonical).toLowerCase();
      const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return new Response(data, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function registerIpc() {
  // ---------- Dialogs ----------
  secureHandle('dialog:openVideo', async () => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '영상 파일 선택',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg', '3gp', 'ogv'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  secureHandle('dialog:openSubtitle', async () => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '자막 파일 선택',
      properties: ['openFile'],
      filters: [
        { name: 'Subtitle', extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub', 'sup'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  secureHandle('dialog:saveFile', async (_evt, opts) => {
    if (!state.mainWindow) return null;
    const result = await dialog.showSaveDialog(state.mainWindow, opts || {});
    if (result.canceled || !result.filePath) return null;
    const approved = canonicalOutputPath(result.filePath);
    state.approvedOutputPaths.add(pathKey(approved));
    return approved;
  });

  // Open a folder and return its playable video files (for the playlist view).
  secureHandle('folder:open', async () => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '폴더 열기',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    return { folder, files: listVideoFiles(folder) };
  });

  secureHandle('dialog:chooseDirectory', async (_evt, defaultPath) => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '폴더 선택',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const approved = canonicalExistingPath(result.filePaths[0]);
    state.approvedOutputDirs.add(pathKey(approved));
    return approved;
  });

  // ---------- mpv ----------
  const onStatus = (status) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('mpv:status', status);
    }
  };

  secureHandle('mpv:open', async (_evt, filePath) => {
    const safeInput = validateMediaInput(filePath);
    return ensureMpv(onStatus).open(safeInput);
  });
  secureHandle('mpv:command', async (_evt, command, ...args) => ensureMpv(onStatus).command(command, ...args));
  secureHandle('mpv:getTracks', async () => ensureMpv(onStatus).getTracks());
  secureHandle('mpv:setProperty', async (_evt, name, value) => ensureMpv(onStatus).setProperty(name, value));
  secureHandle('mpv:setABLoop', async (_evt, inPoint, outPoint) => ensureMpv(onStatus).setABLoop(inPoint, outPoint));
  secureHandle('mpv:getProperty', async (_evt, name) => ensureMpv(onStatus).getProperty(name));

  // ---------- Window ----------
  // Right-click context menu over the video. Built as a native OS menu so it
  // renders ABOVE the mpv child window (a React menu would be hidden behind it).
  // Each item just forwards an action id to the renderer, which reuses its
  // existing handlers — keeping all app logic in one place.
  secureHandle('window:showVideoMenu', async (_evt, ctx) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    const c = ctx || {};
    const send = (action) => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('menu:action', action);
      }
    };
    const mpvCtl = ensureMpv(onStatus);
    const tracks = await mpvCtl.getTracks().catch(() => []);
    const chapterList = await mpvCtl
      .getProperty('chapter-list')
      .then((l) => (Array.isArray(l) ? l : []))
      .catch(() => []);
    const audio = tracks.filter((t) => t.type === 'audio');
    const subs = tracks.filter((t) => t.type === 'sub');
    const trackLabel = (t) => `${t.lang ? `[${t.lang}] ` : ''}${t.title || t.codec || '트랙 ' + t.id}`;

    const trackItems = [];
    if (audio.length > 1) {
      trackItems.push({
        label: '오디오 트랙',
        submenu: audio.map((t) => ({
          label: trackLabel(t),
          type: 'checkbox',
          checked: t.selected,
          click: () => send('audio:' + t.id),
        })),
      });
    }
    trackItems.push({
      label: '자막',
      submenu: [
        { label: '끄기', type: 'checkbox', checked: !subs.some((s) => s.selected), click: () => send('sub:no') },
        ...subs.map((t) => ({
          label: trackLabel(t),
          type: 'checkbox',
          checked: t.selected,
          click: () => send('sub:' + t.id),
        })),
        { type: 'separator' },
        { label: '자막 파일 불러오기…', click: () => send('loadSub') },
      ],
    });
    trackItems.push({
      label: '동기화',
      submenu: [
        { label: '자막 싱크 −0.1s (Z)', click: () => send('subdelay:-0.1') },
        { label: '자막 싱크 +0.1s (Shift+Z)', click: () => send('subdelay:+0.1') },
        { label: '자막 싱크 리셋 (Alt+Z)', click: () => send('subdelay:0') },
        { type: 'separator' },
        { label: '오디오 싱크 −0.1s (D)', click: () => send('audiodelay:-0.1') },
        { label: '오디오 싱크 +0.1s (Shift+D)', click: () => send('audiodelay:+0.1') },
        { label: '오디오 싱크 리셋 (Alt+D)', click: () => send('audiodelay:0') },
      ],
    });
    trackItems.push({
      label: '자막 크기',
      submenu: [0.75, 1, 1.25, 1.5].map((v) => ({
        label: `${Math.round(v * 100)}%`,
        click: () => send('subscale:' + v),
      })),
    });
    trackItems.push({
      label: '화면',
      submenu: [
        { label: '90° 회전', click: () => send('rotate') },
        { type: 'separator' },
        { label: '비율: 자동', click: () => send('aspect:-1') },
        { label: '비율: 16:9', click: () => send('aspect:16:9') },
        { label: '비율: 4:3', click: () => send('aspect:4:3') },
        { type: 'separator' },
        { label: '확대 +', click: () => send('zoom:+') },
        { label: '축소 −', click: () => send('zoom:-') },
        { label: '줌 리셋', click: () => send('zoom:0') },
      ],
    });
    if (chapterList.length > 0) {
      const fmt = (sec) => {
        const s = Math.max(0, Number(sec) || 0);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        const p = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
      };
      trackItems.push({
        label: '챕터',
        submenu: chapterList.map((ch, i) => ({
          label: `${fmt(ch.time)}  ${ch.title || `챕터 ${i + 1}`}`,
          click: () => send('seekto:' + (Number(ch.time) || 0)),
        })),
      });
    }

    const template = [
      { label: c.paused ? '▶  재생' : '❚❚  일시정지', click: () => send('togglePause') },
      { label: '◀  이전 프레임', click: () => send('frameBackStep') },
      { label: '다음 프레임  ▶', click: () => send('frameStep') },
      { type: 'separator' },
      ...trackItems,
      { type: 'separator' },
      { label: '현재 프레임 캡처 (S)', click: () => send('capture') },
      { label: '현재 프레임 클립보드 복사', click: () => send('copyFrame') },
      { label: '현재 위치에 메모 (N)', click: () => send('addNote') },
      { label: 'In 지점 설정 (I)', click: () => send('setIn') },
      { label: 'Out 지점 설정 (O)', click: () => send('setOut') },
      { label: '구간 무손실 잘라내기', enabled: !!c.canExtract, click: () => send('extractClip') },
      { label: '구간 내보내기 (재인코딩·정확)', enabled: !!c.canExtract, click: () => send('exportClip') },
      { label: '구간 GIF/WebP로 내보내기', enabled: !!c.canExtract, click: () => send('exportGif') },
      { type: 'separator' },
      { label: '전체화면 (Enter)', click: () => send('fullscreen') },
      { label: '파일 열기… (Ctrl+O)', click: () => send('open') },
    ];
    Menu.buildFromTemplate(template).popup({ window: state.mainWindow });
  });

  secureHandle('window:toggleFullscreen', () => {
    if (!state.mainWindow) return false;
    const next = !state.mainWindow.isFullScreen();
    state.mainWindow.setFullScreen(next);
    return next;
  });
  secureHandle('window:isFullscreen', () => !!state.mainWindow?.isFullScreen());

  // 항상 위 (📌). mpv 비디오 창·프리뷰 창은 mainWindow 소유(owned)라 따라온다.
  secureHandle('window:setAlwaysOnTop', (_evt, flag) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return false;
    state.mainWindow.setAlwaysOnTop(!!flag);
    return state.mainWindow.isAlwaysOnTop();
  });

  // ---------- Video child window ----------
  secureHandle('video:setBounds', (_evt, bounds) => {
    if (!bounds || typeof bounds.width !== 'number') return;
    if (bounds.width < 10 || bounds.height < 10) return;
    state.lastVideoBounds = bounds;
    getVideoWindow();
    setVideoVisible(true);
    syncVideoBounds();
  });
  secureHandle('video:hide', () => setVideoVisible(false));
  secureHandle('video:setOverlayActive', (_evt, active) => {
    state.overlayActive = !!active;
    if (state.overlayActive) hideSeekPreview();
    syncVideoBounds();
  });

  // Seekbar hover preview, rendered in a transparent overlay window so it sits
  // above the mpv video window instead of being clipped behind it.
  secureHandle('preview:overlayShow', (_evt, params) => showSeekPreview(params));
  secureHandle('preview:overlayHide', () => hideSeekPreview());

  // ---------- Capture ----------
  // Read the current source path / time / frame / name from mpv. Shared by the
  // disk capture and the clipboard copy.
  async function readCurrentFrame() {
    const m = ensureMpv(onStatus);
    let sourceName = 'capture';
    let inputPath = null;
    let timePos = 0;
    let frame = null;
    try {
      const fn = await m.getProperty('filename/no-ext');
      if (fn && typeof fn === 'string') sourceName = sanitizeBasename(fn);
    } catch { /* keep default */ }
    try {
      const p = await m.getProperty('path');
      if (p && typeof p === 'string') inputPath = p;
    } catch { /* caller will throw below */ }
    try {
      const t = await m.getProperty('time-pos');
      timePos = Number(t) || 0;
    } catch { /* timePos stays 0 */ }
    try {
      const f = await m.getProperty('estimated-frame-number');
      const n = Number(f);
      if (Number.isFinite(n)) frame = n;
    } catch { /* frame stays null */ }
    if (!inputPath) throw new Error('현재 재생 중인 영상 경로를 찾을 수 없습니다');
    return { sourceName, inputPath, timePos, frame };
  }

  // Capture via mpv's native screenshot-to-file so the saved image is exactly
  // the frame mpv is displaying (an ffmpeg re-decode can land ±1 frame off).
  secureHandle('capture:now', async (_evt, opts) => {
    const ext = opts && opts.format === 'jpg' ? 'jpg' : 'png';
    const m = ensureMpv(onStatus);
    // Metadata first (the filename embeds the timecode), then the shot itself.
    const { sourceName, inputPath, timePos, frame } = await readCurrentFrame();
    const preferredPath = path.join(
      getCaptureDir(),
      `${sourceName}_${formatTimeForFilename(timePos)}.${ext}`,
    );
    let outPath = uniquePath(preferredPath);
    const tempPath = createTempPath(outPath);
    try {
      await m.screenshotToFile(tempPath);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await commitTempFile(tempPath, outPath, { overwrite: false });
          break;
        } catch (error) {
          if (error?.code !== 'EEXIST' || attempt === 9) throw error;
          outPath = uniquePath(preferredPath);
        }
      }
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw error;
    }
    recordGeneratedPath(outPath);
    return { path: outPath, videoPath: inputPath, time: timePos, frame };
  });

  // Copy the current frame straight to the OS clipboard (no disk file kept).
  secureHandle('capture:copyCurrent', async () => {
    const m = ensureMpv(onStatus);
    await readCurrentFrame(); // throws if nothing is playing
    const tmp = path.join(os.tmpdir(), `offcut_clip_${Date.now()}.png`);
    try {
      await m.screenshotToFile(tmp);
      const img = nativeImage.createFromPath(tmp);
      if (img.isEmpty()) throw new Error('클립보드 이미지 생성 실패');
      clipboard.writeImage(img);
    } finally {
      fs.promises.unlink(tmp).catch(() => {});
    }
    return { ok: true };
  });

  // Copy an existing capture PNG/JPG to the clipboard.
  secureHandle('capture:copyFile', async (_evt, p) => {
    const canonical = canonicalExistingPath(p);
    if (!isPathInsideCaptureDir(canonical)) throw new Error('허용되지 않은 경로입니다');
    const img = nativeImage.createFromPath(canonical);
    if (img.isEmpty()) throw new Error('이미지를 읽을 수 없습니다');
    clipboard.writeImage(img);
    return { ok: true };
  });

  // Start a native OS drag of a capture file so it can be dropped into other
  // apps (Premiere, Photoshop, Explorer, chat windows, …).
  secureHandle('capture:startDrag', (evt, p) => {
    let canonical;
    try { canonical = canonicalExistingPath(p); } catch { return; }
    if (!isPathInsideCaptureDir(canonical)) return;
    let icon = nativeImage.createFromPath(canonical);
    if (icon.isEmpty()) {
      // startDrag requires a non-empty icon; fall back to a 1px transparent one.
      icon = nativeImage.createEmpty();
    } else {
      icon = icon.resize({ width: 128 });
    }
    evt.sender.startDrag({ file: canonical, icon });
  });

  // Write a base64 data URL (PNG) to a path the user picked — used by the
  // contact-sheet export.
  secureHandle('capture:saveImage', async (_evt, dataUrl, outPath) => {
    const safe = validateOutputPath(outPath, new Set(['.png', '.jpg', '.jpeg']));
    if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_CAPTURE_IMAGE_BYTES * 4 / 3) + 128) {
      throw new Error('이미지 데이터가 허용 크기를 초과했습니다');
    }
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/s.exec(dataUrl);
    if (!match) throw new Error('잘못된 이미지 데이터입니다');
    const data = Buffer.from(match[2], 'base64');
    if (data.length === 0 || data.length > MAX_CAPTURE_IMAGE_BYTES) {
      throw new Error('이미지 데이터가 허용 크기를 초과했습니다');
    }
    const isPng = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const ext = path.extname(safe).toLowerCase();
    if ((match[1] === 'png' && (!isPng || ext !== '.png')) ||
        (match[1] === 'jpeg' && (!isJpeg || !['.jpg', '.jpeg'].includes(ext)))) {
      throw new Error('이미지 형식과 출력 확장자가 일치하지 않습니다');
    }
    await writeFileAtomic(safe, data, undefined, { overwrite: true });
    recordGeneratedPath(safe);
    return { path: safe };
  });

  secureHandle('capture:getDir', () => getCaptureDir());
  secureHandle('capture:setDir', async (_evt, dir) => {
    if (!dir || typeof dir !== 'string') return null;
    const canonical = canonicalExistingPath(dir);
    if (!state.approvedOutputDirs.has(pathKey(canonical))) {
      throw new Error('폴더 선택 창에서 승인되지 않은 캡처 경로입니다');
    }
    state.captureDir = canonical;
    return state.captureDir;
  });
  secureHandle('capture:reveal', async (_evt, p) => {
    const canonical = canonicalExistingPath(p);
    if (!isPathInsideCaptureDir(canonical) && !isGeneratedPath(canonical)) {
      throw new Error('허용되지 않은 경로입니다');
    }
    shell.showItemInFolder(canonical);
    return null;
  });

  // ---------- ffprobe ----------
  secureHandle('ffprobe:info', async (_evt, filePath) => {
    const ffprobeBin = resolveBinary('ffprobe.exe');
    if (!ffprobeBin) throw new Error('ffprobe.exe not found in resources/bin');
    const safeInput = validateMediaInput(filePath);
    return runFfprobe(ffprobeBin, safeInput);
  });

  // ---------- Transcode ----------
  secureHandle('transcode:presets', () => listPresets());
  secureHandle('transcode:start', async (_evt, params) => {
    if (state.currentJob) throw new Error('이미 진행 중인 트랜스코딩이 있습니다');
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params.input || !params.output || !params.presetKey) throw new Error('필수 파라미터 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output);
    if (pathKey(safeInput) === pathKey(safeOutput)) throw new Error('입력 파일을 출력으로 덮어쓸 수 없습니다');

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    state.currentJob = new TranscodeJob({
      ffmpegBin,
      input: safeInput,
      output: safeOutput,
      presetKey: params.presetKey,
      duration: params.duration || 0,
      inputBitrate: params.inputBitrate || 0,
      onProgress: (p) => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('transcode:progress', { jobId, ...p });
        }
      },
    });

    try {
      const output = await state.currentJob.run();
      return { jobId, output };
    } finally {
      state.currentJob = null;
    }
  });
  secureHandle('transcode:cancel', () => {
    if (state.currentJob) state.currentJob.cancel();
    return true;
  });

  // ---------- Markers (Premiere XMP) ----------
  secureHandle('markers:exportXmp', async (_evt, params) => {
    if (!params || !params.videoPath || !Array.isArray(params.captures)) {
      throw new Error('영상 경로 또는 캡처 정보 누락');
    }
    if (params.captures.length === 0) throw new Error('내보낼 캡처가 없습니다');
    const videoPath = validateMediaInput(params.videoPath);
    const preferred = videoPath.replace(/\.[^.]+$/, '.xmp');
    const xmpPath = fs.existsSync(preferred)
      ? uniquePath(videoPath.replace(/\.[^.]+$/, '.ssakssak.xmp'))
      : preferred;
    const content = buildXmpMarkers(params.captures, params.fps || 30);
    await writeFileAtomic(xmpPath, content, { encoding: 'utf8' }, { overwrite: false });
    recordGeneratedPath(xmpPath);
    return xmpPath;
  });

  // ---------- Notes export (text formats) ----------
  secureHandle('notes:exportText', async (_evt, content, outPath) => {
    if (typeof content !== 'string') throw new Error('내보낼 내용이 없습니다');
    const resolved = validateOutputPath(outPath, new Set(['.txt', '.csv', '.srt', '.md']));
    await writeFileAtomic(resolved, content, { encoding: 'utf8' }, { overwrite: true });
    recordGeneratedPath(resolved);
    return { path: resolved };
  });

  // ---------- Lossless clip extract ----------
  secureHandle('clip:extract', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output);
    if (pathKey(safeInput) === pathKey(safeOutput)) throw new Error('입력 파일을 출력으로 덮어쓸 수 없습니다');
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }

    const output = await runFfmpegAtomic(ffmpegBin, (tempPath) => [
      '-y',
      '-loglevel', 'error',
      ...FF_PROTOCOL_WHITELIST,
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-i', safeInput,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      tempPath,
    ], safeOutput, 'ffmpeg clip');
    return { path: output };
  });

  // ---------- Clip export (re-encode, frame-accurate) ----------
  // Unlike clip:extract (-c copy, fast but cuts on keyframes), this re-encodes
  // the In/Out range to a universally-playable H.264 MP4 with exact endpoints.
  secureHandle('clip:export', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output, new Set(['.mp4']));
    if (pathKey(safeInput) === pathKey(safeOutput)) throw new Error('입력 파일을 출력으로 덮어쓸 수 없습니다');
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }
    const dur = end - start;

    const output = await runFfmpegAtomic(ffmpegBin, (tempPath) => [
      '-y',
      '-loglevel', 'error',
      ...FF_PROTOCOL_WHITELIST,
      '-ss', start.toFixed(3),
      '-i', safeInput,
      '-t', dur.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      tempPath,
    ], safeOutput, 'ffmpeg export');
    return { path: output };
  });

  // ---------- GIF/WebP clip export ----------
  // In/Out 구간을 짧은 애니메이션으로 (디스코드/슬랙 첨부용). GIF는 palettegen/
  // paletteuse 2단 필터를 한 커맨드로, WebP는 libwebp 무한 루프.
  const GIF_MAX_SEC = 30;
  secureHandle('clip:gif', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output, new Set(['.gif', '.webp']));
    if (pathKey(safeInput) === pathKey(safeOutput)) throw new Error('입력 파일을 출력으로 덮어쓸 수 없습니다');
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }
    if (end - start > GIF_MAX_SEC) {
      throw new Error(`GIF/WebP는 최대 ${GIF_MAX_SEC}초까지 지원합니다`);
    }
    const fps = Math.max(5, Math.min(30, Number(params.fps) || 15));
    const width = Math.max(120, Math.min(960, Number(params.width) || 480));
    const isWebp = /\.webp$/i.test(safeOutput);

    const output = await runFfmpegAtomic(ffmpegBin, (tempPath) => [
      '-y',
      '-loglevel', 'error',
      ...FF_PROTOCOL_WHITELIST,
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-i', safeInput,
      ...(isWebp
        ? [
            '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos`,
            '-c:v', 'libwebp', '-q:v', '75', '-loop', '0', '-an',
          ]
        : [
            '-vf',
            `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
          ]),
      tempPath,
    ], safeOutput, 'ffmpeg gif');
    return { path: output };
  });

  // ---------- Preview (seekbar hover thumbnail + waveform) ----------
  // Keep at most one active and one pending request. A newer pending request
  // rejects the older one instead of allowing unbounded scrub queues.
  const runThumbnail = createCoalescingRunner('썸네일');
  const runWaveform = createCoalescingRunner('웨이브폼');
  secureHandle('preview:thumbnail', async (_evt, params) => {
    if (!params || !params.input || !Number.isFinite(Number(params.time))) {
      throw new Error('잘못된 썸네일 파라미터');
    }
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found');
    const buf = await runThumbnail(() =>
      thumbnailWithFfmpeg(ffmpegBin, params.input, Number(params.time), Number(params.width) || 192),
    );
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  });

  secureHandle('preview:waveform', async (_evt, params) => {
    if (!params || !params.input) throw new Error('파일 경로 누락');
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found');
    const buf = await runWaveform(() => waveformWithFfmpeg(
      ffmpegBin,
      params.input,
      Number(params.width) || 1920,
      Number(params.height) || 60,
      typeof params.rgb === 'string' ? params.rgb : '255,107,53',
    ));
    return `data:image/png;base64,${buf.toString('base64')}`;
  });

  // ---------- Shell ----------
  secureHandle('shell:openPath', async (_evt, p) => {
    const canonical = canonicalExistingPath(p);
    const captureRoot = canonicalExistingPath(getCaptureDir());
    const allowedCaptureRoot = pathKey(canonical) === pathKey(captureRoot);
    if (!allowedCaptureRoot && !isGeneratedPath(canonical)) {
      throw new Error('허용되지 않은 경로입니다');
    }
    return shell.openPath(canonical);
  });
  secureHandle('shell:openExternal', async (_evt, value) => {
    let url;
    try { url = new URL(value); } catch { throw new Error('잘못된 URL입니다'); }
    if (url.protocol !== 'https:') throw new Error('HTTPS URL만 열 수 있습니다');
    await shell.openExternal(url.toString());
  });

  // ---------- App lifecycle ----------
  secureHandle('app:confirmQuit', () => {
    if (state.quitPromptTimer) {
      clearTimeout(state.quitPromptTimer);
      state.quitPromptTimer = null;
    }
    state.exitConfirmed = true;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.close();
  });
  secureHandle('app:cancelQuit', () => {
    if (state.quitPromptTimer) {
      clearTimeout(state.quitPromptTimer);
      state.quitPromptTimer = null;
    }
    state.exitConfirmed = false;
  });

  // 렌더러가 구독 준비를 마친 뒤 호출. 현재 navigation에 대기 중인 argv
  // 파일들을 순서대로 전달한다.
  secureHandle('app:rendererReady', () => {
    state.rendererReady = true;
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    const pending = state.pendingOpenPaths.splice(0);
    for (const pendingPath of pending) {
      state.mainWindow.webContents.send('app:open-file', pendingPath);
    }
  });
}

module.exports = { registerIpc, registerProtocols };
