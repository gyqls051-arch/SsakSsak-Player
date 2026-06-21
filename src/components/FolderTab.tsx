import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

interface Props {
  onOpen: (path: string) => void;
  onOpenFolder: () => void;
}

export default function FolderTab({ onOpen, onOpenFolder }: Props) {
  const folder = usePlaylistStore((s) => s.folder);
  const files = usePlaylistStore((s) => s.files);
  const current = usePlayerStore((s) => s.filename);
  const idx = current ? files.indexOf(current) : -1;

  if (!folder) {
    return (
      <div className="p-5 text-center text-xs text-white/40 flex flex-col items-center gap-3">
        <p className="leading-relaxed">
          폴더를 열면 그 안의 영상들을
          <br />
          목록으로 보고 하나씩 재생합니다.
        </p>
        <button
          onClick={onOpenFolder}
          className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-black font-semibold"
        >
          📁 폴더 열기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5">
        <span className="flex-1 truncate text-[11px] text-white/50" title={folder}>
          📁 {basename(folder)}
        </span>
        <span className="text-[10px] text-white/30 mr-1 tabular-nums">
          {idx >= 0 ? `${idx + 1}/${files.length}` : files.length}
        </span>
        <button
          disabled={idx <= 0}
          onClick={() => idx > 0 && onOpen(files[idx - 1])}
          className="ctrl-btn w-7 h-7 text-xs"
          title="이전 영상"
        >
          ◀
        </button>
        <button
          disabled={idx < 0 || idx >= files.length - 1}
          onClick={() => idx >= 0 && idx < files.length - 1 && onOpen(files[idx + 1])}
          className="ctrl-btn w-7 h-7 text-xs"
          title="다음 영상"
        >
          ▶
        </button>
        <button onClick={onOpenFolder} className="ctrl-btn w-7 h-7 text-xs" title="다른 폴더 열기">
          📁
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((f, i) => (
          <div
            key={f}
            onClick={() => onOpen(f)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer truncate ${
              i === idx ? 'bg-accent/15 text-accent' : 'hover:bg-white/5 text-white/70'
            }`}
            title={f}
          >
            <span className="text-white/25 tabular-nums shrink-0">{i + 1}</span>
            <span className="truncate">{basename(f)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
