import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore } from './store/playerStore';
import { useSettingsStore } from './store/settingsStore';
import { usePlaylistStore } from './store/playlistStore';
import { useNotesStore, type Note } from './store/notesStore';
import type { NoteExportFormat } from './components/NotesTab';
import { useCaptureStore, type Capture } from './store/captureStore';
import ControlBar from './components/ControlBar';
import RecentFilesMenu from './components/RecentFilesMenu';
import SidePanel from './components/SidePanel';
import TranscodeModal from './components/TranscodeModal';
import HelpModal from './components/HelpModal';
import CapturePreviewModal from './components/CapturePreviewModal';
import StartScreen from './components/StartScreen';
import ExitAdModal from './components/ExitAdModal';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useAutoHideUI } from './hooks/useAutoHideUI';
import { useVideoEmbed } from './hooks/useVideoEmbed';
import { useABLoopSync } from './hooks/useABLoopSync';
import { useFfprobeOnFile } from './hooks/useFfprobeOnFile';
import { useFullscreenSync } from './hooks/useFullscreenSync';
import { useDragDrop } from './hooks/useDragDrop';
import { evalRate, formatTime, formatTimeForFilename } from './utils/format';

function basename(p: string | null) {
  if (!p) return '파일이 열려있지 않습니다';
  return p.split(/[\\/]/).pop() ?? p;
}

function srtTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(ss)},${p(ms, 3)}`;
}

// Build the export payload for text-based note formats (txt / csv / srt).
function buildNotesContent(format: NoteExportFormat, notes: Note[]): string {
  if (format === 'csv') {
    const rows = ['time_sec,timecode,frame,note'];
    for (const n of notes) {
      const text = (n.text || '').replace(/"/g, '""');
      rows.push(`${n.time.toFixed(3)},${formatTime(n.time)},${n.frame ?? ''},"${text}"`);
    }
    return rows.join('\r\n');
  }
  if (format === 'srt') {
    return notes
      .map(
        (n, i) =>
          `${i + 1}\n${srtTimecode(n.time)} --> ${srtTimecode(n.time + 3)}\n${n.text || '메모'}\n`,
      )
      .join('\n');
  }
  // txt
  return notes
    .map((n) => `[${formatTime(n.time)}${n.frame != null ? ` / ${n.frame}f` : ''}] ${n.text || ''}`)
    .join('\r\n');
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
  const secret = useSettingsStore((s) => s.secret);
  const toggleSecret = useSettingsStore((s) => s.toggleSecret);

  // ---- Local state ----
  const [notice, setNotice] = useState<Notice | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [transcodeOpen, setTranscodeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewCapture, setPreviewCapture] = useState<Capture | null>(null);
  const [exitAdOpen, setExitAdOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [capturePulse, setCapturePulse] = useState(0);
  const [copyPulse, setCopyPulse] = useState(0);

  const setError = useCallback((text: string | null) => {
    setNotice(text ? { kind: 'error', text } : null);
  }, []);

  // Transient notice that auto-dismisses (used for capture/copy confirmations).
  const noticeTimer = useRef<number | null>(null);
  const showTransient = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1500);
  }, []);

  // ---- mpv status subscription ----
  useEffect(() => window.offcut.mpv.onStatus(setStatus), [setStatus]);

  // ---- Exit popup (self-promo) before the window closes ----
  useEffect(() => window.offcut.app.onExitAd(() => setExitAdOpen(true)), []);

  // ---- Hooks (effects) ----
  const isFullscreen = useFullscreenSync();
  const uiVisible = useAutoHideUI(filename, paused);
  useABLoopSync(filename, loopAB, inPoint, outPoint);
  useFfprobeOnFile(filename, setError);

  const overlayOpen = transcodeOpen || helpOpen || previewCapture !== null || exitAdOpen;
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

  const openFolder = useCallback(async () => {
    try {
      setError(null);
      const r = await window.offcut.openFolder();
      if (!r) return;
      if (r.files.length === 0) {
        setNotice({ kind: 'info', text: '이 폴더에 재생 가능한 영상이 없습니다' });
        return;
      }
      usePlaylistStore.getState().setPlaylist(r.folder, r.files);
      await openFile(r.files[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [openFile, setError]);

  const dragOver = useDragDrop(openFile, setError);

  const handleCapture = useCallback(async () => {
    try {
      const format = useSettingsStore.getState().captureFormat;
      const r = await window.offcut.capture.now({ format });
      addCapture({ videoPath: r.videoPath, path: r.path, time: r.time, frame: r.frame });
      setCapturePulse((n) => n + 1);
      showTransient({ kind: 'success', text: '📷 캡처됨' });
    } catch (e) {
      setError(`캡처 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [addCapture, setError, showTransient]);

  const handleCopyFrame = useCallback(async () => {
    try {
      await window.offcut.capture.copyCurrent();
      setCopyPulse((n) => n + 1);
      showTransient({ kind: 'success', text: '📋 클립보드에 복사됨' });
    } catch (e) {
      setError(`복사 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setError, showTransient]);

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

  const handleExportClip = useCallback(async () => {
    const s = usePlayerStore.getState();
    if (!s.filename || s.inPoint === null || s.outPoint === null || s.outPoint <= s.inPoint) {
      setNotice({ kind: 'info', text: 'In/Out 점을 먼저 설정하세요 (I / O)' });
      return;
    }
    const defaultPath = s.filename.replace(
      /\.[^.]+$/,
      `_export_${formatTimeForFilename(s.inPoint)}-${formatTimeForFilename(s.outPoint)}.mp4`,
    );
    const out = await window.offcut.saveFileDialog({
      title: '구간 내보내기 (재인코딩 · MP4)',
      defaultPath,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (!out) return;
    setBusy(`내보내는 중… ${basename(s.filename)}`);
    try {
      const r = await window.offcut.clip.export({
        input: s.filename,
        output: out,
        start: s.inPoint,
        end: s.outPoint,
      });
      setNotice({ kind: 'success', text: `🎬 저장됨: ${r.path}` });
    } catch (e) {
      setError(`구간 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [setError]);

  const handleExportXmp = useCallback(async () => {
    const s = usePlayerStore.getState();
    if (!s.filename) return;
    // Only this video's captures become markers.
    const captures = useCaptureStore.getState().captures.filter((c) => c.videoPath === s.filename);
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

  const handleAddNote = useCallback(() => {
    const s = usePlayerStore.getState();
    if (!s.filename) return;
    const v = s.ffprobe?.streams.find((x) => x.codec_type === 'video');
    const fps = (v && (evalRate(v.r_frame_rate) || evalRate(v.avg_frame_rate))) || 0;
    const frame = fps > 0 ? Math.round(s.position * fps) : null;
    useNotesStore.getState().add({ videoPath: s.filename, time: s.position, frame, text: '' });
    setPanelOpen(true);
  }, []);

  const handleExportNotes = useCallback(
    async (format: NoteExportFormat) => {
      const s = usePlayerStore.getState();
      if (!s.filename) return;
      const notes = useNotesStore.getState().notes.filter((n) => n.videoPath === s.filename);
      if (notes.length === 0) {
        setNotice({ kind: 'info', text: '내보낼 메모가 없습니다.' });
        return;
      }
      const v = s.ffprobe?.streams.find((x) => x.codec_type === 'video');
      const fps = (v && (evalRate(v.r_frame_rate) || evalRate(v.avg_frame_rate))) || 30;
      try {
        if (format === 'xmp') {
          const xmpPath = await window.offcut.markers.exportXmp({
            videoPath: s.filename,
            captures: notes.map((n) => ({ time: n.time, name: n.text || '메모' })),
            fps,
          });
          setNotice({
            kind: 'success',
            text: `🎬 XMP 저장: ${xmpPath.split(/[\\/]/).pop()}\nPremiere/AE import 시 마커로 인식됩니다.`,
          });
          return;
        }
        const baseName = s.filename.replace(/\.[^.]+$/, '').split(/[\\/]/).pop() ?? 'notes';
        const out = await window.offcut.saveFileDialog({
          title: '메모 내보내기',
          defaultPath: `${baseName}_메모.${format}`,
          filters: [{ name: format.toUpperCase(), extensions: [format] }],
        });
        if (!out) return;
        await window.offcut.notes.exportText(buildNotesContent(format, notes), out);
        setNotice({ kind: 'success', text: `📝 저장됨: ${out.split(/[\\/]/).pop()}` });
      } catch (e) {
        setError(`메모 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [setError],
  );

  // ---- Video click interactions ----
  // The mpv child window is click-through (setIgnoreMouseEvents), so these fire
  // on the React video div beneath it. Single click toggles pause; a 200ms
  // delay lets a double-click (→ fullscreen) cancel the pending pause toggle so
  // the picture doesn't flicker.
  const clickTimer = useRef<number | null>(null);

  const handleVideoClick = useCallback(() => {
    if (clickTimer.current !== null) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      window.offcut.mpv.command('togglePause');
    }, 200);
  }, []);

  const handleVideoDoubleClick = useCallback(() => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    window.offcut.window.toggleFullscreen();
  }, []);

  const handleVideoContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const s = usePlayerStore.getState();
    window.offcut.menu.showVideo({
      paused: s.paused,
      canExtract: s.inPoint !== null && s.outPoint !== null && s.outPoint > s.inPoint,
    });
  }, []);

  // Dispatch native context-menu actions back to the existing handlers.
  useEffect(() => {
    return window.offcut.menu.onAction((action) => {
      switch (action) {
        case 'togglePause':
        case 'frameStep':
        case 'frameBackStep':
          window.offcut.mpv.command(action);
          break;
        case 'capture':
          handleCapture();
          break;
        case 'copyFrame':
          handleCopyFrame();
          break;
        case 'setIn':
          handleSetIn();
          break;
        case 'setOut':
          handleSetOut();
          break;
        case 'extractClip':
          handleExtractClip();
          break;
        case 'exportClip':
          handleExportClip();
          break;
        case 'fullscreen':
          window.offcut.window.toggleFullscreen();
          break;
        case 'open':
          openFile();
          break;
      }
    });
  }, [
    handleCapture,
    handleCopyFrame,
    handleSetIn,
    handleSetOut,
    handleExtractClip,
    handleExportClip,
    openFile,
  ]);

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
    onAddNote: handleAddNote,
  });

  // ---- Render ----
  const hideUI = filename && !uiVisible;
  const sideHidden = isFullscreen || !panelOpen;

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-bg-base text-white relative ${hideUI ? 'cursor-none' : ''}`}
    >
      <header
        className={`h-12 flex items-center justify-between px-4 border-b border-white/10 shrink-0 transition-opacity duration-300 ${
          hideUI ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${isFullscreen ? 'absolute top-0 left-0 right-0 z-30 bg-bg-base/80 backdrop-blur' : 'bg-bg-surface'}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-wide">싹싹김치 플레이어</span>
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
            onClick={openFolder}
            className="text-xs px-3 py-1 rounded bg-white/5 hover:bg-white/10"
            title="폴더 열기 — 폴더 안 영상들을 목록으로"
          >
            📁 폴더
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
          <button
            onClick={toggleSecret}
            className={`text-xs px-2 py-1 rounded transition ${
              secret
                ? 'bg-accent/20 text-accent'
                : 'bg-white/5 hover:bg-white/10 text-white/50'
            }`}
            title={
              secret
                ? '시크릿 모드 ON — 최근 기록을 남기지 않습니다 (클릭하여 끄기)'
                : '시크릿 모드 OFF — 클릭하면 이후 연 영상을 기록하지 않습니다'
            }
          >
            {secret ? '🕶 시크릿' : '🕶'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 relative bg-black">
          {!filename ? (
            <StartScreen onOpenDialog={() => openFile()} onOpenFile={openFile} />
          ) : (
            <div
              ref={videoAreaRef}
              className="absolute inset-0 bg-black"
              onClick={handleVideoClick}
              onDoubleClick={handleVideoDoubleClick}
              onContextMenu={handleVideoContextMenu}
            />
          )}
        </main>
        {!sideHidden && (
          <SidePanel
            onPreviewCapture={setPreviewCapture}
            onExportXmp={handleExportXmp}
            onOpenFile={openFile}
            onOpenFolder={openFolder}
            onAddNote={handleAddNote}
            onExportNotes={handleExportNotes}
          />
        )}
      </div>

      <div
        className={`transition-opacity duration-300 ${
          hideUI ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${isFullscreen ? 'absolute bottom-0 left-0 right-0 z-30 bg-bg-base/80 backdrop-blur' : ''}`}
      >
        <ControlBar
          onCapture={handleCapture}
          onCopyFrame={handleCopyFrame}
          capturePulse={capturePulse}
          copyPulse={copyPulse}
          onTogglePanel={() => setPanelOpen((o) => !o)}
          panelOpen={panelOpen}
          onToggleLoopAB={handleToggleLoopAB}
          onClearAB={handleClearAB}
          onExtractClip={handleExtractClip}
          onExportClip={handleExportClip}
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
      <ExitAdModal open={exitAdOpen} onClose={() => setExitAdOpen(false)} />
    </div>
  );
}
