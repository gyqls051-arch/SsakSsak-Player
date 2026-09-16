import { useEffect } from 'react';

/** Pushes the renderer's A-B loop state into mpv as one atomic update. */
export function useABLoopSync(
  filename: string | null,
  loopAB: boolean,
  inPoint: number | null,
  outPoint: number | null,
) {
  useEffect(() => {
    if (!filename) return;
    const validRange = loopAB && inPoint !== null && outPoint !== null && outPoint > inPoint;
    void window.offcut.mpv
      .setABLoop(validRange ? inPoint : null, validRange ? outPoint : null)
      .catch(() => {
        /* file changes can dispose/restart mpv while this synchronization is in flight */
      });
  }, [filename, loopAB, inPoint, outPoint]);
}
