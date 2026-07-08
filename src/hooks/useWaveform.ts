import { useEffect, useRef, useState } from 'react';

// showwavespic은 오디오 전체를 디코딩하므로 아주 긴 파일은 생성을 건너뛴다.
const MAX_WAVEFORM_DURATION_SEC = 3600;

/**
 * Generates a low-res audio waveform PNG via ffmpeg `showwavespic` once per
 * file. Failures are silent (some files have no audio track — that's fine).
 * duration 은 "로드 완료" 신호 겸 길이 가드 — 파일당 1회만 디코딩한다
 * (ts 등에서 duration 추정치가 미세하게 갱신돼도 재실행하지 않음).
 */
export function useWaveform(filename: string | null, accentRgb: string, duration: number) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filename || duration <= 0 || duration > MAX_WAVEFORM_DURATION_SEC) {
      fetchedKeyRef.current = null;
      setDataUrl(null);
      return;
    }
    const key = `${filename}|${accentRgb}`;
    if (fetchedKeyRef.current === key) return; // 같은 파일·색은 재생성 안 함
    fetchedKeyRef.current = key;
    setDataUrl(null);
    // 완료 시점에 키가 여전히 현재 파일·색이면 반영 (파일 전환 레이스 방어).
    window.offcut.preview
      .waveform({ input: filename, width: 1600, height: 48, rgb: accentRgb })
      .then((url) => {
        if (fetchedKeyRef.current === key) setDataUrl(url);
      })
      .catch(() => {
        if (fetchedKeyRef.current === key) setDataUrl(null);
      });
  }, [filename, accentRgb, duration]);

  return dataUrl;
}
