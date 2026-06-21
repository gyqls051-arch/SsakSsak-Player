import { useRecentFiles } from '../hooks/useRecentFiles';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
function dirname(p: string): string {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join('\\');
}

const HINTS: Array<[string, string]> = [
  ['Ctrl+O', '파일 열기'],
  ['S · Ctrl+E', '프레임 캡처'],
  ['I / O', '구간 In / Out'],
  ['Ctrl+Shift+S', '구간 무손실 추출'],
  ['F1', '단축키 도움말'],
];

interface Props {
  onOpenDialog: () => void;
  onOpenFile: (path: string) => void;
}

export default function StartScreen({ onOpenDialog, onOpenFile }: Props) {
  const { files, remove } = useRecentFiles();

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-8 py-10">
        <div className="w-full max-w-4xl space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent" />
              <span className="text-xl font-semibold tracking-wide">싹싹김치 플레이어</span>
            </div>
            <p className="text-sm text-white/50">영상 파일을 열거나 끌어다 놓으세요</p>
            <button
              onClick={onOpenDialog}
              className="px-6 py-3 rounded-md bg-accent hover:bg-accent-hover text-black font-semibold transition"
            >
              영상 파일 열기
            </button>
            <p className="text-[11px] text-white/30 pt-2">
              MP4 · MKV · MOV · AVI · WebM · WMV · FLV · TS · MPEG
            </p>
          </div>

          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] uppercase tracking-wider text-white/40">최근 파일</h2>
                <span className="text-[10px] text-white/30">{files.length}개</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {files.map((f) => (
                  <button
                    key={f}
                    onClick={() => onOpenFile(f)}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-md bg-white/5 hover:bg-white/10 border border-transparent hover:border-accent/40 transition text-left"
                    title={f}
                  >
                    <div className="w-10 h-10 shrink-0 rounded bg-black/40 border border-white/5 flex items-center justify-center text-white/40 text-lg">
                      ▶
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{basename(f)}</div>
                      <div className="text-[11px] text-white/40 truncate">{dirname(f)}</div>
                    </div>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(f);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10"
                      title="목록에서 제거"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-white/5 pt-6">
            <h2 className="text-[10px] uppercase tracking-wider text-white/40 mb-3 text-center">
              빠른 단축키
            </h2>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/50">
              {HINTS.map(([k, label]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <kbd className="inline-block bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/80">
                    {k}
                  </kbd>
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
