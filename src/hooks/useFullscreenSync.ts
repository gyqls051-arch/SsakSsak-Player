import { useEffect, useState } from 'react';

/** Subscribes to fullscreen-toggle events from the main process. */
export function useFullscreenSync() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => window.offcut.window.onFullscreenChange(setIsFullscreen), []);
  return isFullscreen;
}
