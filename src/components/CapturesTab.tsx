import { useCaptureStore, type Capture } from '../store/captureStore';
import { formatTime, captureUrl } from '../utils/format';

interface Props {
  onPreview: (c: Capture) => void;
  onExportXmp: () => void;
}

async function openCaptureFolder() {
  const dir = await window.offcut.capture.getDir();
  if (dir) await window.offcut.shell.openPath(dir);
}

export default function CapturesTab({ onPreview, onExportXmp }: Props) {
  const captures = useCaptureStore((s) => s.captures);
  const remove = useCaptureStore((s) => s.remove);
  const clear = useCaptureStore((s) => s.clear);

  if (captures.length === 0) {
    return (
      <div className="p-4 text-xs text-white/30 text-center space-y-3 flex flex-col items-center">
        <p>캡처가 없습니다</p>
        <p className="text-[10px]">단축키 S 또는 컨트롤바의 📷 버튼</p>
        <button
          onClick={openCaptureFolder}
          className="mt-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70"
        >
          캡처 폴더 열기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start auto-rows-min">
        {captures.map((c) => (
          <div
            key={c.id}
            className="group relative bg-bg-elevated rounded overflow-hidden border border-white/5 hover:border-accent/50 transition aspect-video"
          >
            <img
              src={captureUrl(c.path, c.createdAt)}
              alt=""
              className="absolute inset-0 w-full h-full object-contain cursor-pointer bg-black/40"
              onClick={() => window.offcut.mpv.command('seek', c.time, 'absolute')}
              onDoubleClick={() => onPreview(c)}
              title={`클릭: ${formatTime(c.time)} 점프\n더블클릭: 크게 보기`}
            />
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between text-[10px] gap-1">
              <span className="px-1 py-0.5 bg-black/80 rounded font-mono text-white/90">
                {formatTime(c.time)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 bg-black/80 rounded text-white/70 hover:text-white"
                title="목록에서 제거"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 px-3 py-2 space-y-1.5 text-xs">
        <button
          onClick={onExportXmp}
          className="w-full px-2 py-1.5 rounded bg-accent/15 hover:bg-accent/25 text-accent font-semibold"
          title="Premiere / After Effects 가 자동 인식하는 XMP 마커 파일을 영상 옆에 저장"
        >
          📋 Premiere 마커로 내보내기 (XMP)
        </button>
        <div className="flex items-center justify-between">
          <span className="text-white/40">{captures.length} 개</span>
          <div className="flex items-center gap-3">
            <button onClick={openCaptureFolder} className="text-white/40 hover:text-white">
              폴더 열기
            </button>
            <button onClick={clear} className="text-white/40 hover:text-white">
              전체 지우기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
