export {};

declare global {
  interface MpvStatus {
    filename: string | null;
    duration: number;
    position: number;
    paused: boolean;
    speed: number;
    volume: number;
    muted: boolean;
  }

  interface CaptureResult {
    path: string;
    videoPath: string;
    time: number;
    frame: number | null;
  }

  interface TranscodePreset {
    key: string;
    label: string;
    ext: string;
    description: string;
    needsDuration: boolean;
    needsInputBitrate: boolean;
  }

  interface TranscodeStartParams {
    input: string;
    output: string;
    presetKey: string;
    duration?: number;
    inputBitrate?: number;
  }

  interface TranscodeProgress {
    jobId: string;
    seconds: number;
    ratio: number;
  }

  interface FfprobeStream {
    index: number;
    codec_name?: string;
    codec_long_name?: string;
    codec_type?: 'video' | 'audio' | 'subtitle' | string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    color_space?: string;
    color_primaries?: string;
    color_transfer?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    duration?: string;
    tags?: Record<string, string>;
  }

  interface FfprobeFormat {
    filename?: string;
    nb_streams?: number;
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  }

  interface FfprobeInfo {
    streams: FfprobeStream[];
    format: FfprobeFormat;
  }

  interface OffcutAPI {
    openVideoDialog: () => Promise<string | null>;
    openSubtitle: () => Promise<string | null>;
    openFolder: () => Promise<{ folder: string; files: string[] } | null>;
    chooseDirectory: (defaultPath?: string) => Promise<string | null>;
    saveFileDialog: (opts?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | null>;
    mpv: {
      open: (filePath: string) => Promise<{ ok: boolean }>;
      command: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      getTracks: () => Promise<
        Array<{
          id: number;
          type: string;
          title: string;
          lang: string;
          codec: string;
          selected: boolean;
          external: boolean;
        }>
      >;
      setProperty: (name: string, value: unknown) => Promise<unknown>;
      getProperty: (name: string) => Promise<unknown>;
      onStatus: (handler: (status: MpvStatus) => void) => () => void;
    };
    capture: {
      now: (opts?: { format?: 'png' | 'jpg' }) => Promise<CaptureResult>;
      copyCurrent: () => Promise<{ ok: boolean }>;
      copyFile: (path: string) => Promise<{ ok: boolean }>;
      startDrag: (path: string) => Promise<void>;
      saveImage: (dataUrl: string, outPath: string) => Promise<{ path: string }>;
      getDir: () => Promise<string>;
      setDir: (dir: string) => Promise<string | null>;
      reveal: (path: string) => Promise<unknown>;
    };
    ffprobe: {
      info: (filePath: string) => Promise<FfprobeInfo>;
    };
    transcode: {
      presets: () => Promise<TranscodePreset[]>;
      start: (params: TranscodeStartParams) => Promise<{ jobId: string; output: string }>;
      cancel: () => Promise<boolean>;
      onProgress: (handler: (data: TranscodeProgress) => void) => () => void;
    };
    video: {
      setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
      hide: () => Promise<void>;
      setOverlayActive: (active: boolean) => Promise<void>;
    };
    window: {
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      onFullscreenChange: (handler: (value: boolean) => void) => () => void;
    };
    menu: {
      showVideo: (ctx: { paused: boolean; canExtract: boolean }) => Promise<void>;
      onAction: (handler: (action: string) => void) => () => void;
    };
    markers: {
      exportXmp: (params: {
        videoPath: string;
        captures: Array<{ time: number; name?: string }>;
        fps: number;
      }) => Promise<string>;
    };
    notes: {
      exportText: (content: string, outPath: string) => Promise<{ path: string }>;
    };
    clip: {
      extract: (params: {
        input: string;
        output: string;
        start: number;
        end: number;
      }) => Promise<{ path: string }>;
      export: (params: {
        input: string;
        output: string;
        start: number;
        end: number;
      }) => Promise<{ path: string }>;
    };
    preview: {
      thumbnail: (params: { input: string; time: number; width?: number }) => Promise<string>;
      waveform: (params: {
        input: string;
        width?: number;
        height?: number;
        rgb?: string;
      }) => Promise<string>;
      overlayShow: (params: {
        dataUrl: string;
        label: string;
        centerX: number;
        bottomY: number;
      }) => Promise<void>;
      overlayHide: () => Promise<void>;
    };
    shell: {
      openPath: (path: string) => Promise<string>;
      openExternal: (url: string) => Promise<void>;
    };
    app: {
      confirmQuit: () => Promise<void>;
      onExitAd: (handler: () => void) => () => void;
    };
    files: {
      pathForFile: (file: File) => string | null;
    };
  }

  interface Window {
    offcut: OffcutAPI;
  }
}
