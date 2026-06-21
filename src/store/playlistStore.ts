import { create } from 'zustand';

interface PlaylistState {
  /** Absolute path of the opened folder, or null when no folder is loaded. */
  folder: string | null;
  /** Absolute paths of the playable video files in the folder, sorted. */
  files: string[];
  setPlaylist: (folder: string, files: string[]) => void;
  clear: () => void;
}

export const usePlaylistStore = create<PlaylistState>((set) => ({
  folder: null,
  files: [],
  setPlaylist: (folder, files) => set({ folder, files }),
  clear: () => set({ folder: null, files: [] }),
}));
