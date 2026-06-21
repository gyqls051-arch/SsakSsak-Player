import { create } from 'zustand';

const SECRET_KEY = 'offcut.player.secret';
const CAPFMT_KEY = 'offcut.player.captureFormat';

export type CaptureFormat = 'png' | 'jpg';

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
}));
