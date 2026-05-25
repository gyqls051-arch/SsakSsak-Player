import { useEffect, useRef, useState } from 'react';
import { ACCENT_PRESETS, useAccentColor } from '../hooks/useAccentColor';

export default function AccentPicker() {
  const { activeName, setAccent } = useAccentColor();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = ACCENT_PRESETS.find((p) => p.name === activeName) ?? ACCENT_PRESETS[0];
  const swatchStyle = (rgb: [number, number, number]) => ({ background: `rgb(${rgb.join(',')})` });

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 rounded-full border-2 border-white/20 hover:border-white/40 transition"
        style={swatchStyle(active.rgb)}
        title={`강조 색: ${active.name}`}
      />
      {open && (
        <div className="absolute right-0 top-full mt-1 p-3 bg-bg-elevated border border-white/10 rounded-lg shadow-2xl z-50">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">강조 색</div>
          <div className="grid grid-cols-4 gap-2">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setAccent(p.name);
                  setOpen(false);
                }}
                className={`w-8 h-8 rounded-full border-2 transition hover:scale-110 ${
                  p.name === activeName ? 'border-white' : 'border-white/10'
                }`}
                style={swatchStyle(p.rgb)}
                title={p.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
