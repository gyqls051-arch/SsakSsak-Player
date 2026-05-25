import { useEffect, useRef } from 'react';

/**
 * Observes the rendered video-area div and pushes its bounds to the main
 * process so the embedded mpv child window stays in sync. Also reports the
 * "overlay open" state so main knows to keep the video hidden while a modal
 * is visible.
 */
export function useVideoEmbed(filename: string | null, overlayOpen: boolean, syncTrigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef(overlayOpen);

  // Keep overlayRef live so the ResizeObserver callback can short-circuit.
  useEffect(() => {
    overlayRef.current = overlayOpen;
    void window.offcut.video.setOverlayActive(overlayOpen);
  }, [overlayOpen]);

  // Push/clear bounds on file change + overlay toggle.
  useEffect(() => {
    if (overlayOpen || !filename) {
      window.offcut.video.hide();
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.offcut.video.setBounds({
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    });
  }, [overlayOpen, filename, syncTrigger]);

  // Live ResizeObserver — fires whenever the video area changes size, e.g.
  // when the side panel toggles or the window resizes.
  useEffect(() => {
    if (!filename) {
      window.offcut.video.hide();
      return;
    }
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      if (overlayRef.current) return;
      const r = el.getBoundingClientRect();
      window.offcut.video.setBounds({
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      });
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [filename, syncTrigger]);

  return ref;
}
