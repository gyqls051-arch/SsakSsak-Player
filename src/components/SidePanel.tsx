import { useState } from 'react';
import InfoTab from './InfoTab';
import CapturesTab from './CapturesTab';
import { useCaptureStore, type Capture } from '../store/captureStore';

interface Props {
  onPreviewCapture: (c: Capture) => void;
  onExportXmp: () => void;
}

export default function SidePanel({ onPreviewCapture, onExportXmp }: Props) {
  const [tab, setTab] = useState<'info' | 'captures'>('info');
  const captureCount = useCaptureStore((s) => s.captures.length);

  return (
    <aside className="w-80 shrink-0 border-l border-white/5 bg-bg-surface flex flex-col">
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setTab('info')}
          className={`flex-1 py-2.5 text-xs transition ${
            tab === 'info'
              ? 'text-white border-b-2 border-accent -mb-px'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          정보
        </button>
        <button
          onClick={() => setTab('captures')}
          className={`flex-1 py-2.5 text-xs transition ${
            tab === 'captures'
              ? 'text-white border-b-2 border-accent -mb-px'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          캡처 {captureCount > 0 && <span className="text-accent">{captureCount}</span>}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'info' ? (
          <InfoTab />
        ) : (
          <CapturesTab onPreview={onPreviewCapture} onExportXmp={onExportXmp} />
        )}
      </div>
    </aside>
  );
}
