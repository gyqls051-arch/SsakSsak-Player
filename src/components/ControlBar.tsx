import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore, type PlayMode } from '../store/settingsStore';
import { useCaptureStore } from '../store/captureStore';
import { useNotesStore } from '../store/notesStore';
import { SPEED_STEPS } from '../hooks/useKeyBindings';
import { formatTime } from '../utils/format';
import { useSeekThumbnail } from '../hooks/useSeekThumbnail';

function snapSpeed(value: number): number {
  let nearest = SPEED_STEPS[0];
  let best = Math.abs(value - nearest);
  for (const s of SPEED_STEPS) {
    const d = Math.abs(value - s);
    if (d < best) {
      best = d;
      nearest = s;
    }
  }
  return nearest;
}

const PLAYMODE_META: Record<PlayMode, { icon: string; label: string }> = {
  none: { icon: '→‖', label: '재생 후 정지' },
  next: { icon: '⏭', label: '다음 파일 자동 재생' },
  'loop-all': { icon: '🔁', label: '전체 반복' },
  'loop-one': { icon: '🔂', label: '한 파일 반복' },
};

// Map upward mouse distance (px) to a sensitivity factor for fine scrubbing —
// near the bar = 1.0 (normal), far above = down to ~0.05 (frame-by-frame feel).
function sensitivityFromDistance(distancePx: number): number {
  const clamped = Math.max(0, distancePx);
  return Math.max(0.05, 1 - (clamped / 250) * 0.95);
}

interface Props {
  onCapture: () => void;
  onCopyFrame: () => void;
  onAddNote: () => void;
  capturePulse: number;
  copyPulse: number;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onToggleLoopAB: () => void;
  onClearAB: () => void;
  onExtractClip: () => void;
  onExportClip: () => void;
}

