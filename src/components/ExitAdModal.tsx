import { useEffect, useState } from 'react';
import { PROMOS } from '../data/promos';
import PromoBanner from './PromoBanner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExitAdModal({ open, onClose }: Props) {
  // Pick a promo when the popup opens (rotates across launches).
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open) setIdx(Math.floor(Math.random() * PROMOS.length));
  }, [open]);

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
        <div className="px-5 pt-4 pb-2 text-center">
          <div className="text-sm font-semibold text-white">싹싹김치 플레이어를 종료할까요?</div>
          <div className="text-xs text-white/40 mt-1">이런 도구는 어떠세요?</div>
        </div>
        <div className="px-5 pb-4">
          <PromoBanner promo={PROMOS[idx]} variant="card" />
        </div>
        <div className="flex border-t border-white/5">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm text-white/70 hover:bg-white/5"
          >
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
