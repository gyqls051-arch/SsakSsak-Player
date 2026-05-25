import { useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from './store/playerStore';
import { useCaptureStore, type Capture } from './store/captureStore';
import ControlBar from './components/ControlBar';
import RecentFilesMenu from './components/RecentFilesMenu';
import SidePanel from './components/SidePanel';
import TranscodeModal from './components/TranscodeModal';
import HelpModal from './components/HelpModal';
import CapturePreviewModal from './components/CapturePreviewModal';
import StartScreen from './components/StartScreen';
import AccentPicker from './components/AccentPicker';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useAutoHideUI } from './hooks/useAutoHideUI';
import { useVideoEmbed } from './hooks/useVideoEmbed';
import { useABLoopSync } from './hooks/useABLoopSync';
import { useFfprobeOnFile } from './hooks/useFfprobeOnFile';
import { useFullscreenSync } from './hooks/useFullscreenSync';
import { useDragDrop } from './hooks/useDragDrop';
import { evalRate, formatTimeForFilename } from './utils/format';

function basename(p: string | null) {
  if (!p) return '파일이 열려있지 않습니다';
  return p.split(/[\\/]/).pop() ?? p;
}

type Notice = { kind: 'error' | 'info' | 'success'; text: string };

export default function App() {
  // ---- Store accessors ----
  const setStatus = usePlayerStore((s) => s.setStatus);
  const filename = usePlayerStore((s) => s.filename);
  const paused = usePlayerStore((s) => s.paused);
  const inPoint = usePlayerStore((s) => s.inPoint);
  const outPoint = usePlayerStore((s) => s.outPoint);
  const loopAB = usePlayerStore((s) => s.loopAB);
  const setInPoint = usePlayerStore((s) => s.setInPoint);
  const setOutPoint = usePlayerStore((s) => s.setOutPoint);
  const setLoopAB = usePlayerStore((s) => s.setLoopAB);
  const clearAB = usePlayerStore((s) => s.clearAB);

  const addCapture = useCaptureStore((s) => s.add);
  const { add: addRecent } = useRecentFiles();

  // ---- Local state ----
  const [notice, setNotice] = useState<Notice | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [transcodeOpen, setTranscodeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewCapture, setPreviewCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setError = useCallback((text: string | null) => {
    setNotice(text ? { kind: 'error', text } : null);
  }, []);

  // ---- mpv status subscription ----
  useEffect(() => window.offcut.mpv.onStatus(setStatus), [setStatus]);

  // ---- Hooks (effects) ----
  const isFullscreen = useFullscreenSync();
  const uiVisible = useAutoHideUI(filename, paused);
  useABLoopSync(filename, loopAB, inPoint, outPoint);
  useFfprobeOnFile(filename, setError);

  const overlayOpen = transcodeOpen || helpOpen || previewCapture !== null;
  const videoAreaRef = useVideoEmbed(filename, overlayOpen, `${panelOpen}-${isFullscreen}`);

  // ---- Handlers ----
  const openFile = useCallback(
    async (path?: string) => {
      try {
        setError(null);
        const target = path ?? (await window.offcut.openVideoDialog());
        if (!target) return;
        await window.offcut.mpv.open(target);
        addRecent(target);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [addRecent, setError],
  );

  const dragOver = useDragDrop(openFile, setError);

  const handleCapture = useCallback(async () => {
    try {
      const r = await window.offcut.capture.now();
      addCapture({ path: r.path, time: r.time, frame: r.frame });
    } catch (e) {
      setError(`캡처 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [addCapture, setError]);

  const handleSetIn = useCallback(() => {
    setInPoint(usePlayerStore.getState().position);
  }, [setInPoint]);

  const handleSetOut = useCallback(() => {
    setOutPoint(usePlayerStore.getState().position);
  }, [setOutPoint]);

  const handleToggleLoopAB = useCallback(() => {
    const s = usePlayerStore.getState();
    if (s.inPoint === null || s.outPoint === null || s.outPoint <= s.inPoint) {
      setNotice({ kind: 'info', text: 'In(I) / Out(O) 점을 먼저 설정하세요' });
      return;
    }
    setLoopAB(!s.loopAB);
  }, [setLoopAB]);

  const handleClearAB = useCallback(() => clearAB(), [clearAB]);

  const handleExtractClip = useCallback(async () => {
    const s = usePlayerStore.getState();
    if (!s.filename || s.inPoint === null || s.outPoint === null || s.outPoint <= s.inPoint) {
      setNotice({ kind: 'info', text: 'In/Out 점을 먼저 설정하세요 (I / O)' });
      return;
    }
    const ext = s.filename.match(/\.[^.]+$/)?.[0] ?? '.mp4';
    const defaultPath = s.filename.replace(
      /\.[^.]+$/,
      `_clip_${formatTimeForFilename(s.inPoint)}-${formatTimeForFilename(s.outPoint)}${ext}`,
    );
    const out = await window.offcut.saveFileDialog({
      title: '구간 저장 (무손실)',
      defaultPath,
      filters: [{ name: 'Video', extensions: [ext.replace('.', '') || 'mp4'] }],
    });
    if (!out) return;
    setBusy(`잘라내는 중… ${basename(s.filename)}`);
    try {
      const r = await window.offcut.clip.extract({
        input: s.filename,
        output: out,
        start: s.inPoint,
        end: s.outPoint,
      });
      setNotice({ kind: 'success', text: `✂️ 저장됨: ${r.path}` });
    } catch (e) {
      setError(`클립 추출 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [setError]);

  const handleExportXmp = useCallback(async () => {
    const s = usePlayerStore.getState();
    const captures = useCaptureStore.getState().captures;
    if (!s.filename) return;
    if (captures.length === 0) {
      setNotice({ kind: 'info', text: '내보낼 캡처가 없습니다. S 키로 먼저 캡처하세요.' });
      return;
    }
    const v = s.ffprobe?.streams.find((x) => x.codec_type === 'video');
    const fps = (v && (evalRate(v.r_frame_rate) || evalRate(v.avg_frame_rate))) || 30;
    try {
      const xmpPath = await window.offcut.markers.exportXmp({
        videoPath: s.filename,
        captures: captures.map((c, i) => ({ time: c.time, name: `Capture ${i + 1}` })),
        fps,
      });
      const xmpName = xmpPath.split(/[\\/]/).pop();
      setNotice({
        kind: 'success',
        text: `📋 XMP 저장: ${xmpName}\nPremiere/AE 에서 영상 import 시 자동 인식됩니다.`,
      });
    } catch (e) {
      setError(`XMP 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setError]);

  // ---- Keyboard ----
  useKeyBindings({
    onOpenFile: () => openFile(),
    onCapture: handleCapture,
    onToggleHelp: () => setHelpOpen((o) => !o),
    onSetInPoint: handleSetIn,
    onSetOutPoint: handleSetOut,
    onToggleLoopAB: handleToggleLoopAB,
    onClearAB: handleClearAB,
    onExtractClip: handleExtractClip,
  });

  // ---- Render ----
  const hideUI = filename && !uiVisible;
  const sideHidden = isFullscreen || !panelOpen;

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-bg-base text-white relative ${hideUI ? 'cursor-none' : ''}`}
    >
      <header
        className={`h-12 flex items-center justify-between px-4 border-b border-white/5 shrink-0 transition-opacity duration-300 ${
          hideUI ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${isFullscreen ? 'absolute top-0 left-0 right-0 z-30 bg-bg-base/80 backdrop-blur' : ''}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-wide">OFFCUT PLAYER</span>
        </div>
        <div className="text-xs text-white/40 truncate max-w-[40%]" title={filename ?? ''}>
          {basename(filename)}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openFile()}
            className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-hover text-black font-semibold"
            title="열기 (Ctrl+O)"
          >
            열기
          </button>
          <button
            onClick={() => setTranscodeOpen(true)}
            disabled={!filename}
            className="text-xs px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            title="용량 줄이기"
          >
            용량 ↓
          </button>
          <RecentFilesMenu onOpen={openFile} />
          <AccentPicker />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 relative bg-black">
          {!filename ? (
            <StartScreen onOpenDialog={() => openFile()} onOpenFile={openFile} />
          ) : (
            <div ref={videoAreaRef} className="absolute inset-0 bg-black" />
          )}
        </main>
        {!sideHidden && (
          <SidePanel onPreviewCapture={setPreviewCapture} onExportXmp={handleExportXmp} />
        )}
      </div>

      <div
        className={`transition-opacity duration-300 ${
          hideUI ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${isFullscreen ? 'absolute bottom-0 left-0 right-0 z-30 bg-bg-base/80 backdrop-blur' : ''}`}
      >
        <ControlBar
          onCapture={handleCapture}
          onTogglePanel={() => setPanelOpen((o) => !o)}
          panelOpen={panelOpen}
          onToggleLoopAB={handleToggleLoopAB}
          onClearAB={handleClearAB}
          onExtractClip={handleExtractClip}
        />
      </div>

      {dragOver && (
        <div className="absolute inset-0 bg-black/70 border-4 border-dashed border-accent flex items-center justify-center text-2xl font-semibold pointer-events-none z-40">
          영상 파일을 드롭하세요
        </div>
      )}

      {notice && (
        <div
          className={`absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-sm shadow-lg z-50 max-w-2xl whitespace-pre-line ${
            notice.kind === 'error'
              ? 'bg-red-900/90 border border-red-500/50 text-white'
              : notice.kind === 'success'
              ? 'bg-emerald-900/90 border border-emerald-500/50 text-white'
              : 'bg-bg-elevated/95 border border-white/15 text-white'
          }`}
        >
          {notice.text}
          <button
            onClick={() => setNotice(null)}
            className="ml-3 text-white/60 hover:text-white align-top"
          >
            ✕
          </button>
        </div>
      )}

      {busy && (
        <div className="absolute bottom-20 right-4 px-3 py-2 rounded bg-bg-elevated border border-white/10 text-xs shadow-lg z-40 flex items-center gap-2">
          <div className="animate-spin w-3 h-3 border-2 border-white/20 border-t-accent rounded-full" />
          <span className="text-white/80">{busy}</span>
        </div>
      )}

      <TranscodeModal open={transcodeOpen} onClose={() => setTranscodeOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CapturePreviewModal
        capture={previewCapture}
        onClose={() => setPreviewCapture(null)}
        onRevealInFolder={(p) => window.offcut.capture.reveal(p)}
      />
    </div>
  );
}
