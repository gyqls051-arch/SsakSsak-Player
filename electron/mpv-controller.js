const NodeMpv = require('node-mpv');

const START_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 20_000;

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Whitelist of mpv properties the renderer may read/write through IPC.
// Anything outside this set is rejected so the IPC bridge can't be used to
// drive arbitrary mpv property access (e.g. script-opts, ytdl, stream-open
// behaviours). Keep in sync with the actual app usage.
const ALLOWED_SET_PROPS = new Set([
  'ab-loop-a',
  'ab-loop-b',
  'speed',
  'volume',
  'mute',
  'pause',
  'loop-file',
  'sub-delay',
  'audio-delay',
  'sub-scale',
  'video-rotate',
  'video-aspect-override',
  'video-zoom',
]);
const ALLOWED_GET_PROPS = new Set([
  'ab-loop-a',
  'ab-loop-b',
  'speed',
  'duration',
  'volume',
  'mute',
  'pause',
  'path',
  'filename',
  'filename/no-ext',
  'time-pos',
  'estimated-frame-number',
  'sub-delay',
  'audio-delay',
  'sub-scale',
  'chapter-list',
  'video-rotate',
  'video-zoom',
]);

class MpvController {
  /**
   * @param {{ mpvBinary: string, wid?: string | number, onStatus?: (s: object) => void }} opts
   */
  constructor(opts) {
    this.opts = opts;
    /** @type {InstanceType<typeof NodeMpv> | null} */
    this.mpv = null;
    this.started = false;
    this.disposed = false;
    /** @type {Promise<void> | null} */
    this.startingPromise = null;
    this.openQueue = Promise.resolve();
    this.nextLoadId = 0;
    this.activeLoadId = 0;
    this.eofReached = false;
    this.lastStatus = {
      loadId: 0,
      filename: null,
      duration: 0,
      position: 0,
      paused: true,
      speed: 1,
      volume: 100,
      muted: false,
      eofReached: false,
      loading: false,
      error: null,
    };
  }

  async _ensureStarted() {
    if (this.disposed) throw new Error('mpv controller has been disposed');
    if (this.started && this.mpv) return;
    if (this.startingPromise) return this.startingPromise;

    const starting = this._start();
    this.startingPromise = starting;
    try {
      await starting;
    } finally {
      if (this.startingPromise === starting) this.startingPromise = null;
    }
  }

  async _start() {
    const args = [
      '--keep-open=always',
      '--idle=yes',
      '--no-input-default-bindings',
      '--input-vo-keyboard=no',
      '--osc=no',
      '--osd-bar=no',
      '--no-border',
      '--hwdec=auto-safe',
      '--vo=gpu-next',
      '--volume-max=150',
      '--screenshot-jpeg-quality=95',
      '--sub-auto=fuzzy',
      '--sub-file-paths=subs;sub;자막',
    ];
    if (this.opts.wid) {
      args.push(`--wid=${this.opts.wid}`);
    } else {
      args.push('--force-window=yes', '--title=싹싹김치 플레이어 — Video');
    }

    const mpv = new NodeMpv(
      {
        binary: this.opts.mpvBinary,
        audio_only: false,
        time_update: 0.05,
        debug: false,
        verbose: false,
        // The controller owns recovery. node-mpv auto-restart can otherwise
        // race with dispose/open and leaves the renderer believing a file is loaded.
        auto_restart: false,
      },
      args,
    );
    this.mpv = mpv;

    try {
      await withTimeout(mpv.start(), START_TIMEOUT_MS, 'mpv 시작 시간이 초과되었습니다');
      if (this.disposed || this.mpv !== mpv) throw new Error('mpv 시작이 취소되었습니다');
      this._wireEvents(mpv);
      for (const prop of [
        'duration',
        'time-pos',
        'pause',
        'eof-reached',
        'speed',
        'volume',
        'mute',
      ]) {
        try {
          await mpv.observeProperty(prop);
        } catch {
          // node-mpv observes some properties itself; duplicate observation is harmless.
        }
      }
      this.started = true;
    } catch (error) {
      if (this.mpv === mpv) this.mpv = null;
      this.started = false;
      try {
        mpv.mpvPlayer?.kill();
      } catch {
        // Process may not have been spawned or may already have exited.
      }
      throw error;
    }
  }

  _emit() {
    this.opts.onStatus?.({ ...this.lastStatus });
  }

