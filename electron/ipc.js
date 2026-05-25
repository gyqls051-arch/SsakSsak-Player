const { ipcMain, dialog, shell, protocol } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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
  captureFrameWithFfmpeg,
  thumbnailWithFfmpeg,
  waveformWithFfmpeg,
} = require('./utils.js');
const { ensureMpv, getVideoWindow, syncVideoBounds, setVideoVisible } = require('./windows.js');

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

  ipcMain.handle('dialog:saveFile', async (_evt, opts) => {
    if (!state.mainWindow) return null;
    const result = await dialog.showSaveDialog(state.mainWindow, opts || {});
    return result.canceled ? null : result.filePath;
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
  ipcMain.handle('mpv:setProperty', async (_evt, name, value) => ensureMpv(onStatus).setProperty(name, value));
  ipcMain.handle('mpv:getProperty', async (_evt, name) => ensureMpv(onStatus).getProperty(name));

  // ---------- Window ----------
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
    if (state.overlayActive) setVideoVisible(false);
    else syncVideoBounds();
  });

  // ---------- Capture ----------
  ipcMain.handle('capture:now', async () => {
    const m = ensureMpv(onStatus);
    const dir = getCaptureDir();
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');

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

    const outPath = path.join(dir, `${sourceName}_${formatTimeForFilename(timePos)}.png`);
    await captureFrameWithFfmpeg(ffmpegBin, inputPath, timePos, outPath);
    return { path: outPath, time: timePos, frame };
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
    return runFfprobe(ffprobeBin, filePath);
  });

  // ---------- Transcode ----------
  ipcMain.handle('transcode:presets', () => listPresets());
  ipcMain.handle('transcode:start', async (_evt, params) => {
    if (state.currentJob) throw new Error('이미 진행 중인 트랜스코딩이 있습니다');
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params.input || !params.output || !params.presetKey) throw new Error('필수 파라미터 누락');
    fs.mkdirSync(path.dirname(params.output), { recursive: true });

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    state.currentJob = new TranscodeJob({
      ffmpegBin,
      input: params.input,
      output: params.output,
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

  // ---------- Lossless clip extract ----------
  ipcMain.handle('clip:extract', async (_evt, params) => {
    const ffmpegBin = resolveBinary('ffmpeg.exe');
    if (!ffmpegBin) throw new Error('ffmpeg.exe not found in resources/bin');
    if (!params || !params.input || !params.output) throw new Error('입력/출력 경로 누락');
    const start = Number(params.start);
    const end = Number(params.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('잘못된 시작/끝 시각');
    }
    fs.mkdirSync(path.dirname(params.output), { recursive: true });

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-loglevel', 'error',
        '-ss', start.toFixed(3),
        '-to', end.toFixed(3),
        '-i', params.input,
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        params.output,
      ];
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve({ path: params.output });
        else reject(new Error(`ffmpeg clip exited ${code}: ${stderr.trim().slice(-200)}`));
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
}

module.exports = { registerIpc, registerProtocols };
