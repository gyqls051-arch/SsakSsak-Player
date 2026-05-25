import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useCaptureStore } from '../store/captureStore';

/**
 * On file change: reset old metadata + captures + A-B markers, then kick off
 * an ffprobe call to repopulate info. Guards against re-running when the
 * filename hasn't actually changed (mpv may emit duplicate status updates).
 */
export function useFfprobeOnFile(filename: string | null, onError: (msg: string) => void) {
  const setFfprobe = usePlayerStore((s) => s.setFfprobe);
  const clearAB = usePlayerStore((s) => s.clearAB);
  const clearCaptures = useCaptureStore((s) => s.clear);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filename) {
      setFfprobe(null);
      clearCaptures();
      clearAB();
      loadedRef.current = null;
      return;
    }
    if (loadedRef.current === filename) return;
    loadedRef.current = filename;
    clearCaptures();
    clearAB();
    setFfprobe(null);
    window.offcut.ffprobe
      .info(filename)
      .then(setFfprobe)
      .catch((e) => onError(`ffprobe: ${e instanceof Error ? e.message : String(e)}`));
  }, [filename, setFfprobe, clearCaptures, clearAB, onError]);
}
