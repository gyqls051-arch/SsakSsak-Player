import { create } from 'zustand';

export interface Capture {
  id: string;
  path: string;
  time: number;
  frame: number | null;
  createdAt: number;
}

interface CaptureState {
  captures: Capture[];
  add: (c: Omit<Capture, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  captures: [],
  add: (c) =>
    set((s) => ({
      captures: [...s.captures, { ...c, id: uid(), createdAt: Date.now() }].sort(
        (a, b) => a.time - b.time,
      ),
    })),
  remove: (id) => set((s) => ({ captures: s.captures.filter((c) => c.id !== id) })),
  clear: () => set({ captures: [] }),
}));