  _wireEvents(mpv) {
    const isCurrent = () => this.mpv === mpv && !this.disposed;

    mpv.on('started', () => {
      if (!isCurrent()) return;
      const loadId = this.activeLoadId;
      this.lastStatus.paused = false;
      this._emit();
      mpv
        .getDuration()
        .then((duration) => {
          if (!isCurrent() || loadId !== this.activeLoadId) return;
          const value = Number(duration);
          if (Number.isFinite(value) && value > 0) {
            this.lastStatus.duration = value;
            this._emit();
          }
        })
        .catch(() => {});
    });
    mpv.on('stopped', () => {
      if (!isCurrent()) return;
      this.lastStatus.paused = true;
      this._emit();
    });
    mpv.on('paused', () => {
      if (!isCurrent()) return;
      this.lastStatus.paused = true;
      this._emit();
    });
    mpv.on('resumed', () => {
      if (!isCurrent()) return;
      this.lastStatus.paused = false;
      this._emit();
    });
    mpv.on('timeposition', (sec) => {
      if (!isCurrent()) return;
      this.lastStatus.position = Number(sec) || 0;
      this._emit();
    });
    mpv.on('status', (status) => {
      if (!isCurrent() || !status || typeof status !== 'object') return;
      const { property, value } = status;
      switch (property) {
        case 'duration':
          this.lastStatus.duration = Number(value) || 0;
          break;
        case 'eof-reached':
          this.eofReached = !!value;
          this.lastStatus.eofReached = this.eofReached;
          break;
        case 'volume':
          this.lastStatus.volume = Number(value) || 0;
          break;
        case 'mute':
          this.lastStatus.muted = !!value;
          break;
        case 'pause':
          this.lastStatus.paused = !!value;
          break;
        case 'speed':
          this.lastStatus.speed = Number(value) || 1;
          break;
        default:
          return;
      }
      this._emit();
    });
    mpv.on('crashed', () => this._handleEngineExit(mpv, 'mpv가 비정상 종료되었습니다'));
    mpv.on('quit', () => this._handleEngineExit(mpv, 'mpv가 종료되었습니다'));
  }

  _handleEngineExit(mpv, message) {
    if (this.mpv !== mpv || this.disposed) return;
    this.mpv = null;
    this.started = false;
    this.eofReached = false;
    this.lastStatus = {
      ...this.lastStatus,
      filename: null,
      duration: 0,
      position: 0,
      paused: true,
      eofReached: false,
      loading: false,
      error: message,
    };
    this._emit();
  }

  async warmup() {
    await this._ensureStarted();
  }

  open(filePath) {
    const loadId = ++this.nextLoadId;
    const job = this.openQueue.then(() => this._open(filePath, loadId));
    this.openQueue = job.catch(() => {});
    return job;
  }

  async _open(filePath, loadId) {
    await this._ensureStarted();
    const mpv = this.mpv;
    if (!mpv) throw new Error('mpv를 시작할 수 없습니다');

    this.activeLoadId = loadId;
    this.lastStatus = {
      ...this.lastStatus,
      loadId,
      loading: true,
      error: null,
      eofReached: false,
    };
    this.eofReached = false;
    this._emit();

    try {
      // node-mpv resolves load() only after mpv emits start-file + file-loaded.
      await withTimeout(
        mpv.load(filePath, 'replace'),
        LOAD_TIMEOUT_MS,
        '영상 로드 시간이 초과되었습니다',
      );
      if (this.disposed || this.mpv !== mpv) throw new Error('영상 로드가 취소되었습니다');

      // A newer request may already be waiting. Do not publish or post-process
      // this transient file; the queue will immediately load the latest request.
      if (loadId !== this.nextLoadId) return { loadId, stale: true };

      this.lastStatus = {
        ...this.lastStatus,
        loadId,
        filename: filePath,
        position: 0,
        duration: 0,
        paused: false,
        eofReached: false,
        loading: false,
        error: null,
      };
      this._emit();

      await mpv.play();
      const values = await Promise.allSettled([
        mpv.getDuration(),
        mpv.getProperty('speed'),
        mpv.getProperty('volume'),
        mpv.getProperty('mute'),
      ]);
      if (loadId === this.activeLoadId && loadId === this.nextLoadId) {
        const [duration, speed, volume, muted] = values;
        if (duration.status === 'fulfilled') this.lastStatus.duration = Number(duration.value) || 0;
        if (speed.status === 'fulfilled') this.lastStatus.speed = Number(speed.value) || 1;
        if (volume.status === 'fulfilled') this.lastStatus.volume = Number(volume.value) || 0;
        if (muted.status === 'fulfilled') this.lastStatus.muted = !!muted.value;
        this._emit();
      }
      return { loadId, stale: false };
    } catch (error) {
      if (loadId === this.activeLoadId && loadId === this.nextLoadId) {
        this.lastStatus = {
          ...this.lastStatus,
          loadId,
          filename: null,
          duration: 0,
          position: 0,
          paused: true,
          eofReached: false,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        };
        this._emit();
      }
      throw error;
    }
  }

