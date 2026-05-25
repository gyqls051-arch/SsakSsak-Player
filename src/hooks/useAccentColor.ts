import { useEffect, useState, useCallback } from 'react';

const KEY = 'offcut.player.accent';

export const ACCENT_PRESETS: Array<{ name: string; rgb: [number, number, number]; hoverRgb: [number, number, number] }> = [
  { name: '오렌지', rgb: [255, 107, 53], hoverRgb: [255, 133, 86] },
  { name: '시안', rgb: [56, 189, 248], hoverRgb: [125, 211, 252] },
  { name: '에메랄드', rgb: [16, 185, 129], hoverRgb: [52, 211, 153] },
  { name: '바이올렛', rgb: [167, 139, 250], hoverRgb: [192, 168, 252] },
  { name: '핑크', rgb: [244, 114, 182], hoverRgb: [249, 168, 212] },
  { name: '앰버', rgb: [251, 191, 36], hoverRgb: [253, 211, 94] },
  { name: '레드', rgb: [239, 68, 68], hoverRgb: [248, 113, 113] },
  { name: '슬레이트', rgb: [148, 163, 184], hoverRgb: [203, 213, 225] },
];

function applyAccent(rgb: [number, number, number], hoverRgb: [number, number, number]) {
  const root = document.documentElement;
  root.style.setProperty('--accent-rgb', rgb.join(' '));
  root.style.setProperty('--accent-hover-rgb', hoverRgb.join(' '));
}

function loadName(): string {
  try {
    return localStorage.getItem(KEY) ?? ACCENT_PRESETS[0].name;
  } catch {
    return ACCENT_PRESETS[0].name;
  }
}

// Module-level singleton so every useAccentColor consumer sees the same value
// (localStorage's `storage` event only fires across tabs, not same-window).
const subscribers = new Set<(name: string) => void>();
let currentName: string = loadName();

function broadcast(name: string) {
  currentName = name;
  const preset = ACCENT_PRESETS.find((p) => p.name === name) ?? ACCENT_PRESETS[0];
  applyAccent(preset.rgb, preset.hoverRgb);
  try { localStorage.setItem(KEY, name); } catch { /* ignore */ }
  subscribers.forEach((fn) => fn(name));
}

// Apply once at module load so the CSS vars are correct before first render.
broadcast(currentName);

export function useAccentColor() {
  const [activeName, setActiveName] = useState<string>(currentName);

  useEffect(() => {
    subscribers.add(setActiveName);
    setActiveName(currentName);
    return () => {
      subscribers.delete(setActiveName);
    };
  }, []);

  const setAccent = useCallback((name: string) => broadcast(name), []);

  const active = ACCENT_PRESETS.find((p) => p.name === activeName) ?? ACCENT_PRESETS[0];
  const accentRgb = active.rgb.join(',');

  return { activeName, setAccent, accentRgb };
}
