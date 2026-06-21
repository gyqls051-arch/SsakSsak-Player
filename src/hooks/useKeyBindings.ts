import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function nextSpeed(current: number, dir: 1 | -1): number {
  let idx = SPEED_STEPS.findIndex((s) => Math.abs(s - current) < 1e-3);
  if (idx < 0) {
    idx = SPEED_STEPS.findIndex((s) => s >= current);
    if (idx < 0) idx = SPEED_STEPS.length - 1;
  }
  const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx + dir));
  return SPEED_STEPS[next];
}

interface Opts {
  onOpenFile: () => void;
  onCapture: () => void;
  onToggleHelp: () => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onToggleLoopAB: () => void;
  onClearAB: () => void;
  onExtractClip: () => void;
  onAddNote: () => void;
}

/**
 * Key resolution uses `event.code` (physical key, layout-independent) for letter
 * keys so the shortcuts work even when the user is in a Korean IME mode. Special
 * keys (Space / Enter / Arrow* / F1) use `event.key` which is unaffected by IME.
 */
export function useKeyBindings(opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const code = e.code;
      const key = e.key;

      // ---- Modifier combos first ----
      if (ctrl && !alt) {
        switch (code) {
          case 'KeyO':
            if (!shift) {
              e.preventDefault();
              optsRef.current.onOpenFile();
            }
            return;
          case 'KeyS':
            if (shift) {
              e.preventDefault();
              optsRef.current.onExtractClip();
            }
            return;
          case 'KeyE':
            e.preventDefault();
            optsRef.current.onCapture();
            return;
          case 'KeyR':
            e.preventDefault();
            optsRef.current.onToggleLoopAB();
            return;
          case 'ArrowLeft':
            e.preventDefault();
            window.offcut.mpv.command('frameBackStep');
            return;
          case 'ArrowRight':
            e.preventDefault();
            window.offcut.mpv.command('frameStep');
            return;
        }
        return;
      }

      // Alt+Enter = fullscreen (Windows convention)
      if (alt && key === 'Enter') {
        e.preventDefault();
        window.offcut.window.toggleFullscreen();
        return;
      }

      // ---- Global keys (work without a file) ----
      if (key === 'F1' || key === '?' || (shift && code === 'Slash')) {
        e.preventDefault();
        optsRef.current.onToggleHelp();
        return;
      }

      const { filename, speed, volume, duration } = usePlayerStore.getState();
      if (!filename) return;
      const cmd = window.offcut.mpv.command;

      // ---- Special keys (use e.key, IME-safe) ----
      switch (key) {
        case ' ':
          e.preventDefault();
          cmd('togglePause');
          return;
        case 'Enter':
          e.preventDefault();
          window.offcut.window.toggleFullscreen();
          return;
        case 'Escape':
          e.preventDefault();
          window.offcut.window.isFullscreen().then((isFs) => {
            if (isFs) window.offcut.window.toggleFullscreen();
          });
          return;
        case 'ArrowLeft':
          e.preventDefault();
          cmd('seek', shift ? -1 : -5, 'relative');
          return;
        case 'ArrowRight':
          e.preventDefault();
          cmd('seek', shift ? 1 : 5, 'relative');
          return;
        case 'ArrowUp':
          e.preventDefault();
          cmd('volume', Math.min(150, volume + 5));
          return;
        case 'ArrowDown':
          e.preventDefault();
          cmd('volume', Math.max(0, volume - 5));
          return;
        case 'Backspace':
          if (shift) {
            e.preventDefault();
            optsRef.current.onClearAB();
          }
          return;
      }

      // ---- Letter keys via e.code (layout-independent) ----
      switch (code) {
        case 'KeyK':
          e.preventDefault();
          cmd('togglePause');
          return;
        case 'KeyJ':
          e.preventDefault();
          cmd('seek', shift ? -1 : -5, 'relative');
          return;
        case 'KeyL':
          e.preventDefault();
          cmd('seek', shift ? 1 : 5, 'relative'); // YouTube 패턴: 5초 앞
          return;
        case 'KeyF':
          e.preventDefault();
          window.offcut.window.toggleFullscreen();
          return;
        case 'KeyM':
          e.preventDefault();
          cmd('mute');
          return;
        case 'KeyN':
          e.preventDefault();
          optsRef.current.onAddNote();
          return;
        case 'KeyS':
          e.preventDefault();
          optsRef.current.onCapture();
          return;
        case 'KeyI':
        case 'KeyR': // PotPlayer alias
          e.preventDefault();
          optsRef.current.onSetInPoint();
          return;
        case 'KeyO':
        case 'KeyT': // PotPlayer alias
          e.preventDefault();
          optsRef.current.onSetOutPoint();
          return;
        case 'KeyC':
          e.preventDefault();
          cmd('speed', nextSpeed(speed, 1));
          return;
        case 'KeyX':
          e.preventDefault();
          cmd('speed', nextSpeed(speed, -1));
          return;
        case 'KeyV':
          e.preventDefault();
          cmd('speed', 1);
          return;
      }

      // ---- Symbol keys (use e.code; works on any layout) ----
      switch (code) {
        case 'Comma':
          e.preventDefault();
          cmd('frameBackStep');
          return;
        case 'Period':
          e.preventDefault();
          cmd('frameStep');
          return;
        case 'BracketLeft':
          e.preventDefault();
          cmd('speed', nextSpeed(speed, -1));
          return;
        case 'BracketRight':
          e.preventDefault();
          cmd('speed', nextSpeed(speed, 1));
          return;
      }

      // ---- Digit 0-9: percent jump (use e.code, works regardless of IME) ----
      const digitMatch = /^Digit(\d)$/.exec(code);
      if (digitMatch && duration > 0) {
        e.preventDefault();
        const pct = parseInt(digitMatch[1], 10) * 10;
        cmd('seek', (duration * pct) / 100, 'absolute');
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export { SPEED_STEPS };
