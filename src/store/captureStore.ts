import { create } from 'zustand';

export interface Capture {
  id: string;
  /** Absolute path of the video this frame was captured from (scoping). */
  videoPath: string;
  path: string;
  time: number;
  frame: number | null;
  createdAt: number;
}

const KEY = 'offcut.player.captures';

function load(): Capture[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((c) => c && typeof c.path === 'string' && typeof c.videoPath === 'string')
      : [];
  } catch {
    return [];
  }
}

function persist(caps: Capture[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(caps));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

interface CaptureState {
  captures: Capture[];
  add: (c: Omit<Capture, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
  /** Clear all captures belonging to one video. */
  clearVideo: (videoPath: string) => void;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  captures: load(),
  add: (c) =>
    set((s) => {
      const next = [...s.captures, { ...c, id: uid(), createdAt: Date.now() }].sort((a, b) => {
        if (a.videoPath !== b.videoPath) return a.videoPath.localeCompare(b.videoPath);
        return a.time - b.time;
      });
      persist(next);
      return { captures: next };
    }),
  remove: (id) =>
    set((s) => {
      const next = s.captures.filter((c) => c.id !== id);
      persist(next);
      return { captures: next };
    }),
  clearVideo: (videoPath) =>
    set((s) => {
      const next = s.captures.filter((c) => c.videoPath !== videoPath);
      persist(next);
      return { captures: next };
    }),
}));
