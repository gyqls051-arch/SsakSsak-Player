import { useState, useEffect, useRef } from 'react';
import { useRecentFiles } from '../hooks/useRecentFiles';
import { useSettingsStore } from '../store/settingsStore';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export default function RecentFilesMenu({ onOpen }: { onOpen: (p: string) => void }) {
  const { files, remove, clear } = useRecentFiles();
  const secret = useSettingsStore((s) => s.secret);
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

  // In secret mode the recent list is hidden entirely (no history shown).
  if (secret || files.length === 0) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
      >
        최근 ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-bg-elevated border border-white/10 rounded shadow-lg overflow-hidden z-50">
          <div className="max-h-80 overflow-y-auto">
            {files.map((f) => (
              <div
                key={f}
                className="group flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer"
                onClick={() => {
                  onOpen(f);
                  setOpen(false);
                }}
                title={f}
              >
                <span className="flex-1 truncate text-xs">{basename(f)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(f);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white text-xs px-1"
                  title="목록에서 제거"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 px-3 py-1.5">
            <button onClick={clear} className="text-xs text-white/40 hover:text-white">
              전체 지우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