export default function ControlBar({
  onCapture,
  onCopyFrame,
  onAddNote,
  capturePulse,
  copyPulse,
  onTogglePanel,
  panelOpen,
  onToggleLoopAB,
  onClearAB,
  onExtractClip,
  onExportClip,
}: Props) {
  const {
    filename,
    paused,
    position,
    duration,
    speed,
    volume,
    muted,
    inPoint,
    outPoint,
    loopAB,
    chapters,
  } = usePlayerStore();
  const playMode = useSettingsStore((s) => s.playMode);
  const cyclePlayMode = useSettingsStore((s) => s.cyclePlayMode);
  const allCaptures = useCaptureStore((s) => s.captures);
  // Only this video's captures appear as seekbar markers.
  const captures = filename ? allCaptures.filter((c) => c.videoPath === filename) : [];
  const allNotes = useNotesStore((s) => s.notes);
  const notes = filename ? allNotes.filter((n) => n.videoPath === filename) : [];
  const seekRef = useRef<HTMLDivElement>(null);

  const [dragTime, setDragTime] = useState<number | null>(null);
  const [scrubSensitivity, setScrubSensitivity] = useState<number | null>(null);
  const [hoverState, setHoverState] = useState<{ time: number; x: number } | null>(null);
  const [flashCap, setFlashCap] = useState(false);
  const [flashCopy, setFlashCopy] = useState(false);

  useEffect(() => {
    if (!capturePulse) return;
    setFlashCap(true);
    const t = setTimeout(() => setFlashCap(false), 450);
    return () => clearTimeout(t);
  }, [capturePulse]);

  useEffect(() => {
    if (!copyPulse) return;
    setFlashCopy(true);
    const t = setTimeout(() => setFlashCopy(false), 450);
    return () => clearTimeout(t);
  }, [copyPulse]);

  const seekThumb = useSeekThumbnail(filename, hoverState?.time ?? null);

  const disabled = !filename;
  const displayTime = dragTime ?? position;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

  const seekTo = (time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    window.offcut.mpv.command('seek', clamped, 'absolute');
  };

  const handleSeekDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0 || !seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const startTime = startRatio * duration;

    setDragTime(startTime);
    setScrubSensitivity(1);
    seekTo(startTime);

    let lastSeekAt = 0;
    const SEEK_THROTTLE_MS = 50;

    const onMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const upwardDistance = Math.max(0, rect.top - ev.clientY);
      const sensitivity = sensitivityFromDistance(upwardDistance);
      const ratioDelta = (deltaX / rect.width) * sensitivity;
      const next = Math.max(0, Math.min(duration, startTime + ratioDelta * duration));

      setDragTime(next);
      setScrubSensitivity(sensitivity);

      const now = Date.now();
      if (now - lastSeekAt >= SEEK_THROTTLE_MS) {
        lastSeekAt = now;
        seekTo(next);
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const deltaX = ev.clientX - startX;
      const upwardDistance = Math.max(0, rect.top - ev.clientY);
      const sensitivity = sensitivityFromDistance(upwardDistance);
      const ratioDelta = (deltaX / rect.width) * sensitivity;
      const finalTime = Math.max(0, Math.min(duration, startTime + ratioDelta * duration));
      seekTo(finalTime);
      setDragTime(null);
      setScrubSensitivity(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleSeekHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0 || !seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const t = (x / rect.width) * duration;
    setHoverState({ time: t, x });
  };

  // Clear stale hover state when leaving the player area entirely (drag may
  // already have moved focus elsewhere).
  useEffect(() => {
    if (dragTime !== null) setHoverState(null);
  }, [dragTime]);

  // Drive the transparent overlay window that renders the hover thumbnail above
  // the mpv video window (an in-page element would be clipped behind it).
  // Re-runs on hover-move (position + time) and when the thumbnail resolves.
  useEffect(() => {
    if (disabled || !hoverState || !seekRef.current) {
      window.offcut.preview.overlayHide();
      return;
    }
    const rect = seekRef.current.getBoundingClientRect();
    const centerX = rect.left + Math.min(Math.max(48, hoverState.x), rect.width - 48);
    window.offcut.preview.overlayShow({
      dataUrl: seekThumb ?? '',
      label: formatTime(hoverState.time),
      centerX,
      bottomY: rect.top - 6,
    });
  }, [hoverState, seekThumb, disabled]);

  // Hide the overlay if the control bar unmounts (e.g. fullscreen layout swap).
  useEffect(() => () => void window.offcut.preview.overlayHide(), []);

  const showFineHint = scrubSensitivity !== null && scrubSensitivity < 0.85;
  const hasAB = inPoint !== null || outPoint !== null;
  const canExtract = inPoint !== null && outPoint !== null && outPoint > inPoint;

  return (
    <footer className="px-3 pt-2.5 pb-2 border-t border-white/10 bg-bg-surface space-y-2 select-none">
      {hasAB && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-yellow-300">
            <span className="text-white/40">In</span> {inPoint !== null ? formatTime(inPoint) : '–'}
            <span className="mx-1 text-white/30">·</span>
            <span className="text-white/40">Out</span> {outPoint !== null ? formatTime(outPoint) : '–'}
            {canExtract && (
              <span className="ml-2 text-white/40">({formatTime(outPoint! - inPoint!)})</span>
            )}
          </span>
          {canExtract && (
            <>
              <button
                onClick={onToggleLoopAB}
                className={`px-2 py-0.5 rounded transition ${loopAB ? 'bg-yellow-400/30 text-yellow-200' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}
                title="A-B 구간 반복 (L)"
              >
                ↻ 반복 {loopAB ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={onExtractClip}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60"
                title="구간 무손실 잘라내기 — 빠름, 키프레임 단위 (Ctrl+Shift+S)"
              >
                ✂ 무손실
              </button>
              <button
                onClick={onExportClip}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60"
                title="구간 내보내기 — 재인코딩, 프레임 정확 · 호환 MP4"
              >
                🎬 출력
              </button>
            </>
          )}
          <button
            onClick={onClearAB}
            className="ml-auto px-2 py-0.5 text-white/40 hover:text-white"
            title="지우기 (Shift+Backspace)"
          >
            지우기
          </button>
        </div>
      )}
      <div className="relative">
        <div
          ref={seekRef}
          onMouseDown={handleSeekDown}
          onMouseMove={handleSeekHover}
          onMouseEnter={handleSeekHover}
          onMouseLeave={() => setHoverState(null)}
          onWheel={(e) => {
            if (disabled || duration <= 0) return;
            window.offcut.mpv.command('seek', e.deltaY < 0 ? 5 : -5, 'relative');
          }}
          className={`relative h-2 rounded-full bg-white/10 ${disabled ? 'opacity-30' : 'cursor-pointer'}`}
        >
          <div
            className="absolute inset-y-0 left-0 bg-accent rounded-full pointer-events-none"
            style={{ width: `${progressPct}%` }}
          />
          {duration > 0 && inPoint !== null && outPoint !== null && (
            <div
              className={`absolute inset-y-0 pointer-events-none ${loopAB ? 'bg-yellow-400/30' : 'bg-yellow-400/15'}`}
              style={{
                left: `${(Math.min(inPoint, outPoint) / duration) * 100}%`,
                width: `${(Math.abs(outPoint - inPoint) / duration) * 100}%`,
              }}
            />
          )}
          {duration > 0 && inPoint !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-yellow-400 pointer-events-none"
              style={{ left: `${(inPoint / duration) * 100}%` }}
              title={`In: ${formatTime(inPoint)} (I)`}
            />
          )}
          {duration > 0 && outPoint !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-yellow-400 pointer-events-none"
              style={{ left: `${(outPoint / duration) * 100}%` }}
              title={`Out: ${formatTime(outPoint)} (O)`}
            />
          )}
          {duration > 0 &&
            chapters.map((c, i) => (
              <div
                key={`ch-${i}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  seekTo(c.time);
                }}
                className="absolute top-0 w-px h-2 bg-white/50 hover:w-0.5 hover:bg-white transition-all cursor-pointer"
                style={{ left: `${Math.min(100, Math.max(0, (c.time / duration) * 100))}%` }}
                title={`챕터: ${c.title || formatTime(c.time)}`}
              />
            ))}
          {duration > 0 &&
            captures.map((c) => {
              const left = Math.min(100, Math.max(0, (c.time / duration) * 100));
              return (
                <div
                  key={c.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    seekTo(c.time);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-400 hover:w-1 hover:bg-yellow-300 transition-all cursor-pointer"
                  style={{ left: `${left}%` }}
                  title={`캡처: ${formatTime(c.time)}`}
                />
              );
            })}
          {duration > 0 &&
            notes.map((n) => {
              const left = Math.min(100, Math.max(0, (n.time / duration) * 100));
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    seekTo(n.time);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-sky-400 ring-1 ring-bg-surface hover:w-2.5 hover:h-2.5 hover:bg-sky-300 transition-all cursor-pointer"
                  style={{ left: `${left}%` }}
                  title={`메모: ${n.text || formatTime(n.time)}`}
                />
              );
            })}
          {hoverState && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-3.5 bg-white/60 pointer-events-none"
              style={{ left: `${hoverState.x}px` }}
            />
          )}
        </div>
        {showFineHint && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-accent pointer-events-none">
            정밀 스크럽 ×{scrubSensitivity!.toFixed(2)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) =>
            e.ctrlKey
              ? window.offcut.mpv.command('seek', -5, 'relative')
              : window.offcut.mpv.command('frameBackStep')
          }
          disabled={disabled}
          className="ctrl-btn text-[10px] font-bold tracking-tight"
          title="이전 프레임 (← / ,) · Ctrl+클릭: 5초 뒤로"
        >
          ◀1
        </button>
        <button
          onClick={() => window.offcut.mpv.command('togglePause')}
          disabled={disabled}
          className="ctrl-btn w-10 h-10 text-base"
          title="재생/일시정지 (Space)"
        >
          {paused ? '▶' : '❚❚'}
        </button>
        <button
          onClick={(e) =>
            e.ctrlKey
              ? window.offcut.mpv.command('seek', 5, 'relative')
              : window.offcut.mpv.command('frameStep')
          }
          disabled={disabled}
          className="ctrl-btn text-[10px] font-bold tracking-tight"
          title="다음 프레임 (→ / .) · Ctrl+클릭: 5초 앞으로"
        >
          1▶
        </button>

        <div className="text-xs font-mono text-white/70 tabular-nums ml-2 tracking-tight">
          {formatTime(displayTime)}{' '}
          <span className="text-white/30">/ {formatTime(duration)}</span>
        </div>

        <div className="flex-1" />

        <button
          onClick={onCapture}
          disabled={disabled}
          className={`ctrl-btn transition ${flashCap ? 'ring-2 ring-accent bg-accent/25 scale-110' : ''}`}
          title="현재 프레임 캡처 (S)"
        >
          📷
        </button>
        <button
          onClick={onCopyFrame}
          disabled={disabled}
          className={`ctrl-btn transition ${flashCopy ? 'ring-2 ring-accent bg-accent/25 scale-110' : ''}`}
          title="현재 프레임 클립보드 복사"
        >
          📋
        </button>
        <button
          onClick={onAddNote}
          disabled={disabled}
          className="ctrl-btn"
          title="현재 위치에 메모 / 주석 (N)"
        >
          📝
        </button>

        <button
          onClick={() => window.offcut.mpv.command('mute')}
          disabled={disabled}
          className="ctrl-btn"
          title="음소거 (M)"
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={150}
          value={volume}
          onChange={(e) => window.offcut.mpv.command('volume', Number(e.target.value))}
          disabled={disabled}
          className="w-24 accent-accent"
          title={`볼륨 ${Math.round(volume)}% (↑↓)`}
        />

        <button
          onClick={cyclePlayMode}
          className={`ctrl-btn text-xs ${playMode !== 'none' ? 'bg-white/20' : ''}`}
          title={`재생 모드: ${PLAYMODE_META[playMode].label} (클릭하여 변경)`}
        >
          {PLAYMODE_META[playMode].icon}
        </button>

        <select
          value={snapSpeed(speed)}
          onChange={(e) => window.offcut.mpv.command('speed', Number(e.target.value))}
          disabled={disabled}
          className="ml-2 bg-white/5 hover:bg-white/10 text-white text-xs px-2 py-1 rounded border-none outline-none disabled:opacity-30"
          title="재생 속도 ([ ])"
        >
          {SPEED_STEPS.map((s) => (
            <option key={s} value={s} className="bg-bg-elevated">
              {s}x
            </option>
          ))}
        </select>

        <button
          onClick={() => window.offcut.window.toggleFullscreen()}
          disabled={disabled}
          className="ctrl-btn"
          title="풀스크린 (F)"
        >
          ⛶
        </button>

        <button
          onClick={onTogglePanel}
          className={`ctrl-btn ${panelOpen ? 'bg-white/20' : ''}`}
          title="사이드 패널 토글"
        >
          ☰
        </button>
      </div>
    </footer>
  );
}
