const fs = require('node:fs');
const { spawn } = require('node:child_process');
const {
  commitTempFile,
  createTempPath,
  recordGeneratedPath,
  spawnTracked,
} = require('./utils.js');

const TRANSCODE_TIMEOUT_MS = 6 * 60 * 60 * 1_000;
const MAX_STDERR_BYTES = 256 * 1024;

// ---------- helpers ----------

function targetBitrateKbps({ targetBytes, durationSec, audioKbps = 96 }) {
  if (!durationSec || durationSec <= 0) {
    throw new Error('비트레이트 계산을 위한 영상 길이가 없습니다');
  }
  const totalKbps = (targetBytes * 8) / durationSec / 1000;
  return Math.max(200, Math.floor(totalKbps - audioKbps));
}

function scaleFilter(maxWidth) {
  return `scale='min(${maxWidth},iw)':'-2':flags=lanczos`;
}

const COMMON_OUT = (output) => ['-movflags', '+faststart', '-y', output];

// ---------- encoder detection ----------
// LGPL ffmpeg 빌드에는 libx264(GPL)가 없다. 컴파일 목록만이 아니라 실제 짧은
// 인코드를 돌려보고 되는 인코더만 남긴다 (GPU/드라이버 없으면 nvenc 등은 실행 시 사망).

const ENCODER_PRIORITY = [
  'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_mf', 'libopenh264', 'libx264',
];

let _encoderCache = null;

function _probeEncode(ffmpegBin, enc) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=0.1:size=128x128:rate=1',
      '-c:v', enc, '-f', 'null', '-'];
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const done = (ok) => { try { proc.kill(); } catch {} resolve(ok); };
    const timer = setTimeout(() => done(false), 8000);
    proc.on('error', () => { clearTimeout(timer); done(false); });
    proc.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

async function detectEncoders(ffmpegBin) {
  if (_encoderCache) return _encoderCache;
  const list = await new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-hide_banner', '-encoders'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (c) => (out += c.toString()));
    proc.stderr.on('data', () => {});
    const finish = () => resolve(ENCODER_PRIORITY.filter((e) => new RegExp(`\\b${e}\\b`).test(out)));
    proc.on('error', finish);
    proc.on('close', finish);
  });
  const working = [];
  for (const enc of list.length ? list : ['libopenh264']) {
    if (await _probeEncode(ffmpegBin, enc)) working.push(enc);
    if (working.length >= 2) break;
  }
  if (!working.length) working.push('libopenh264');
  _encoderCache = working;
  return working;
}

// 품질 모드 인자 — 인코더별 문법 차이 흡수.
function encQualityArgs(enc, crf) {
  switch (enc) {
    case 'libx264':      return ['-preset', 'medium', '-crf', String(crf)];
    case 'h264_nvenc':   return ['-preset', 'p5', '-rc', 'vbr', '-cq', String(crf)];
    case 'h264_qsv':     return ['-global_quality', String(crf)];
    case 'h264_amf':     return ['-quality', 'balanced', '-rc', 'qvbr', '-qvbr_quality_level', String(crf)];
    case 'h264_mf':      return ['-quality', '70'];
    default:             return ['-q:v', String(crf)];
  }
}

