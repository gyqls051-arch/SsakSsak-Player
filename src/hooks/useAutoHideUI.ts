import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';

const HIDE_AFTER_MS = 2500;

/**
 * Auto-hides the header / controls while playback is running and the mouse
 * is idle. Returns whether the UI should currently be visible.
 */
export function useAutoHideUI(filename: string | null, paused: boolean) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!filename) {
      setVisible(true);
      return;
    }
    const show = () => {
      setVisible(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!usePlayerStore.getState().paused) setVisible(false);
      }, HIDE_AFTER_MS);
    };
    show();
    window.addEventListener('mousemove', show);
    return () => {
      window.removeEventListener('mousemove', show);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [filename]);

  useEffect(() => {
    if (paused) setVisible(true);
  }, [paused]);

  return visible;
}
