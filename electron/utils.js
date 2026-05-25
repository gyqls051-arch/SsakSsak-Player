const { app } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const state = require('./state.js');

function resolveBinary(name) {
  const local = path.join(__dirname, '..', 'resources', 'bin', name);
  if (fs.existsSync(local)) return local;
  const packaged = path.join(process.resourcesPath, 'bin', name);
  if (fs.existsSync(packaged)) return packaged;
  return null;
}

function getCaptureDir() {
  if (state.captureDir && fs.existsSync(state.captureDir)) return state.captureDir;
  state.captureDir = path.join(app.getPath('pictures'), 'OFFCUT Player');
  fs.mkdirSync(state.captureDir, { recursive: true });
  return state.captureDir;
}

function formatTimeForFilename(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const p = (n, w = 2) => n.toString().padStart(w, '0');
  return `${p(h)}-${p(m)}-${p(sec)}-${p(ms, 3)}`;
}

function sanitizeBasename(name) {
  // Strip Windows-reserved characters so generated PNG / clip filenames are safe.
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

function getHwnd(win) {
  if (process.platform !== 'win32') return 0;
  const buf = win.getNativeWindowHandle();
  // Win64 Electron returns 8 bytes; older or 32-bit builds return 4.
  if (buf.length >= 8) {
    return buf.readBigUInt64LE(0).toString();
  }
  return buf.readUInt32LE(0).toString();
}

function isPathInsideCaptureDir(target) {
  const norm = path.normalize(target).toLowerCase();
  const allowed = path.normalize(getCaptureDir()).toLowerCase();
  if (norm === allowed) return false;
  const sep = path.sep.toLowerCase();
  return norm.startsWith(allowed + sep);
}

// FFmpeg single-frame capture. -ss must come BEFORE -i (input-side seek) — recent
// ffmpeg builds reject it as an output option in this position. Fast keyframe
// seek; sub-second offset is acceptable for capture use. Rotation metadata is
// honored automatically (-autorotate is enabled by default).
function captureFrameWithFfmpeg(ffmpegBin, input, timeSeconds, output) {
  return new Promise((resolve, reject) => {
    const t = Math.max(0, Number(timeSeconds) || 0);
    const args = [
      '-y',
      '-loglevel', 'error',
      '-ss', t.toFixed(3),
      '-i', input,
      '-vframes', '1',
      output,
    ];
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg capture exited ${code}: ${stderr.trim().slice(-200)}`));
    });
  });
}

// Small JPEG thumbnail for seekbar hover preview. Outputs to memory via pipe
// so we don't pollute the capture dir. Width-scaled, keyframe-only seek.
function thumbnailWithFfmpeg(ffmpegBin, input, timeSeconds, width = 192) {
  return new Promise((resolve, reject) => {
    const t = Math.max(0, Number(timeSeconds) || 0);
    const w = Math.max(64, Math.min(512, Number(width) || 192));
    const args = [
      '-y',
      '-loglevel', 'error',
      '-ss', t.toFixed(3),
      '-i', input,
      '-vframes', '1',
      '-vf', `scale=${w}:-2`,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '5',
      'pipe:1',
    ];
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg thumb exited ${code}: ${stderr.trim().slice(-200)}`));
      }
    });
  });
}

// One-shot audio waveform via showwavespic. Returns PNG bytes.
function waveformWithFfmpeg(ffmpegBin, input, width = 1920, height = 60, rgb = '255,107,53') {
  return new Promise((resolve, reject) => {
    const w = Math.max(200, Math.min(4096, Number(width) || 1920));
    const h = Math.max(30, Math.min(200, Number(height) || 60));
    const colorHex = rgb
      .split(',')
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('');
    const args = [
      '-y',
      '-loglevel', 'error',
      '-i', input,
      '-filter_complex',
      `[0:a]aformat=channel_layouts=mono,showwavespic=s=${w}x${h}:colors=#${colorHex}:scale=lin[v]`,
      '-map', '[v]',
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      'pipe:1',
    ];
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg waveform exited ${code}: ${stderr.trim().slice(-200)}`));
      }
    });
  });
}

module.exports = {
  resolveBinary,
  getCaptureDir,
  formatTimeForFilename,
  sanitizeBasename,
  getHwnd,
  isPathInsideCaptureDir,
  captureFrameWithFfmpeg,
  thumbnailWithFfmpeg,
  waveformWithFfmpeg,
};
