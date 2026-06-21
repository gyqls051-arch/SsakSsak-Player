import { useEffect, useState } from 'react';
import InfoTab from './InfoTab';
import CapturesTab from './CapturesTab';
import FolderTab from './FolderTab';
import { useCaptureStore, type Capture } from '../store/captureStore';
import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';

interface Props {
  onPreviewCapture: (c: Capture) => void;
  onExportXmp: () => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
}

type Tab = 'info' | 'captures' | 'folder';

export default function SidePanel({
  onPreviewCapture,
  onExportXmp,
  onOpenFile,
  onOpenFolder,
}: Props) {
  const [tab, setTab] = useState<Tab>('info');
  const filename = usePlayerStore((s) => s.filename);
  const captureCount = useCaptureStore(
    (s) => s.captures.filter((c) => c.videoPath === filename).length,
  );
  const folder = usePlaylistStore((s) => s.folder);

  // Jump to the folder tab whenever a folder is loaded.
  useEffect(() => {
    if (folder) setTab('folder');
  }, [folder]);

  const tabClass = (t: Tab) =>
    `flex-1 py-2.5 text-xs transition ${
      tab === t
        ? 'text-white border-b-2 border-accent -mb-px'
        : 'text-white/40 hover:text-white/70'
    }`;

  return (
    <aside className="w-80 shrink-0 border-l border-white/10 bg-bg-surface flex flex-col">
      <div className="flex border-b border-white/5">
        <button onClick={() => setTab('info')} className={tabClass('info')}>
          정보
        </button>
        <button onClick={() => setTab('captures')} className={tabClass('captures')}>
          캡처 {captureCount > 0 && <span className="text-accent">{captureCount}</span>}
        </button>
        <button onClick={() => setTab('folder')} className={tabClass('folder')}>
          폴더
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'info' && <InfoTab />}
        {tab === 'captures' && (
          <CapturesTab onPreview={onPreviewCapture} onExportXmp={onExportXmp} />
        )}
        {tab === 'folder' && <FolderTab onOpen={onOpenFile} onOpenFolder={onOpenFolder} />}
      </div>
    </aside>
  );
}
