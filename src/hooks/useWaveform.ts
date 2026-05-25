import { useEffect, useState } from 'react';

/**
 * Generates a low-res audio waveform PNG via ffmpeg `showwavespic` once per
 * file. Failures are silent (some files have no audio track — that's fine).
 */
export function useWaveform(filename: string | null, accentRgb: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!filename) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setDataUrl(null);
    window.offcut.preview
      .waveform({ input: filename, width: 1600, height: 48, rgb: accentRgb })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [filename, accentRgb]);

  return dataUrl;
}
