import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { formatTime, formatBytes } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = 'config' | 'running' | 'done' | 'error';

function dirOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return idx >= 0 ? p.slice(0, idx) : '';
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function joinPath(dir: string, file: string): string {
  if (!dir) return file;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith(sep) ? `${dir}${file}` : `${dir}${sep}${file}`;
}

export default function TranscodeModal({ open, onClose }: Props) {
  const filename = usePlayerStore((s) => s.filename);
  const duration = usePlayerStore((s) => s.duration);
  const fmtInfo = usePlayerStore((s) => s.ffprobe?.format);

  const [presets, setPresets] = useState<TranscodePreset[]>([]);
  const [presetKey, setPresetKey] = useState<string>('youtube-1080p');
  const [outputDir, setOutputDir] = useState<string>('');
  const [outputName, setOutputName] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('config');
  const [progress, setProgress] = useState<TranscodeProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);

  const inputSize = fmtInfo?.size ? Number(fmtInfo.size) : 0;
  const inputBitrate = fmtInfo?.bit_rate ? Number(fmtInfo.bit_rate) : 0;
  const selected = presets.find((p) => p.key === presetKey);

  const estimatedSize = useMemo(() => {
    if (!duration || duration <= 0) return null;
    switch (presetKey) {
      case 'discord-8mb':
        return 8 * 1024 * 1024 * 0.97;
      case 'discord-25mb':
        return 25 * 1024 * 1024 * 0.97;
      case 'kakao-300mb':
        return 300 * 1024 * 1024 * 0.97;
      case 'bitrate-half':
        if (!inputBitrate) return null;
        return ((inputBitrate / 2) * duration) / 8;
      case 'youtube-1080p':
        // CRF 23 1080p H.264 평균 약 7.5 Mbps
        return ((7500 * 1000) * duration) / 8;
      case 'preview-720p':
        // CRF 28 720p 평균 약 2.5 Mbps
        return ((2500 * 1000) * duration) / 8;
      case 'audio-mp3':
        return ((192 * 1000) * duration) / 8;
      default:
        return null;
    }
  }, [presetKey, duration, inputBitrate]);

  useEffect(() => {
    if (!open) return;
    window.offcut.transcode.presets().then(setPresets).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !filename) return;
    setOutputDir((prev) => prev || dirOf(filename));
    const base = stripExt(basename(filename));
    const ext = selected?.ext || '.mp4';
    const tag = presetKey.split('-')[0];
    setOutputName(`${base}_${tag}${ext}`);
  }, [open, filename, presetKey, selected]);

  useEffect(() => {
    if (phase !== 'running') return;
    return window.offcut.transcode.onProgress((data) => setProgress(data));
  }, [phase]);

  const outputPath = useMemo(() => joinPath(outputDir, outputName), [outputDir, outputName]);

  const eta = useMemo(() => {
    if (!progress || progress.ratio <= 0 || phase !== 'running') return null;
    const elapsed = (Date.now() - startedAt) / 1000;
    const total = elapsed / progress.ratio;
    return Math.max(0, total - elapsed);
  }, [progress, phase, startedAt]);

  const handleChooseDir = async () => {
    const dir = await window.offcut.chooseDirectory(outputDir);
    if (dir) setOutputDir(dir);
  };

  const handleStart = useCallback(async () => {
    if (!filename || !outputPath) return;
    if (selected?.needsDuration && (!duration || duration <= 0)) {
      setErrorMsg('이 프리셋은 영상 길이가 필요합니다. ffprobe 정보가 로드되지 않았습니다.');
      return;
    }
    if (selected?.needsInputBitrate && (!inputBitrate || inputBitrate <= 0)) {
      setErrorMsg('이 프리셋은 원본 영상의 비트레이트 정보가 필요합니다. ffprobe 정보가 로드되지 않았습니다.');
      return;
    }
    setErrorMsg(null);
    setProgress({ jobId: '', seconds: 0, ratio: 0 });
    setPhase('running');
    setStartedAt(Date.now());
    try {
      const result = await window.offcut.transcode.start({
        input: filename,
        output: outputPath,
        presetKey,
        duration,
        inputBitrate,
      });
      setResultPath(result.output);
      setPhase('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [filename, outputPath, presetKey, duration, inputBitrate, selected]);

  const handleCancel = useCallback(async () => {
    if (phase === 'running') await window.offcut.transcode.cancel();
    else onClose();
  }, [phase, onClose]);

  const handleClose = useCallback(() => {
    if (phase === 'running') return;
    setPhase('config');
    setProgress(null);
    setErrorMsg(null);
    setResultPath(null);
    onClose();
  }, [phase, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-[560px] max-w-[90vw] max-h-[90vh] bg-bg-surface border border-white/10 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
          <h2 className="text-sm font-semibold">용량 줄이기 / 트랜스코딩</h2>
          <button
            onClick={handleClose}
            disabled={phase === 'running'}
            className="text-white/40 hover:text-white text-lg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm overflow-y-auto flex-1 min-h-0">
          {!filename ? (
            <p className="text-white/40 text-center py-8">먼저 영상 파일을 여세요</p>
          ) : (
            <>
              <div>
                <div className="text-xs text-white/40 mb-2">입력</div>
                <div className="text-xs font-mono truncate text-white/70" title={filename}>
                  {basename(filename)}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">
                  {duration > 0 && `길이 ${formatTime(duration)} · `}
                  {inputSize > 0 && `크기 ${formatBytes(inputSize)}`}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/40 mb-2">프리셋</div>
                <div className="space-y-1.5">
                  {presets.map((p) => (
                    <label
                      key={p.key}
                      className={`block cursor-pointer rounded px-3 py-2 border transition ${
                        presetKey === p.key
                          ? 'bg-accent/10 border-accent/50'
                          : 'bg-white/5 border-transparent hover:bg-white/10'
                      } ${phase === 'running' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="preset"
                          value={p.key}
                          checked={presetKey === p.key}
                          onChange={(e) => setPresetKey(e.target.value)}
                          disabled={phase === 'running'}
                          className="accent-accent"
                        />
                        <span className="text-xs font-medium">{p.label}</span>
                      </div>
                      <p className="text-[10px] text-white/40 mt-0.5 ml-5">{p.description}</p>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/40 mb-2">출력 위치</div>
                <div className="flex gap-2">
                  <input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    disabled={phase === 'running'}
                    className="flex-1 px-2 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    onClick={handleChooseDir}
                    disabled={phase === 'running'}
                    className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 rounded disabled:opacity-30"
                  >
                    찾아보기
                  </button>
                </div>
                <input
                  value={outputName}
                  onChange={(e) => setOutputName(e.target.value)}
                  disabled={phase === 'running'}
                  className="w-full mt-2 px-2 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded outline-none focus:border-accent disabled:opacity-50"
                />
              </div>

              {estimatedSize !== null && phase === 'config' && (
                <div className="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-xs">
                  <span className="text-white/40">예상 결과 크기</span>
                  <span className="font-mono text-accent">
                    ~{formatBytes(estimatedSize)}
                    {inputSize > 0 && (
                      <span className="text-white/40 ml-2">
                        ({Math.round((estimatedSize / inputSize) * 100)}% of 원본)
                      </span>
                    )}
                  </span>
                </div>
              )}

              {phase === 'running' && progress && (
                <div className="space-y-2 pt-2">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-[width] duration-300"
                      style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-white/60">
                    <span>{Math.round(progress.ratio * 100)}%</span>
                    <span>
                      {formatTime(progress.seconds)} / {formatTime(duration)}
                    </span>
                    <span>{eta !== null ? `남은시간 ${formatTime(eta)}` : '계산중…'}</span>
                  </div>
                </div>
              )}

              {phase === 'done' && resultPath && (
                <div className="bg-emerald-900/30 border border-emerald-500/30 rounded p-3 space-y-2">
                  <div className="text-xs text-emerald-300">완료</div>
                  <div className="text-[10px] font-mono truncate text-white/70" title={resultPath}>
                    {basename(resultPath)}
                  </div>
                </div>
              )}

              {(errorMsg || phase === 'error') && errorMsg && (
                <div className="bg-red-900/30 border border-red-500/30 rounded p-3 text-xs text-red-200 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                  {errorMsg}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2 shrink-0">
          {phase === 'config' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10"
              >
                닫기
              </button>
              <button
                onClick={handleStart}
                disabled={!filename || !outputPath}
                className="px-4 py-1.5 text-xs rounded bg-accent hover:bg-accent-hover text-black font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
              >
                시작
              </button>
            </>
          )}
          {phase === 'running' && (
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 text-xs rounded bg-red-600/80 hover:bg-red-600 text-white font-semibold"
            >
              취소
            </button>
          )}
          {phase === 'done' && resultPath && (
            <>
              <button
                onClick={() => window.offcut.capture.reveal(resultPath)}
                className="px-4 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10"
              >
                폴더 열기
              </button>
              <button
                onClick={() => window.offcut.shell.openPath(resultPath)}
                className="px-4 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10"
              >
                파일 열기
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-1.5 text-xs rounded bg-accent hover:bg-accent-hover text-black font-semibold"
              >
                닫기
              </button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button
                onClick={() => setPhase('config')}
                className="px-4 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10"
              >
                다시 시도
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-1.5 text-xs rounded bg-accent hover:bg-accent-hover text-black font-semibold"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
