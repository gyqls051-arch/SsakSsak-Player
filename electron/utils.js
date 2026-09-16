const { app } = require('electron');
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const state = require('./state.js');

const MAX_COMPONENT_BYTES = 180;
const CHILD_KILL_GRACE_MS = 1_500;

function resolveBinary(name) {
  const local = path.join(__dirname, '..', 'resources', 'bin', name);
  if (fs.existsSync(local)) return local;
  const packaged = path.join(process.resourcesPath, 'bin', name);
  if (fs.existsSync(packaged)) return packaged;
  return null;
}

function getCaptureDir() {
  if (state.captureDir && fs.existsSync(state.captureDir)) return state.captureDir;
  state.captureDir = path.join(app.getPath('pictures'), '싹싹김치 플레이어');
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
  // Leave room for generated timecodes/extensions and keep the component under
  // common filesystem byte limits. A hash suffix makes truncated names stable
  // and prevents two long, similarly-prefixed source names from colliding.
  const original = String(name || 'capture');
  let safe = original
    // eslint-disable-next-line no-control-regex -- 제어문자(\x00-\x1f) 제거가 목적
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[ .]+$/g, '') || 'capture';
  if (Buffer.byteLength(safe, 'utf8') <= MAX_COMPONENT_BYTES) return safe;

  const suffix = `-${createHash('sha256').update(original).digest('hex').slice(0, 12)}`;
  const budget = MAX_COMPONENT_BYTES - Buffer.byteLength(suffix, 'utf8');
  let prefix = '';
  for (const char of safe) {
    if (Buffer.byteLength(prefix + char, 'utf8') > budget) break;
    prefix += char;
  }
  safe = prefix.replace(/[ .]+$/g, '') || 'capture';
  return `${safe}${suffix}`;
}

function pathKey(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function canonicalExistingPath(value) {
  if (!value || typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('정규화된 절대 경로가 필요합니다');
  }
  return fs.realpathSync.native(path.normalize(value));
}

function canonicalOutputPath(value) {
  if (!value || typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('정규화된 절대 출력 경로가 필요합니다');
  }
  const normalized = path.normalize(value);
  const base = path.basename(normalized);
  if (!base || base === '.' || base === '..') throw new Error('잘못된 출력 파일명입니다');
  const parent = fs.realpathSync.native(path.dirname(normalized));
  return path.join(parent, base);
}

function isPathContained(base, target, allowEqual = false) {
  let realBase;
  let realTarget;
  try {
    realBase = canonicalExistingPath(base);
    realTarget = canonicalExistingPath(target);
  } catch {
    return false;
  }
  const relative = path.relative(realBase, realTarget);
  if (!relative) return allowEqual;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createTempPath(finalPath) {
  const ext = path.extname(finalPath);
  return path.join(
    path.dirname(finalPath),
    `.ssakssak-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}${ext}`,
  );
}

async function commitTempFile(tempPath, finalPath, { overwrite = true } = {}) {
  if (!overwrite) {
    await fs.promises.link(tempPath, finalPath);
    await fs.promises.unlink(tempPath);
    return finalPath;
  }

  // Temp and final live in the same directory, so rename uses the platform's
  // replace-existing primitive without an intermediate state where final is
  // moved away. Node's rename contract replaces an existing file.
  await fs.promises.rename(tempPath, finalPath);
  return finalPath;
}

async function writeFileAtomic(finalPath, data, options, commitOptions) {
  const tempPath = createTempPath(finalPath);
  try {
    await fs.promises.writeFile(tempPath, data, { ...options, flag: 'wx' });
    return await commitTempFile(tempPath, finalPath, commitOptions);
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function recordGeneratedPath(value) {
  const canonical = canonicalExistingPath(value);
  state.generatedPaths.add(pathKey(canonical));
  return canonical;
}

function isGeneratedPath(value) {
  try {
    return state.generatedPaths.has(pathKey(canonicalExistingPath(value)));
  } catch {
    return false;
  }
}

function trackOperation(promise) {
  const tracked = Promise.resolve(promise);
  state.activeOperations.add(tracked);
  const remove = () => state.activeOperations.delete(tracked);
  tracked.then(remove, remove);
  return tracked;
}

function spawnTracked(command, args, options = {}, timeoutMs = 0) {
  const proc = spawn(command, args, options);
  state.childProcesses.add(proc);
  proc.ssakssakTimedOut = false;
  let timer = null;
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      proc.ssakssakTimedOut = true;
      try { proc.kill('SIGTERM'); } catch { /* already exited */ }
      setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          try { proc.kill('SIGKILL'); } catch { /* already exited */ }
        }
      }, CHILD_KILL_GRACE_MS).unref?.();
    }, timeoutMs);
    timer.unref?.();
  }
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    state.childProcesses.delete(proc);
  };
  proc.once('close', cleanup);
  proc.once('error', cleanup);
  return proc;
}

function terminateChildProcess(proc, graceMs = CHILD_KILL_GRACE_MS) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
    state.childProcesses.delete(proc);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let killTimer = null;
    let doneTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (doneTimer) clearTimeout(doneTimer);
      state.childProcesses.delete(proc);
      resolve();
    };
    proc.once('close', finish);
    try { proc.kill('SIGTERM'); } catch { finish(); return; }
    killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already exited */ }
    }, graceMs);
    doneTimer = setTimeout(finish, graceMs + 1_000);
    killTimer.unref?.();
    doneTimer.unref?.();
  });
}

