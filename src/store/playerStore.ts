import { create } from 'zustand';

interface PlayerState {
  filename: string | null;
  duration: number;
  position: number;
  paused: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  ffprobe: FfprobeInfo | null;

  // A-B loop / clip range
  inPoint: number | null;
  outPoint: number | null;
  loopAB: boolean;

  setStatus: (s: Partial<Omit<PlayerState, 'setStatus' | 'setFfprobe' | 'setInPoint' | 'setOutPoint' | 'setLoopAB' | 'clearAB'>>) => void;
  setFfprobe: (info: FfprobeInfo | null) => void;

  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  setLoopAB: (v: boolean) => void;
  clearAB: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  filename: null,
  duration: 0,
  position: 0,
  paused: true,
  speed: 1,
  volume: 100,
  muted: false,
  ffprobe: null,
  inPoint: null,
  outPoint: null,
  loopAB: false,
  setStatus: (s) => set(s),
  setFfprobe: (info) => set({ ffprobe: info }),
  setInPoint: (t) => set({ inPoint: t }),
  setOutPoint: (t) => set({ outPoint: t }),
  setLoopAB: (v) => set({ loopAB: v }),
  clearAB: () => set({ inPoint: null, outPoint: null, loopAB: false }),
}));
