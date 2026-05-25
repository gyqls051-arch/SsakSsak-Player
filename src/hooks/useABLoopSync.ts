import { useEffect } from 'react';

/**
 * Pushes the renderer's A-B loop state into mpv's native `ab-loop-a` /
 * `ab-loop-b` properties so playback loops at the OS-level (no JS polling).
 */
export function useABLoopSync(
  filename: string | null,
  loopAB: boolean,
  inPoint: number | null,
  outPoint: number | null,
) {
  useEffect(() => {
    if (!filename) return;
    if (loopAB && inPoint !== null && outPoint !== null && outPoint > inPoint) {
      window.offcut.mpv.setProperty('ab-loop-a', inPoint);
      window.offcut.mpv.setProperty('ab-loop-b', outPoint);
    } else {
      window.offcut.mpv.setProperty('ab-loop-a', 'no');
      window.offcut.mpv.setProperty('ab-loop-b', 'no');
    }
  }, [filename, loopAB, inPoint, outPoint]);
}
