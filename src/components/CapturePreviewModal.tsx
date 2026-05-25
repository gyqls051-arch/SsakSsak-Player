import { useEffect } from 'react';
import type { Capture } from '../store/captureStore';
import { captureUrl, formatTimeMs } from '../utils/format';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

interface Props {
  capture: Capture | null;
  onClose: () => void;
  onRevealInFolder: (path: string) => void;
}

export default function CapturePreviewModal({ capture, onClose, onRevealInFolder }: Props) {
  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture, onClose]);

  if (!capture) return null;

  return (
    <div
      className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={captureUrl(capture.path, capture.createdAt)}
        alt=""
        className="max-w-[95vw] max-h-[92vh] object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs">
        <div className="bg-black/60 backdrop-blur px-3 py-1.5 rounded font-mono text-white/90">
          {formatTimeMs(capture.time)} · {basename(capture.path)}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRevealInFolder(capture.path);
            }}
            className="bg-black/60 hover:bg-black/80 backdrop-blur px-3 py-1.5 rounded text-white/90"
          >
            폴더 열기
          </button>
          <button
            onClick={onClose}
            className="bg-black/60 hover:bg-black/80 backdrop-blur w-8 h-8 rounded text-white/90"
            title="닫기 (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/40">
        클릭 / Esc 로 닫기
      </div>
    </div>
  );
}
