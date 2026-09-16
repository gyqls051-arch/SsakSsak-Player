import { useEffect, useState } from 'react';

/** Subscribes to fullscreen events and reads the current main-process state. */
export function useFullscreenSync() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    let eventVersion = 0;
    const unsubscribe = window.offcut.window.onFullscreenChange((value) => {
      eventVersion += 1;
      if (active) setIsFullscreen(value);
    });
    const queryVersion = eventVersion;

    window.offcut.window
      .isFullscreen()
      .then((value) => {
        if (active && eventVersion === queryVersion) setIsFullscreen(value);
      })
      .catch(() => {
        /* retain the event-derived/default state */
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return isFullscreen;
}
