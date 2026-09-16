import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

/**
 * On file change: reset old metadata + A-B markers, then kick off an ffprobe
 * call to repopulate info. Captures are NOT cleared — they're scoped per video
 * (by videoPath) and persisted, so they reappear when you return to a file.
 */
export function useFfprobeOnFile(filename: string | null, onError: (msg: string) => void) {
  const setFfprobe = usePlayerStore((s) => s.setFfprobe);
  const clearAB = usePlayerStore((s) => s.clearAB);
  const tokenRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const token = ++tokenRef.current;
    setFfprobe(null);
    clearAB();
    if (!filename) return;

    window.offcut.ffprobe
      .info(filename)
      .then((info) => {
        if (token === tokenRef.current) setFfprobe(info);
      })
      .catch((e) => {
        if (token !== tokenRef.current) return;
        onErrorRef.current(`ffprobe: ${e instanceof Error ? e.message : String(e)}`);
      });

    return () => {
      if (token === tokenRef.current) tokenRef.current += 1;
    };
  }, [filename, setFfprobe, clearAB]);
}
