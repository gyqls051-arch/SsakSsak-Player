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
  enabled?: boolean;
  onOpenFile: () => void;
  onCapture: () => void;
  onToggleHelp: () => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onToggleLoopAB: () => void;
  onClearAB: () => void;
  onExtractClip: () => void;
  onAddNote: () => void;
  /** 자막 싱크 조절 (delta 초, null=리셋) */
  onSubDelay: (delta: number | null) => void;
  /** 오디오 싱크 조절 (delta 초, null=리셋) */
  onAudioDelay: (delta: number | null) => void;
  /** 항상 위 토글 (Ctrl+T) */
  onTogglePin: () => void;
  /** 이전(-1)/다음(+1) 챕터 이동 (PgUp/PgDn) */
  onChapterJump: (dir: 1 | -1) => void;
}

const WIDGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="tree"]',
  '[role="treeitem"]',
].join(',');

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
      if (e.defaultPrevented || optsRef.current.enabled === false) return;
      const target = e.target;
      if (target instanceof Element && target.closest(WIDGET_SELECTOR)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const code = e.code;
      const key = e.key;
      const runOnce = (action: () => void) => {
        e.preventDefault();
        if (!e.repeat) action();
      };

      // ---- Modifier combos first ----
      if (ctrl && !alt) {
        switch (code) {
          case 'KeyO':
            if (!shift) runOnce(optsRef.current.onOpenFile);
            return;
          case 'KeyS':
            if (shift) runOnce(optsRef.current.onExtractClip);
            return;
          case 'KeyE':
            runOnce(optsRef.current.onCapture);
            return;
          case 'KeyR':
            runOnce(optsRef.current.onToggleLoopAB);
            return;
          case 'KeyT':
            runOnce(optsRef.current.onTogglePin);
            return;
          case 'ArrowLeft':
            e.preventDefault();
            window.offcut.mpv.command('seek', -5, 'relative');
            return;
          case 'ArrowRight':
            e.preventDefault();
            window.offcut.mpv.command('seek', 5, 'relative');
            return;
        }
        return;
      }

      // 명시적으로 처리하지 않는 Alt 콤보는 평문 바인딩으로 흘리지 않는다.
      if (alt && !ctrl) {
        if (key === 'Enter') {
          runOnce(() => void window.offcut.window.toggleFullscreen());
          return;
        }
        switch (code) {
          case 'KeyZ':
            runOnce(() => optsRef.current.onSubDelay(null));
            return;
          case 'KeyD':
            runOnce(() => optsRef.current.onAudioDelay(null));
            return;
        }
        return;
      }
      if (ctrl || alt) return;

      // ---- Global keys (work without a file) ----
      if (key === 'F1' || key === '?' || (shift && code === 'Slash')) {
        runOnce(optsRef.current.onToggleHelp);
        return;
      }

      const { filename, speed, volume, duration } = usePlayerStore.getState();
      if (!filename) return;
      const cmd = window.offcut.mpv.command;

      // ---- Special keys (use e.key, IME-safe) ----
      switch (key) {
        case ' ':
          runOnce(() => void cmd('togglePause'));
          return;
        case 'Enter':
          runOnce(() => void window.offcut.window.toggleFullscreen());
          return;
        case 'Escape':
          runOnce(() => {
            void window.offcut.window
              .isFullscreen()
              .then((isFs) => {
                if (isFs) return window.offcut.window.toggleFullscreen();
              })
              .catch(() => {});
          });
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (shift) cmd('seek', -1, 'relative');
          else cmd('frameBackStep');
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (shift) cmd('seek', 1, 'relative');
          else cmd('frameStep');
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
          if (shift) runOnce(optsRef.current.onClearAB);
          return;
        case 'PageUp':
          runOnce(() => optsRef.current.onChapterJump(-1));
          return;
        case 'PageDown':
          runOnce(() => optsRef.current.onChapterJump(1));
          return;
      }

      // ---- Letter keys via e.code (layout-independent) ----
      switch (code) {
        case 'KeyK':
          runOnce(() => void cmd('togglePause'));
          return;
        case 'KeyJ':
          e.preventDefault();
          cmd('seek', shift ? -1 : -5, 'relative');
          return;
        case 'KeyL':
          e.preventDefault();
          cmd('seek', shift ? 1 : 5, 'relative');
          return;
        case 'KeyF':
          runOnce(() => void window.offcut.window.toggleFullscreen());
          return;
        case 'KeyM':
          runOnce(() => void cmd('mute'));
          return;
        case 'KeyN':
          runOnce(optsRef.current.onAddNote);
          return;
        case 'KeyS':
          runOnce(optsRef.current.onCapture);
          return;
        case 'KeyI':
        case 'KeyR':
          runOnce(optsRef.current.onSetInPoint);
          return;
        case 'KeyO':
        case 'KeyT':
          runOnce(optsRef.current.onSetOutPoint);
          return;
        case 'KeyC':
          runOnce(() => void cmd('speed', nextSpeed(speed, 1)));
          return;
        case 'KeyX':
          runOnce(() => void cmd('speed', nextSpeed(speed, -1)));
          return;
        case 'KeyV':
          runOnce(() => void cmd('speed', 1));
          return;
        case 'KeyZ':
          runOnce(() => optsRef.current.onSubDelay(shift ? 0.1 : -0.1));
          return;
        case 'KeyD':
          runOnce(() => optsRef.current.onAudioDelay(shift ? 0.1 : -0.1));
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
          runOnce(() => void cmd('speed', nextSpeed(speed, -1)));
          return;
        case 'BracketRight':
          runOnce(() => void cmd('speed', nextSpeed(speed, 1)));
          return;
      }

      // ---- Digit 0-9: percent jump (use e.code, works regardless of IME) ----
      const digitMatch = /^Digit(\d)$/.exec(code);
      if (digitMatch && duration > 0) {
        runOnce(() => {
          const pct = parseInt(digitMatch[1], 10) * 10;
          void cmd('seek', (duration * pct) / 100, 'absolute');
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export { SPEED_STEPS };
