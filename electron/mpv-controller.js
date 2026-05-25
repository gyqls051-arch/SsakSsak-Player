const NodeMpv = require('node-mpv');

class MpvController {
  /**
   * @param {{ mpvBinary: string, onStatus?: (s: object) => void }} opts
   */
  constructor(opts) {
    this.opts = opts;
    /** @type {InstanceType<typeof NodeMpv> | null} */
    this.mpv = null;
    this.started = false;
    this.lastStatus = {
      filename: null,
      duration: 0,
      position: 0,
      paused: true,
      speed: 1,
      volume: 100,
      muted: false,
    };
  }

  async _ensureStarted() {
    if (this.started && this.mpv) return;
    const args = [
      '--keep-open=always',
      '--idle=yes',
      '--no-input-default-bindings',
      '--input-vo-keyboard=no',
      '--osc=no',
      '--osd-bar=no',
      '--no-border',
      // auto-safe avoids HW decoders whose output surface doesn't blend
      // with Chromium's compositor (auto/d3d11va can show a black frame).
      '--hwdec=auto-safe',
      // gpu-next composites cleanly inside a foreign HWND (Chromium).
      '--vo=gpu-next',
    ];
    // Note: capture is done via ffmpeg in main.js, so mpv's screenshot
    // options don't matter here — keeping mpv args minimal.
    if (this.opts.wid) {
      args.push(`--wid=${this.opts.wid}`);
    } else {
      args.push('--force-window=yes', '--title=OFFCUT Player — Video');
    }
    this.mpv = new NodeMpv(
      {
        binary: this.opts.mpvBinary,
        audio_only: false,
        time_update: 0.1,
        debug: false,
        verbose: false,
        auto_restart: true,
      },
      args,
    );
    await this.mpv.start();
    this._wireEvents();
    this.started = true;
  }

  _emit() {
    this.opts.onStatus?.({ ...this.lastStatus });
  }

  _wireEvents() {
    if (!this.mpv) return;

    this.mpv.on('started', () => {
      this.lastStatus.paused = false;
      this._emit();
    });
    this.mpv.on('stopped', () => {
      this.lastStatus.paused = true;
      this._emit();
    });
    this.mpv.on('paused', () => {
      this.lastStatus.paused = true;
      this._emit();
    });
    this.mpv.on('resumed', () => {
      this.lastStatus.paused = false;
      this._emit();
    });
    this.mpv.on('timeposition', (sec) => {
      this.lastStatus.position = Number(sec) || 0;
      this._emit();
    });
    this.mpv.on('status', (status) => {
      if (!status || typeof status !== 'object') return;
      const { property, value } = status;
      switch (property) {
        case 'duration':
          this.lastStatus.duration = Number(value) || 0;
          break;
        case 'path':
          // mpv 'path' is the absolute file path (mpv 'filename' is basename only)
          if (typeof value === 'string' && value) this.lastStatus.filename = value;
          break;
        case 'filename':
          // ignore — basename only; we keep the absolute path set in open()/'path'
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
        default:
          return;
      }
      this._emit();
    });
  }

  async open(filePath) {
    await this._ensureStarted();
    await this.mpv.load(filePath, 'replace');
    this.lastStatus.filename = filePath;
    this.lastStatus.position = 0;
    try {
      await this.mpv.play();
      const dur = await this.mpv.getDuration();
      if (dur) this.lastStatus.duration = dur;
      const sp = await this.mpv.getProperty('speed');
      if (sp) this.lastStatus.speed = Number(sp) || 1;
    } catch {
      // Property reads can race with load completion — duration/speed will
      // arrive via the property observer instead. Safe to swallow.
    }
    this._emit();
  }

  async command(cmd, ...args) {
    await this._ensureStarted();
    switch (cmd) {
      case 'play':
        return this.mpv.play();
      case 'pause':
        return this.mpv.pause();
      case 'togglePause':
        return this.mpv.togglePause();
      case 'stop':
        return this.mpv.stop();
      case 'seek':
        return this.mpv.seek(Number(args[0]), args[1] || 'absolute');
      case 'frameStep':
        return this.mpv.command('frame-step', []);
      case 'frameBackStep':
        return this.mpv.command('frame-back-step', []);
      case 'screenshot':
        return this.mpv.command('screenshot', ['video']);
      case 'toggleFullscreen':
        return this.mpv.toggleFullscreen();
      case 'speed':
        return this.mpv.speed(Number(args[0]));
      case 'volume':
        return this.mpv.volume(Number(args[0]));
      case 'mute':
        return this.mpv.mute();
      default:
        return this.mpv.command(cmd, args.map((a) => String(a)));
    }
  }

  async screenshotToFile(outputPath) {
    await this._ensureStarted();
    // mpv prefers forward slashes; backslashes work but can trip the JSON IPC.
    // 'video' flag = source resolution, no subtitles / OSD.
    const normalized = outputPath.replace(/\\/g, '/');
    return this.mpv.command('screenshot-to-file', [normalized, 'video']);
  }

  async setProperty(name, value) {
    await this._ensureStarted();
    return this.mpv.setProperty(name, value);
  }

  async getProperty(name) {
    await this._ensureStarted();
    return this.mpv.getProperty(name);
  }

  dispose() {
    if (this.mpv) {
      try {
        this.mpv.quit();
      } catch {
        // mpv process may already be gone; safe to ignore.
      }
      this.mpv = null;
      this.started = false;
    }
  }
}

module.exports = { MpvController };
