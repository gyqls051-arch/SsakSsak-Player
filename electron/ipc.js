const { ipcMain, dialog, shell, protocol, Menu, clipboard, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
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
} = require('./utils.js');

// Confine a transcode/clip output path to either the capture dir or the
// directory the user explicitly picked via the save dialog. We can't observe
// the dialog here, so we accept any absolute path the user could have chosen,
// but reject traversal and require an absolute, normalized path under an
// existing parent directory. Output extension is constrained to media types.
const ALLOWED_OUTPUT_EXTS = new Set([
  '.mp4', '.mkv', '.mov', '.webm', '.m4v', '.mp3', '.m4a', '.aac', '.wav', '.png',
]);

function validateOutputPath(output) {
  if (!output || typeof output !== 'string') throw new Error('출력 경로가 없습니다');
  const resolved = path.resolve(output);
  if (output.includes('..')) throw new Error('잘못된 출력 경로입니다');
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_OUTPUT_EXTS.has(ext)) {
    throw new Error(`허용되지 않은 출력 형식입니다: ${ext || '(확장자 없음)'}`);
  }
  return resolved;
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
      if (!isPathInsideCaptureDir(decoded)) {
        return new Response(null, { status: 403 });
      }
      const data = await fs.promises.readFile(decoded);
      return new Response(data, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function registerIpc() {
  // ---------- Dialogs ----------
  ipcMain.handle('dialog:openVideo', async () => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '영상 파일 선택',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'ts', 'mts', 'mpg', 'mpeg'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:openSubtitle', async () => {
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

  ipcMain.handle('dialog:saveFile', async (_evt, opts) => {
    if (!state.mainWindow) return null;
    const result = await dialog.showSaveDialog(state.mainWindow, opts || {});
    return result.canceled ? null : result.filePath;
  });

  // Open a folder and return its playable video files (for the playlist view).
  ipcMain.handle('folder:open', async () => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '폴더 열기',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    return { folder, files: listVideoFiles(folder) };
  });

  ipcMain.handle('dialog:chooseDirectory', async (_evt, defaultPath) => {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: '폴더 선택',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ---------- mpv ----------
  const onStatus = (status) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('mpv:status', status);
    }
  };

  ipcMain.handle('mpv:open', async (_evt, filePath) => {
    const m = ensureMpv(onStatus);
    await m.open(filePath);
    return { ok: true };
  });
  ipcMain.handle('mpv:command', async (_evt, command, ...args) => ensureMpv(onStatus).command(command, ...args));
  ipcMain.handle('mpv:getTracks', async () => ensureMpv(onStatus).getTracks());
  ipcMain.handle('mpv:setProperty', async (_evt, name, value) => ensureMpv(onStatus).setProperty(name, value));
  ipcMain.handle('mpv:getProperty', async (_evt, name) => ensureMpv(onStatus).getProperty(name));

  // ---------- Window ----------
  // Right-click context menu over the video. Built as a native OS menu so it
  // renders ABOVE the mpv child window (a React menu would be hidden behind it).
  // Each item just forwards an action id to the renderer, which reuses its
  // existing handlers — keeping all app logic in one place.
  ipcMain.handle('window:showVideoMenu', async (_evt, ctx) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    const c = ctx || {};
    const send = (action) => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('menu:action', action);
      }
    };
    const tracks = await ensureMpv(onStatus)
      .getTracks()
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
      { type: 'separator' },
      { label: '전체화면 (Enter)', click: () => send('fullscreen') },
      { label: '파일 열기… (Ctrl+O)', click: () => send('open') },
    ];
    Menu.buildFromTemplate(template).popup({ window: state.mainWindow });
  });

  ipcMain.handle('window:toggleFullscreen', () => {
    if (!state.mainWindow) return false;
    const next = !state.mainWindow.isFullScreen();
    state.mainWindow.setFullScreen(next);
    return next;
  });
  ipcMain.handle('window:isFullscreen', () => !!state.mainWindow?.isFullScreen());

  // ---------- Video child window ----------
  ipcMain.handle('video:setBounds', (_evt, bounds) => {
    if (!bounds || typeof bounds.width !== 'number') return;
    if (bounds.width < 10 || bounds.height < 10) return;
    state.lastVideoBounds = bounds;
    getVideoWindow();
    syncVideoBounds();
  });
  ipcMain.handle('video:hide', () => setVideoVisible(false));
  ipcMain.handle('video:setOverlayActive', (_evt, active) => {
    state.overlayActive = !!active;
    if (state.overlayActive) {
      hideSeekPreview();
      setVideoVisible(false);
    } else syncVideoBounds();
  });

  // Seekbar hover preview, rendered in a transparent overlay window so it sits
  // above the mpv video window instead of being clipped behind it.
  ipcMain.handle('preview:overlayShow', (_evt, params) => showSeekPreview(params));
  ipcMain.handle('preview:overlayHide', () => hideSeekPreview());

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
  ipcMain.handle('capture:now', async (_evt, opts) => {
    const ext = opts && opts.format === 'jpg' ? 'jpg' : 'png';
    const m = ensureMpv(onStatus);
    // Metadata first (the filename embeds the timecode), then the shot itself.
    const { sourceName, inputPath, timePos, frame } = await readCurrentFrame();
    const outPath = uniquePath(
      path.join(getCaptureDir(), `${sourceName}_${formatTimeForFilename(timePos)}.${ext}`),
    );
    await m.screenshotToFile(outPath);
    return { path: outPath, videoPath: inputPath, time: timePos, frame };
  });

  // Copy the current frame straight to the OS clipboard (no disk file kept).
  ipcMain.handle('capture:copyCurrent', async () => {
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
  ipcMain.handle('capture:copyFile', async (_evt, p) => {
    if (!isPathInsideCaptureDir(p)) throw new Error('허용되지 않은 경로입니다');
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) throw new Error('이미지를 읽을 수 없습니다');
    clipboard.writeImage(img);
    return { ok: true };
  });

  // Start a native OS drag of a capture file so it can be dropped into other
  // apps (Premiere, Photoshop, Explorer, chat windows, …).
  ipcMain.handle('capture:startDrag', (evt, p) => {
    if (!isPathInsideCaptureDir(p) || !fs.existsSync(p)) return;
    let icon = nativeImage.createFromPath(p);
    if (icon.isEmpty()) {
      // startDrag requires a non-empty icon; fall back to a 1px transparent one.
      icon = nativeImage.createEmpty();
    } else {
      icon = icon.resize({ width: 128 });
    }
    evt.sender.startDrag({ file: p, icon });
  });

  // Write a base64 data URL (PNG) to a path the user picked — used by the
  // contact-sheet export.
  ipcMain.handle('capture:saveImage', async (_evt, dataUrl, outPath) => {
    const safe = validateOutputPath(outPath);
    const m = /^data:image\/\w+;base64,(.+)$/s.exec(typeof dataUrl === 'string' ? dataUrl : '');
    if (!m) throw new Error('잘못된 이미지 데이터입니다');
    await fs.promises.writeFile(safe, Buffer.from(m[1], 'base64'));
    return { path: safe };
  });

  ipcMain.handle('capture:getDir', () => getCaptureDir());
  ipcMain.handle('capture:setDir', async (_evt, dir) => {
    if (!dir || typeof dir !== 'string') return null;
    const normalized = path.normalize(dir);
    if (!path.isAbsolute(normalized) || normalized.includes('..')) {
      throw new Error('잘못된 경로입니다');
    }
    fs.mkdirSync(normalized, { recursive: true });
    state.captureDir = normalized;
    return state.captureDir;
  });
  ipcMain.handle('capture:reveal', async (_evt, p) => {
    if (!p) return null;
    if (fs.existsSync(p)) shell.showItemInFolder(p);
    return null;
  });

  // ---------- ffprobe ----------
  ipcMain.handle('ffprobe:info', async (_evt, filePath) => {
    const ffprobeBin = resolveBinary('ffprobe.exe');
    if (!ffprobeBin) throw new Error('ffprobe.exe not found in resources/bin');
    const safeInput = validateMediaInput(filePath);
    return runFfprobe(ffprobeBin, safeInput);
  });

  // ---------- Transcode ----------
  ipcMain.handle('transcode:presets', () => listPresets());
  ipcMain.handle('transcode:start', async (_evt, params) => {
    if (state.currentJob) throw new Error('이미 진행 중인 트랜스코딩이 있습니다');
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params.input || !params.output || !params.presetKey) throw new Error('필수 파라미터 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output);
    fs.mkdirSync(path.dirname(safeOutput), { recursive: true });

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
      await state.currentJob.run();
      return { jobId, output: params.output };
    } finally {
      state.currentJob = null;
    }
  });
  ipcMain.handle('transcode:cancel', () => {
    if (state.currentJob) state.currentJob.cancel();
    return true;
  });

  // ---------- Markers (Premiere XMP) ----------
  ipcMain.handle('markers:exportXmp', async (_evt, params) => {
    if (!params || !params.videoPath || !Array.isArray(params.captures)) {
      throw new Error('영상 경로 또는 캡처 정보 누락');
    }
    if (params.captures.length === 0) throw new Error('내보낼 캡처가 없습니다');
    const xmpPath = params.videoPath.replace(/\.[^.]+$/, '.xmp');
    const content = buildXmpMarkers(params.captures, params.fps || 30);
    fs.writeFileSync(xmpPath, content, 'utf8');
    return xmpPath;
  });

  // ---------- Notes export (text formats) ----------
  ipcMain.handle('notes:exportText', async (_evt, content, outPath) => {
    if (typeof content !== 'string') throw new Error('내보낼 내용이 없습니다');
    if (!outPath || typeof outPath !== 'string') throw new Error('출력 경로가 없습니다');
    if (outPath.includes('..')) throw new Error('잘못된 출력 경로입니다');
    const resolved = path.resolve(outPath);
    const ext = path.extname(resolved).toLowerCase();
    if (!['.txt', '.csv', '.srt', '.md'].includes(ext)) {
      throw new Error(`허용되지 않은 형식입니다: ${ext || '(확장자 없음)'}`);
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf8');
    return { path: resolved };
  });

  // ---------- Lossless clip extract ----------
  ipcMain.handle('clip:extract', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output);
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }
    fs.mkdirSync(path.dirname(safeOutput), { recursive: true });

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-loglevel', 'error',
        ...FF_PROTOCOL_WHITELIST,
        '-ss', start.toFixed(3),
        '-to', end.toFixed(3),
        '-i', safeInput,
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        safeOutput,
      ];
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve({ path: safeOutput });
        else reject(new Error(`ffmpeg clip exited ${code}: ${stderr.trim().slice(-200)}`));
      });
    });
  });

  // ---------- Clip export (re-encode, frame-accurate) ----------
  // Unlike clip:extract (-c copy, fast but cuts on keyframes), this re-encodes
  // the In/Out range to a universally-playable H.264 MP4 with exact endpoints.
  ipcMain.handle('clip:export', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const safeInput = validateMediaInput(params.input);
    const safeOutput = validateOutputPath(params.output);
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }
    fs.mkdirSync(path.dirname(safeOutput), { recursive: true });
    const dur = end - start;

    return new Promise((resolve, reject) => {
      const args = [
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
        safeOutput,
      ];
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve({ path: safeOutput });
        else reject(new Error(`ffmpeg export exited ${code}: ${stderr.trim().slice(-200)}`));
      });
    });
  });

  // ---------- Preview (seekbar hover thumbnail + waveform) ----------
  // Serialize requests so we don't fork dozens of ffmpegs while the user
  // scrubs the seekbar.
  let thumbBusy = Promise.resolve();
  ipcMain.handle('preview:thumbnail', async (_evt, params) => {
    if (!params || !params.input || !Number.isFinite(Number(params.time))) {
      throw new Error('잘못된 썸네일 파라미터');
    }
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found');
    const job = thumbBusy.then(() =>
      thumbnailWithFfmpeg(ffmpegBin, params.input, Number(params.time), Number(params.width) || 192),
    );
    thumbBusy = job.catch(() => {});
    const buf = await job;
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  });

  ipcMain.handle('preview:waveform', async (_evt, params) => {
    if (!params || !params.input) throw new Error('파일 경로 누락');
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found');
    const buf = await waveformWithFfmpeg(
      ffmpegBin,
      params.input,
      Number(params.width) || 1920,
      Number(params.height) || 60,
      typeof params.rgb === 'string' ? params.rgb : '255,107,53',
    );
    return `data:image/png;base64,${buf.toString('base64')}`;
  });

  // ---------- Shell ----------
  ipcMain.handle('shell:openPath', async (_evt, p) => shell.openPath(p));
  ipcMain.handle('shell:openExternal', async (_evt, url) => {
    // Only allow web links — never arbitrary schemes via this bridge.
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  // ---------- App lifecycle ----------
  ipcMain.handle('app:confirmQuit', () => {
    state.exitConfirmed = true;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.close();
  });

  // 렌더러가 구독 준비를 마친 뒤 호출. 대기 중이던 argv 파일을 그때 흘려보낸다
  // (did-finish-load 시점에는 React effect가 아직 등록 전일 수 있어 레이스 방지).
  ipcMain.handle('app:rendererReady', () => {
    state.rendererReady = true;
    if (state.pendingOpenPath && state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('app:open-file', state.pendingOpenPath);
      state.pendingOpenPath = null;
    }
  });
}

module.exports = { registerIpc, registerProtocols };