async function terminateTrackedChildren() {
  // Closing one process can release a coalesced task. Drain until no tracked
  // process remains rather than relying on a single snapshot.
  while (state.childProcesses.size > 0) {
    await Promise.allSettled([...state.childProcesses].map((proc) => terminateChildProcess(proc)));
  }
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

// Allowed media input extensions for ffmpeg/ffprobe. Mirrors the open-dialog
// video filters plus common audio containers we might probe/transcode.
const ALLOWED_INPUT_EXTS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.wmv', '.flv',
  '.ts', '.mts', '.m2ts', '.mpg', '.mpeg', '.3gp', '.ogv',
  '.mp3', '.aac', '.m4a', '.wav', '.flac', '.opus', '.ogg',
]);

// List the playable video files directly inside a folder (non-recursive),
// sorted naturally (so "2" sorts before "10"). Used by the folder/playlist view.
function listVideoFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && ALLOWED_INPUT_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

// Extract the first playable media file from a process argv array. Used for
// file-association launches and second-instance forwarding.
// dev argv looks like [electron.exe, '.', file] — '.' is a directory and is
// filtered out by the isFile() check.
function extractFileArg(argv, cwd = process.cwd()) {
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-')) continue;
    const p = path.resolve(cwd, raw);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (ALLOWED_INPUT_EXTS.has(path.extname(p).toLowerCase())) return p;
  }
  return null;
}

// Validate a media input path before handing it to ffmpeg/ffprobe: it must be a
// real, existing regular file with an allowed extension. Throws on failure.
function validateMediaInput(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('입력 경로가 없습니다');
  }
  const resolved = path.resolve(input);
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    throw new Error('입력 파일을 찾을 수 없습니다');
  }
  if (!st.isFile()) {
    throw new Error('입력 경로가 파일이 아닙니다');
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_INPUT_EXTS.has(ext)) {
    throw new Error(`허용되지 않은 입력 형식입니다: ${ext || '(확장자 없음)'}`);
  }
  return resolved;
}

// ffmpeg/ffprobe only need to read local files (and write pipes). Restricting
// the protocol whitelist prevents a crafted "input" path from being treated as
// a network/concat/subfile protocol URL.
const FF_PROTOCOL_WHITELIST = ['-protocol_whitelist', 'file,pipe'];

function isPathInsideCaptureDir(target) {
  return isPathContained(getCaptureDir(), target, false);
}

// Return a path that doesn't collide with an existing file by appending
// _2, _3, … before the extension. Prevents same-timestamp captures from
// silently overwriting each other.
function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, -ext.length || undefined);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return targetPath;
}

// Small JPEG thumbnail for seekbar hover preview. Outputs to memory via pipe
// so we don't pollute the capture dir. Width-scaled, keyframe-only seek.
function thumbnailWithFfmpeg(ffmpegBin, input, timeSeconds, width = 192) {
  return new Promise((resolve, reject) => {
    const t = Math.max(0, Number(timeSeconds) || 0);
    const w = Math.max(64, Math.min(512, Number(width) || 192));
    const safeInput = validateMediaInput(input);
    const args = [
      '-y',
      '-loglevel', 'error',
      ...FF_PROTOCOL_WHITELIST,
      '-ss', t.toFixed(3),
      '-i', safeInput,
      '-vframes', '1',
      '-vf', `scale=${w}:-2`,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '5',
      'pipe:1',
    ];
    const proc = spawnTracked(ffmpegBin, args, { windowsHide: true }, 15_000);
    const chunks = [];
    let outputBytes = 0;
    let stderr = '';
    let overflow = false;
    proc.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 8 * 1024 * 1024) {
        overflow = true;
        try { proc.kill('SIGTERM'); } catch { /* already exited */ }
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8').slice(0, 64 * 1024 - stderr.length);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (proc.ssakssakTimedOut) {
        reject(new Error('ffmpeg thumbnail timed out'));
      } else if (overflow) {
        reject(new Error('ffmpeg thumbnail output exceeded limit'));
      } else if (code === 0 && chunks.length) {
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
    const components = String(rgb).split(',').map((n) => Math.max(0, Math.min(255, Number(n) || 0)));
    while (components.length < 3) components.push(0);
    const colorHex = components
      .slice(0, 3)
      .map((n) => Math.round(n).toString(16).padStart(2, '0'))
      .join('');
    const safeInput = validateMediaInput(input);
    const args = [
      '-y',
      '-loglevel', 'error',
      ...FF_PROTOCOL_WHITELIST,
      '-i', safeInput,
      '-filter_complex',
      `[0:a]aformat=channel_layouts=mono,showwavespic=s=${w}x${h}:colors=#${colorHex}:scale=lin[v]`,
      '-map', '[v]',
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      'pipe:1',
    ];
    const proc = spawnTracked(ffmpegBin, args, { windowsHide: true }, 30_000);
    const chunks = [];
    let outputBytes = 0;
    let stderr = '';
    let overflow = false;
    proc.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 16 * 1024 * 1024) {
        overflow = true;
        try { proc.kill('SIGTERM'); } catch { /* already exited */ }
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8').slice(0, 64 * 1024 - stderr.length);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (proc.ssakssakTimedOut) {
        reject(new Error('ffmpeg waveform timed out'));
      } else if (overflow) {
        reject(new Error('ffmpeg waveform output exceeded limit'));
      } else if (code === 0 && chunks.length) {
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
  pathKey,
  canonicalExistingPath,
  canonicalOutputPath,
  isPathContained,
  createTempPath,
  commitTempFile,
  writeFileAtomic,
  recordGeneratedPath,
  isGeneratedPath,
  trackOperation,
  spawnTracked,
  terminateChildProcess,
  terminateTrackedChildren,
  getHwnd,
  extractFileArg,
  validateMediaInput,
  listVideoFiles,
  uniquePath,
  FF_PROTOCOL_WHITELIST,
  isPathInsideCaptureDir,
  thumbnailWithFfmpeg,
  waveformWithFfmpeg,
};
