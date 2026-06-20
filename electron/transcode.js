const { spawn } = require('node:child_process');

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

// ---------- presets ----------
// Each entry is self-contained: declare what inputs you need + how to build
// the FFmpeg args. To add a new preset, just add one entry below.

const PRESET_MAP = {
  'youtube-1080p': {
    label: '유튜브 1080p (H.264 · CRF 23)',
    description: '1080p 다운스케일, 품질 우선, 사이즈 가변',
    ext: '.mp4',
    needs: {},
    buildArgs: ({ input, output }) => [
      '-i', input,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
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
    buildArgs: ({ input, output }) => [
      '-i', input,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
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
    buildArgs: ({ input, output, duration }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 300 * 1024 * 1024 * 0.97,
        durationSec: duration,
        audioKbps: 128,
      });
      return [
        '-i', input,
        '-c:v', 'libx264', '-preset', 'medium',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${videoKbps}k`,
        '-bufsize', `${videoKbps * 2}k`,
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
    buildArgs: ({ input, output, duration }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 8 * 1024 * 1024 * 0.97,
        durationSec: duration,
      });
      return [
        '-i', input,
        '-c:v', 'libx264', '-preset', 'medium',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${videoKbps}k`,
        '-bufsize', `${videoKbps * 2}k`,
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
    buildArgs: ({ input, output, duration }) => {
      const videoKbps = targetBitrateKbps({
        targetBytes: 25 * 1024 * 1024 * 0.97,
        durationSec: duration,
      });
      return [
        '-i', input,
        '-c:v', 'libx264', '-preset', 'medium',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${videoKbps}k`,
        '-bufsize', `${videoKbps * 2}k`,
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
    buildArgs: ({ input, output, inputBitrate }) => {
      if (!inputBitrate || inputBitrate <= 0) {
        throw new Error('원본 영상의 비트레이트 정보가 없습니다 (ffprobe 결과 누락)');
      }
      const totalKbps = inputBitrate / 1000;
      const targetKbps = Math.max(200, Math.floor(totalKbps * 0.5 - 96));
      return [
        '-i', input,
        '-c:v', 'libx264', '-preset', 'medium',
        '-b:v', `${targetKbps}k`,
        '-maxrate', `${targetKbps}k`,
        '-bufsize', `${targetKbps * 2}k`,
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
  constructor({ ffmpegBin, input, output, presetKey, duration, inputBitrate, onProgress }) {
    const preset = PRESET_MAP[presetKey];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);

    this.ffmpegBin = ffmpegBin;
    this.preset = preset;
    // Restrict ffmpeg to local file/pipe protocols so a crafted input path
    // can't be interpreted as a network/concat/subfile protocol URL. The
    // whitelist must precede the first -i, so prepend it to the preset args.
    this.args = ['-protocol_whitelist', 'file,pipe', ...preset.buildArgs({ input, output, duration, inputBitrate })];
    this.input = input;
    this.output = output;
    this.duration = duration;
    this.onProgress = onProgress;
    this.proc = null;
    this.cancelled = false;
    this.stderrTail = [];
  }

  run() {
    return new Promise((resolve, reject) => {
      this.proc = spawn(this.ffmpegBin, this.args, { windowsHide: true });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          this.stderrTail.push(line);
          if (this.stderrTail.length > 30) this.stderrTail.shift();
        }
        const tm = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (tm) {
          const seconds = +tm[1] * 3600 + +tm[2] * 60 + parseFloat(tm[3]);
          const ratio = this.duration > 0 ? Math.min(1, seconds / this.duration) : 0;
          this.onProgress?.({ seconds, ratio });
        }
      });

      this.proc.on('error', (e) => {
        this.proc = null;
        reject(e);
      });

      this.proc.on('close', (code) => {
        const wasCancelled = this.cancelled;
        this.proc = null;
        if (wasCancelled) {
          reject(new Error('사용자에 의해 취소됨'));
        } else if (code === 0) {
          resolve();
        } else {
          const tail = this.stderrTail.slice(-8).join('\n');
          reject(new Error(`ffmpeg exited ${code}\n${tail}`));
        }
      });
    });
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

module.exports = { TranscodeJob, listPresets };
