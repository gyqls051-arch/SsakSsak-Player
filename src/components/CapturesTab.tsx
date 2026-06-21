import { useState } from 'react';
import { useCaptureStore, type Capture } from '../store/captureStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatTime, captureUrl } from '../utils/format';

interface Props {
  onPreview: (c: Capture) => void;
  onExportXmp: () => void;
}

async function openCaptureFolder() {
  const dir = await window.offcut.capture.getDir();
  if (dir) await window.offcut.shell.openPath(dir);
}

// Render the given captures into a single grid image and save it to disk.
async function exportContactSheet(caps: Capture[]) {
  const loaded = (
    await Promise.all(
      caps.map(
        (c) =>
          new Promise<{ im: HTMLImageElement; c: Capture } | null>((res) => {
            const im = new Image();
            im.onload = () => res({ im, c });
            im.onerror = () => res(null);
            im.src = captureUrl(c.path, c.createdAt);
          }),
      ),
    )
  ).filter((x): x is { im: HTMLImageElement; c: Capture } => x !== null);
  if (loaded.length === 0) return;

  const cols = Math.min(3, loaded.length);
  const cellW = 480;
  const pad = 8;
  const labelH = 22;
  const ar = loaded[0].im.naturalHeight / loaded[0].im.naturalWidth || 9 / 16;
  const cellH = Math.round(cellW * ar);
  const rows = Math.ceil(loaded.length / cols);
  const W = cols * cellW + (cols + 1) * pad;
  const H = rows * (cellH + labelH) + (rows + 1) * pad;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px monospace';
  ctx.textBaseline = 'middle';
  loaded.forEach(({ im, c }, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = pad + col * (cellW + pad);
    const y = pad + r * (cellH + labelH + pad);
    ctx.drawImage(im, x, y, cellW, cellH);
    ctx.fillText(formatTime(c.time), x + 4, y + cellH + labelH / 2);
  });

  const out = await window.offcut.saveFileDialog({
    title: '컨택트 시트 저장',
    defaultPath: 'contact_sheet.png',
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (!out) return;
  await window.offcut.capture.saveImage(canvas.toDataURL('image/png'), out);
}

export default function CapturesTab({ onPreview, onExportXmp }: Props) {
  const filename = usePlayerStore((s) => s.filename);
  const allCaptures = useCaptureStore((s) => s.captures);
  const remove = useCaptureStore((s) => s.remove);
  const clearVideo = useCaptureStore((s) => s.clearVideo);
  const format = useSettingsStore((s) => s.captureFormat);
  const setFormat = useSettingsStore((s) => s.setCaptureFormat);
  const [sheetBusy, setSheetBusy] = useState(false);

  // Only show captures from the currently open video.
  const captures = filename ? allCaptures.filter((c) => c.videoPath === filename) : [];

  if (captures.length === 0) {
    return (
      <div className="p-4 text-xs text-white/30 text-center space-y-3 flex flex-col items-center">
        <p>이 영상의 캡처가 없습니다</p>
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
              draggable
              onDragStart={(e) => {
                // Hand off to a native OS drag so it can be dropped into other apps.
                e.preventDefault();
                window.offcut.capture.startDrag(c.path);
              }}
              className="absolute inset-0 w-full h-full object-contain cursor-pointer bg-black/40"
              onClick={() => window.offcut.mpv.command('seek', c.time, 'absolute')}
              onDoubleClick={() => onPreview(c)}
              title={`클릭: ${formatTime(c.time)} 점프\n더블클릭: 크게 보기\n드래그: 다른 앱으로 내보내기`}
            />
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.offcut.capture.copyFile(c.path);
                }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 bg-black/80 rounded text-white/70 hover:text-white text-[10px]"
                title="클립보드 복사"
              >
                📋
              </button>
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
            <div className="absolute bottom-1 left-1 text-[10px]">
              <span className="px-1 py-0.5 bg-black/80 rounded font-mono text-white/90">
                {formatTime(c.time)}
              </span>
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
        <button
          onClick={async () => {
            setSheetBusy(true);
            try {
              await exportContactSheet(captures);
            } finally {
              setSheetBusy(false);
            }
          }}
          disabled={sheetBusy}
          className="w-full px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-40"
          title="모든 캡처를 한 장의 격자 이미지로 저장"
        >
          {sheetBusy ? '시트 생성 중…' : '🗂 컨택트 시트 내보내기'}
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-white/30">저장 형식</span>
            <button
              onClick={() => setFormat('png')}
              className={`px-1.5 py-0.5 rounded ${format === 'png' ? 'bg-accent/20 text-accent' : 'text-white/40 hover:text-white'}`}
            >
              PNG
            </button>
            <button
              onClick={() => setFormat('jpg')}
              className={`px-1.5 py-0.5 rounded ${format === 'jpg' ? 'bg-accent/20 text-accent' : 'text-white/40 hover:text-white'}`}
            >
              JPG
            </button>
          </div>
          <span className="text-white/40">{captures.length} 개</span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={openCaptureFolder} className="text-white/40 hover:text-white">
            폴더 열기
          </button>
          <button
            onClick={() => filename && clearVideo(filename)}
            className="text-white/40 hover:text-white"
          >
            전체 지우기
          </button>
        </div>
      </div>
    </div>
  );
}