// 비트레이트 모드 인자 — 모든 인코더가 -b:v 를 받는다.
function encRateArgs(enc, kbps) {
  const base = ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`];
  if (enc === 'libopenh264') return [...base, '-profile:v', 'high'];
  return base;
}

// ---------- presets ----------
// Each entry is self-contained: declare what inputs you need + how to build
// the FFmpeg args. To add a new preset, just add one entry below.

const PRESET_MAP = {
  'youtube-1080p': {
    label: '유튜브 1080p (H.264 · CRF 23)',
    description: '1080p 다운스케일, 품질 우선, 사이즈 가변',
    ext: '.mp4',
    needs: {},
    buildArgs: ({ input, output, enc }) => [
      '-i', input,
      '-c:v', enc || 'libopenh264', ...encQualityArgs(enc, 23),
      '-vf', scaleFilter(1920),
      '-c:a', 'aac', '-b:a', '192k',
      ...COMMON_OUT(output),
    ],
  },

  'preview-720p': {
    label: '웹 미리보기 720p (H.264 · CRF 28)',
    description: '720p 다운스케일, 작은 사이즈',
    ext: '.mp4',
    needs: {},
    buildArgs: ({ input, output, enc }) => [
      '-i', input,
      '-c:v', enc || 'libopenh264', ...encQualityArgs(enc, 28),
      '-vf', scaleFilter(1280),
      '-c:a', 'aac', '-b:a', '128k',
      ...COMMON_OUT(output),
    ],
  },

  'kakao-300mb': {
    label: '카카오톡 300MB (PC 첨부 한도)',
    description: '1080p 유지, 300MB 에 정확히 맞춤',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 300 * 1024 * 1024 * 0.97,
        durationSec: duration,
        audioKbps: 128,
      });
      return [
        '-i', input,
        '-c:v', enc || 'libopenh264', ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1920),
        '-c:a', 'aac', '-b:a', '128k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'discord-8mb': {
    label: '디스코드 8MB (Nitro 없음)',
    description: '정확한 8MB 목표',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 8 * 1024 * 1024 * 0.97,
        durationSec: duration,
      });
      return [
        '-i', input,
        '-c:v', enc || 'libopenh264', ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1920),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'discord-25mb': {
    label: '디스코드 25MB (Nitro Basic)',
    description: '정확한 25MB 목표',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 25 * 1024 * 1024 * 0.97,
        durationSec: duration,
      });
      return [
        '-i', input,
        '-c:v', enc || 'libopenh264', ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1920),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'bitrate-half': {
    label: '비트레이트 절반 (해상도 유지)',
    description: '원본 비트레이트의 50% · 해상도/FPS 그대로',
    ext: '.mp4',
    needs: { inputBitrate: true },
    buildArgs: ({ input, output, inputBitrate, enc }) => {
      if (!inputBitrate || inputBitrate <= 0) {
        throw new Error('원본 영상의 비트레이트 정보가 없습니다 (ffprobe 결과 누락)');
      }
      const totalKbps = inputBitrate / 1000;
      const targetKbps = Math.max(200, Math.floor(totalKbps * 0.5 - 96));
      return [
        '-i', input,
        '-c:v', enc || 'libopenh264', ...encRateArgs(enc, targetKbps),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'audio-mp3': {
    label: '오디오만 추출 (MP3 192k)',
    description: '비디오 제거, MP3 변환',
    ext: '.mp3',
    needs: {},
    buildArgs: ({ input, output }) => [
      '-i', input,
      '-vn', '-c:a', 'libmp3lame', '-b:a', '192k',
      '-y', output,
    ],
  },
};

function listPresets() {
  return Object.entries(PRESET_MAP).map(([key, p]) => ({
    key,
    label: p.label,
    description: p.description,
    ext: p.ext,
    needsDuration: !!p.needs.duration,
    needsInputBitrate: !!p.needs.inputBitrate,
  }));
}

// ---------- job ----------

class TranscodeJob {
  constructor({ ffmpegBin, input, output, presetKey, duration, inputBitrate, encoders, onProgress }) {
    const preset = PRESET_MAP[presetKey];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);

    this.ffmpegBin = ffmpegBin;
    this.preset = preset;
    this.input = input;
    this.output = output;
    this.tempOutput = createTempPath(output);
    this._inputBitrate = inputBitrate;
    // encoders: 우선순위 후보 배열 — 시작 직후 사망하면 다음 인코더로 재시도.
    this.encoders = Array.isArray(encoders) && encoders.length ? encoders : ['libopenh264'];
    this.duration = duration;
    this.onProgress = onProgress;
    this.proc = null;
    this.cancelled = false;
    this.stderrTail = [];
    this.usedEncoder = null;
  }

  _runOnce(enc) {
    // Restrict ffmpeg to local file/pipe protocols so a crafted input path
    // can't be interpreted as a network/concat/subfile protocol URL. The
    // whitelist must precede the first -i, so prepend it to the preset args.
    const args = ['-protocol_whitelist', 'file,pipe',
      ...this.preset.buildArgs({ input: this.input, output: this.tempOutput, duration: this.duration, inputBitrate: this._inputBitrate, enc })];
    this.stderrTail = [];
    return new Promise((resolve, reject) => {
      const started = Date.now();
      let settled = false;
      const rejectOnce = async (error) => {
        if (settled) return;
        settled = true;
        this.proc = null;
        await fs.promises.unlink(this.tempOutput).catch(() => {});
        reject(error);
      };
      const resolveOnce = (value) => {
        if (settled) return;
        settled = true;
        this.proc = null;
        resolve(value);
      };

      this.proc = spawnTracked(
        this.ffmpegBin,
        args,
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
        TRANSCODE_TIMEOUT_MS,
      );

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          this.stderrTail.push(line.slice(-4_096));
          while (Buffer.byteLength(this.stderrTail.join('\n'), 'utf8') > MAX_STDERR_BYTES) {
            this.stderrTail.shift();
          }
        }
        const tm = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (tm) {
          const seconds = +tm[1] * 3600 + +tm[2] * 60 + parseFloat(tm[3]);
          const ratio = this.duration > 0 ? Math.min(1, seconds / this.duration) : 0;
          this.onProgress?.({ seconds, ratio });
        }
      });

      this.proc.on('error', (error) => {
        if (!error.earlyDeath) error.earlyDeath = true;
        void rejectOnce(error);
      });

      this.proc.on('close', (code) => {
        const proc = this.proc;
        const wasCancelled = this.cancelled;
        if (wasCancelled) {
          void rejectOnce(new Error('사용자에 의해 취소됨'));
        } else if (proc?.ssakssakTimedOut) {
          void rejectOnce(new Error('트랜스코딩 실행 시간이 초과되었습니다'));
        } else if (code === 0) {
          this.usedEncoder = enc;
          commitTempFile(this.tempOutput, this.output)
            .then(() => resolveOnce(recordGeneratedPath(this.output)))
            .catch((error) => void rejectOnce(error));
        } else {
          const tail = this.stderrTail.slice(-8).join('\n');
          const err = new Error(`ffmpeg exited ${code}\n${tail}`);
          err.earlyDeath = Date.now() - started < 3000;
          void rejectOnce(err);
        }
      });
    });
  }

  async run() {
    let lastErr = null;
    for (const enc of this.encoders) {
      if (this.cancelled) break;
      try {
        return await this._runOnce(enc);
      } catch (e) {
        lastErr = e;
        if (this.cancelled || !e.earlyDeath) break;
      }
    }
    throw lastErr || new Error('사용자에 의해 취소됨');
  }

  cancel() {
    this.cancelled = true;
    if (this.proc) {
      // The child may have already exited between the close event and here.
      try { this.proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => {
        if (this.proc) {
          try { this.proc.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }, 2000);
    }
  }
}

module.exports = { TranscodeJob, listPresets, detectEncoders, encQualityArgs };
