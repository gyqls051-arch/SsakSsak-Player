import { create } from 'zustand';

export interface Chapter {
  title: string;
  time: number;
}

interface PlayerState extends MpvStatus {
  ffprobe: FfprobeInfo | null;
  /** 현재 파일의 챕터 목록 (없으면 빈 배열). */
  chapters: Chapter[];

  // A-B loop / clip range
  inPoint: number | null;
  outPoint: number | null;
  loopAB: boolean;

  setStatus: (status: MpvStatus) => void;
  setFfprobe: (info: FfprobeInfo | null) => void;
  setChapters: (c: Chapter[]) => void;

  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  setLoopAB: (v: boolean) => void;
  clearAB: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
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
  ffprobe: null,
  chapters: [],
  inPoint: null,
  outPoint: null,
  loopAB: false,
  setStatus: (status) =>
    set((state) => {
      if (status.loadId < state.loadId) return {};
      return status;
    }),
  setFfprobe: (info) => set({ ffprobe: info }),
  setChapters: (c) => set({ chapters: c }),
  setInPoint: (t) => set({ inPoint: t }),
  setOutPoint: (t) => set({ outPoint: t }),
  setLoopAB: (v) => set({ loopAB: v }),
  clearAB: () => set({ inPoint: null, outPoint: null, loopAB: false }),
}));
