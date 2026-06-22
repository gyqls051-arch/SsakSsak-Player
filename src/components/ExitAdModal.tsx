import { useEffect } from 'react';
import { EXIT_BANNER } from '../data/promos';
import PromoBanner from './PromoBanner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExitAdModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="w-[420px] max-w-[92vw] bg-bg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4">
          <PromoBanner banner={EXIT_BANNER} rounded="rounded-lg" />
        </div>
        <div className="flex border-t border-white/5">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-white/70 hover:bg-white/5">
            계속 사용
          </button>
          <button
            onClick={() => window.offcut.app.confirmQuit()}
            className="flex-1 py-3 text-sm font-semibold text-white bg-white/5 hover:bg-white/10"
          >
            종료
          </button>
        </div>
      </div>
    </div>
  );
}
