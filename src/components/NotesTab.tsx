import { useEffect } from 'react';
import { useNotesStore } from '../store/notesStore';
import { usePlayerStore } from '../store/playerStore';
import { formatTime } from '../utils/format';

export type NoteExportFormat = 'txt' | 'xmp' | 'csv' | 'srt';

interface Props {
  onAddNote: () => void;
  onExportNotes: (format: NoteExportFormat) => void;
}

export default function NotesTab({ onAddNote, onExportNotes }: Props) {
  const filename = usePlayerStore((s) => s.filename);
  const allNotes = useNotesStore((s) => s.notes);
  const lastAddedId = useNotesStore((s) => s.lastAddedId);
  const update = useNotesStore((s) => s.update);
  const remove = useNotesStore((s) => s.remove);
  const clearVideo = useNotesStore((s) => s.clearVideo);

  const notes = filename ? allNotes.filter((n) => n.videoPath === filename) : [];

  // Focus the editor of a freshly added note.
  useEffect(() => {
    if (!lastAddedId) return;
    const el = document.getElementById(`note-${lastAddedId}`);
    if (el) (el as HTMLTextAreaElement).focus();
  }, [lastAddedId]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-white/5">
        <button
          onClick={onAddNote}
          disabled={!filename}
          className="w-full px-2 py-1.5 rounded bg-accent hover:bg-accent-hover text-black font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          title="현재 재생 위치에 메모 추가 (N)"
        >
          + 현재 위치에 메모 (N)
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {notes.length === 0 ? (
          <div className="p-4 text-center text-xs text-white/30 leading-relaxed">
            아직 메모가 없습니다.
            <br />
            영상을 보다가 고칠 곳에서 <b className="text-white/50">N</b> 또는 위 버튼으로
            <br />그 프레임에 메모를 남기세요.
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded bg-bg-elevated border border-white/5 p-2">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => window.offcut.mpv.command('seek', n.time, 'absolute')}
                  className="font-mono text-[11px] text-accent hover:underline"
                  title="이 위치로 이동"
                >
                  {formatTime(n.time)}
                  {n.frame != null && <span className="text-white/30"> · {n.frame}f</span>}
                </button>
                <button
                  onClick={() => remove(n.id)}
                  className="ml-auto text-white/30 hover:text-white text-xs px-1"
                  title="메모 삭제"
                >
                  ✕
                </button>
              </div>
              <textarea
                id={`note-${n.id}`}
                value={n.text}
                onChange={(e) => update(n.id, e.target.value)}
                placeholder="고칠 내용을 적어주세요…"
                rows={2}
                className="w-full resize-y bg-black/30 rounded px-2 py-1 text-xs text-white/90 outline-none focus:ring-1 focus:ring-accent/50 placeholder:text-white/25"
              />
            </div>
          ))
        )}
      </div>

      {notes.length > 0 && (
        <div className="border-t border-white/5 px-3 py-2 space-y-1.5 text-xs">
          <div className="text-white/40">메모 내보내기</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onExportNotes('xmp')}
              className="px-2 py-1.5 rounded bg-accent/15 hover:bg-accent/25 text-accent font-semibold"
              title="Premiere / AE 가 타임라인 마커로 인식 (메모 텍스트 = 마커 이름)"
            >
              🎬 Premiere (XMP)
            </button>
            <button
              onClick={() => onExportNotes('txt')}
              className="px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70"
              title="사람이 읽기 쉬운 텍스트"
            >
              📝 텍스트 (.txt)
            </button>
            <button
              onClick={() => onExportNotes('srt')}
              className="px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70"
              title="자막 트랙으로 올려 메모를 영상 위에 표시"
            >
              💬 자막 (.srt)
            </button>
            <button
              onClick={() => onExportNotes('csv')}
              className="px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70"
              title="엑셀 / 스프레드시트"
            >
              📊 표 (.csv)
            </button>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-white/40">{notes.length} 개</span>
            <button
              onClick={() => filename && clearVideo(filename)}
              className="text-white/40 hover:text-white"
            >
              전체 지우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
