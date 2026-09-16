import { useEffect, useRef, useState } from 'react';

// At ~15KB per JPEG, 300 entries ≈ 4.5MB worst-case. Re-insertion bumps the
// key to the end of Map's iteration order, so the oldest non-touched entry
// is at the front when we need to evict.
const CACHE_MAX = 300;

/**
 * Debounced seekbar thumbnail fetcher. Caches results bucketed by 1-second
 * intervals so the same hover position doesn't keep re-invoking ffmpeg.
 */
export function useSeekThumbnail(filename: string | null, hoverTime: number | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cacheRef = useRef(new Map<number, string>());
  const lastFileRef = useRef<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;

    if (lastFileRef.current !== filename) {
      cacheRef.current.clear();
      lastFileRef.current = filename;
      setDataUrl(null);
    }

    if (!filename || hoverTime === null) {
      setDataUrl(null);
      return;
    }

    const bucket = Math.round(hoverTime);
    const cache = cacheRef.current;
    const cached = cache.get(bucket);
    if (cached) {
      // Refresh recency: re-insert so this entry moves to the tail.
      cache.delete(bucket);
      cache.set(bucket, cached);
      setDataUrl(cached);
      return;
    }

    const timer = window.setTimeout(() => {
      window.offcut.preview
        .thumbnail({ input: filename, time: bucket, width: 192 })
        .then((url) => {
          if (token !== tokenRef.current) return;
          if (cache.size >= CACHE_MAX) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(bucket, url);
          setDataUrl(url);
        })
        .catch(() => {
          /* ignore — keep last good thumb */
        });
    }, 80);

    return () => {
      window.clearTimeout(timer);
      if (token === tokenRef.current) tokenRef.current += 1;
    };
  }, [filename, hoverTime]);

  return dataUrl;
}
