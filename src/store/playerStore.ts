import { create } from 'zustand';

export interface Chapter {
  title: string;
  time: number;
}

interface PlayerState {
  filename: string | null;
  duration: number;
  position: number;
  paused: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  eofReached: boolean;
  ffprobe: FfprobeInfo | null;
  /** 현재 파일의 챕터 목록 (없으면 빈 배열). */
  chapters: Chapter[];

  // A-B loop / clip range
  inPoint: number | null;
  outPoint: number | null;
  loopAB: boolean;

  setStatus: (s: Partial<Omit<PlayerState, 'setStatus' | 'setFfprobe' | 'setChapters' | 'setInPoint' | 'setOutPoint' | 'setLoopAB' | 'clearAB'>>) => void;
  setFfprobe: (info: FfprobeInfo | null) => void;
  setChapters: (c: Chapter[]) => void;

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
  eofReached: false,
  ffprobe: null,
  chapters: [],
  inPoint: null,
  outPoint: null,
  loopAB: false,
  setStatus: (s) => set(s),
  setFfprobe: (info) => set({ ffprobe: info }),
  setChapters: (c) => set({ chapters: c }),
  setInPoint: (t) => set({ inPoint: t }),
  setOutPoint: (t) => set({ outPoint: t }),
  setLoopAB: (v) => set({ loopAB: v }),
  clearAB: () => set({ inPoint: null, outPoint: null, loopAB: false }),
}));
