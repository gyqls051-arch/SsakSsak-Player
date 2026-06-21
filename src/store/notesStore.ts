import { create } from 'zustand';

export interface Note {
  id: string;
  /** Absolute path of the video this note is anchored to. */
  videoPath: string;
  time: number;
  frame: number | null;
  text: string;
  createdAt: number;
}

const KEY = 'offcut.player.notes';

function load(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((n) => n && typeof n.videoPath === 'string' && typeof n.text === 'string')
      : [];
  } catch {
    return [];
  }
}

function persist(notes: Note[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.videoPath !== b.videoPath) return a.videoPath.localeCompare(b.videoPath);
    return a.time - b.time;
  });
}

interface NotesState {
  notes: Note[];
  /** Id of the most recently added note, so the UI can focus its editor. */
  lastAddedId: string | null;
  add: (n: Omit<Note, 'id' | 'createdAt'>) => string;
  update: (id: string, text: string) => void;
  remove: (id: string) => void;
  clearVideo: (videoPath: string) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: load(),
  lastAddedId: null,
  add: (n) => {
    const id = uid();
    set((s) => {
      const next = sortNotes([...s.notes, { ...n, id, createdAt: Date.now() }]);
      persist(next);
      return { notes: next, lastAddedId: id };
    });
    return id;
  },
  update: (id, text) =>
    set((s) => {
      const next = s.notes.map((nt) => (nt.id === id ? { ...nt, text } : nt));
      persist(next);
      return { notes: next };
    }),
  remove: (id) =>
    set((s) => {
      const next = s.notes.filter((nt) => nt.id !== id);
      persist(next);
      return { notes: next };
    }),
  clearVideo: (videoPath) =>
    set((s) => {
      const next = s.notes.filter((nt) => nt.videoPath !== videoPath);
      persist(next);
      return { notes: next };
    }),
}));
