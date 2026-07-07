import { create } from 'zustand';

const SECRET_KEY = 'offcut.player.secret';
const CAPFMT_KEY = 'offcut.player.captureFormat';
const PLAYMODE_KEY = 'offcut.player.playMode';

export type CaptureFormat = 'png' | 'jpg';

/** 재생 종료 시 동작: 정지 / 다음 파일 / 전체 반복 / 한 파일 반복 */
export type PlayMode = 'none' | 'next' | 'loop-all' | 'loop-one';
const PLAY_MODES: PlayMode[] = ['none', 'next', 'loop-all', 'loop-one'];

function loadSecret(): boolean {
  try {
    return localStorage.getItem(SECRET_KEY) === '1';
  } catch {
    return false;
  }
}

function loadCaptureFormat(): CaptureFormat {
  try {
    return localStorage.getItem(CAPFMT_KEY) === 'jpg' ? 'jpg' : 'png';
  } catch {
    return 'png';
  }
}

function loadPlayMode(): PlayMode {
  try {
    const v = localStorage.getItem(PLAYMODE_KEY) as PlayMode | null;
    return v && PLAY_MODES.includes(v) ? v : 'next';
  } catch {
    return 'next';
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

interface SettingsState {
  /** Secret (incognito) mode: when on, opened files are NOT recorded to the
   *  recent list and the recent menu is hidden. */
  secret: boolean;
  toggleSecret: () => void;
  /** Format used when saving frame captures to disk. */
  captureFormat: CaptureFormat;
  setCaptureFormat: (f: CaptureFormat) => void;
  /** 재생 종료 시 동작 (4단 순환 토글). */
  playMode: PlayMode;
  cyclePlayMode: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  secret: loadSecret(),
  toggleSecret: () =>
    set((s) => {
      const next = !s.secret;
      persist(SECRET_KEY, next ? '1' : '0');
      return { secret: next };
    }),
  captureFormat: loadCaptureFormat(),
  setCaptureFormat: (f) =>
    set(() => {
      persist(CAPFMT_KEY, f);
      return { captureFormat: f };
    }),
  playMode: loadPlayMode(),
  cyclePlayMode: () =>
    set((s) => {
      const next = PLAY_MODES[(PLAY_MODES.indexOf(s.playMode) + 1) % PLAY_MODES.length];
      persist(PLAYMODE_KEY, next);
      return { playMode: next };
    }),
}));