  async getTracks() {
    await this._ensureStarted();
    try {
      const list = await this.mpv.getProperty('track-list');
      if (!Array.isArray(list)) return [];
      return list.map((track) => ({
        id: track.id,
        type: track.type,
        title: track.title || '',
        lang: track.lang || '',
        codec: track.codec || '',
        selected: !!track.selected,
        external: !!track.external,
      }));
    } catch {
      return [];
    }
  }

  async command(cmd, ...args) {
    await this._ensureStarted();
    switch (cmd) {
      case 'play':
        if (this.eofReached) await this.mpv.seek(0, 'absolute');
        return this.mpv.play();
      case 'pause':
        return this.mpv.pause();
      case 'togglePause':
        if (this.eofReached) {
          await this.mpv.seek(0, 'absolute');
          return this.mpv.play();
        }
        return this.mpv.togglePause();
      case 'stop':
        return this.mpv.stop();
      case 'seek':
        return this.mpv.seek(Number(args[0]), args[1] || 'absolute');
      case 'frameStep':
        return this.mpv.command('frame-step', []);
      case 'frameBackStep':
        return this.mpv.command('frame-back-step', []);
      case 'toggleFullscreen':
        return this.mpv.toggleFullscreen();
      case 'speed': {
        const value = Number(args[0]);
        const result = await this.mpv.speed(value);
        this.lastStatus.speed = value;
        this._emit();
        return result;
      }
      case 'volume': {
        const value = Math.max(0, Math.min(150, Number(args[0])));
        const result = await this.mpv.volume(value);
        this.lastStatus.volume = value;
        this._emit();
        return result;
      }
      case 'mute': {
        const result = await this.mpv.mute();
        this.lastStatus.muted = !this.lastStatus.muted;
        this._emit();
        return result;
      }
      case 'setAudio':
        return this.mpv.setProperty('aid', args[0]);
      case 'setSub':
        return this.mpv.setProperty('sid', args[0]);
      case 'addSub':
        return this.mpv.command('sub-add', [String(args[0]), 'select']);
      default:
        throw new Error(`Disallowed mpv command: ${String(cmd)}`);
    }
  }

  async screenshotToFile(outputPath) {
    await this._ensureStarted();
    const normalized = outputPath.replace(/\\/g, '/');
    return this.mpv.command('screenshot-to-file', [normalized, 'video']);
  }

  async setProperty(name, value) {
    if (!ALLOWED_SET_PROPS.has(name)) {
      throw new Error(`Disallowed mpv property (set): ${String(name)}`);
    }
    await this._ensureStarted();
    const result = await this.mpv.setProperty(name, value);
    if (name === 'speed') this.lastStatus.speed = Number(value) || 1;
    if (name === 'volume') this.lastStatus.volume = Number(value) || 0;
    if (name === 'mute') this.lastStatus.muted = !!value;
    if (name === 'pause') this.lastStatus.paused = !!value;
    if (['speed', 'volume', 'mute', 'pause'].includes(name)) this._emit();
    return result;
  }

  async setABLoop(inPoint, outPoint) {
    await this._ensureStarted();
    const a = Number.isFinite(inPoint) ? inPoint : 'no';
    const b = Number.isFinite(outPoint) ? outPoint : 'no';
    await this.mpv.setMultipleProperties({ 'ab-loop-a': a, 'ab-loop-b': b });
  }

  async getProperty(name) {
    if (!ALLOWED_GET_PROPS.has(name)) {
      throw new Error(`Disallowed mpv property (get): ${String(name)}`);
    }
    await this._ensureStarted();
    return this.mpv.getProperty(name);
  }

  dispose() {
    this.disposed = true;
    this.started = false;
    this.nextLoadId += 1;
    const mpv = this.mpv;
    this.mpv = null;
    if (!mpv) return Promise.resolve();

    return withTimeout(Promise.resolve(mpv.quit()), 2_000, 'mpv 종료 시간이 초과되었습니다').catch(() => {
      try {
        mpv.mpvPlayer?.kill('SIGKILL');
      } catch {
        // Process already exited.
      }
    });
  }
}

module.exports = { MpvController };
