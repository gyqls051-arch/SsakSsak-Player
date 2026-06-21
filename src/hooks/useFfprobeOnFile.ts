import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

/**
 * On file change: reset old metadata + A-B markers, then kick off an ffprobe
 * call to repopulate info. Captures are NOT cleared — they're scoped per video
 * (by videoPath) and persisted, so they reappear when you return to a file.
 * Guards against re-running when the filename hasn't actually changed (mpv may
 * emit duplicate status updates).
 */
export function useFfprobeOnFile(filename: string | null, onError: (msg: string) => void) {
  const setFfprobe = usePlayerStore((s) => s.setFfprobe);
  const clearAB = usePlayerStore((s) => s.clearAB);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filename) {
      setFfprobe(null);
      clearAB();
      loadedRef.current = null;
      return;
    }
    if (loadedRef.current === filename) return;
    loadedRef.current = filename;
    clearAB();
    setFfprobe(null);
    window.offcut.ffprobe
      .info(filename)
      .then(setFfprobe)
      .catch((e) => onError(`ffprobe: ${e instanceof Error ? e.message : String(e)}`));
  }, [filename, setFfprobe, clearAB, onError]);
}
