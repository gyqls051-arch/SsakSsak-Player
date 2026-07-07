interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: '재생 · 일시정지',
    items: [
      ['Space · K', '재생 / 일시정지'],
      ['Enter · F · Alt+Enter', '풀스크린 토글'],
      ['Esc', '풀스크린 종료'],
    ],
  },
  {
    title: '탐색',
    items: [
      ['← / , ', '1프레임 뒤'],
      ['→ / . ', '1프레임 앞'],
      ['Shift + ← →', '1초 이동'],
      ['Ctrl + ← →', '5초 이동'],
      ['J / L', '5초 뒤 / 앞'],
      ['0 – 9', '0% / 10% / … / 90% 위치로 점프'],
    ],
  },
  {
    title: '속도',
    items: [
      ['C · ]', '재생 속도 ↑'],
      ['X · [', '재생 속도 ↓'],
      ['V', '속도 1.0x 로 리셋'],
    ],
  },
  {
    title: '볼륨',
    items: [
      ['↑ / ↓', '볼륨 ±5'],
      ['M', '음소거 토글'],
    ],
  },
  {
    title: '동기화',
    items: [
      ['Z / Shift+Z', '자막 싱크 −0.1s / +0.1s'],
      ['Alt+Z', '자막 싱크 리셋'],
      ['D / Shift+D', '오디오 싱크 −0.1s / +0.1s'],
      ['Alt+D', '오디오 싱크 리셋'],
    ],
  },
  {
    title: '캡처 · 메모 · 마커',
    items: [
      ['S · Ctrl+E', '현재 프레임 캡처 (PNG/JPG)'],
      ['N', '현재 위치에 메모 추가'],
      ['I · R', '구간 시작점 (In)'],
      ['O · T', '구간 끝점 (Out)'],
      ['Ctrl+R', 'A-B 구간 반복 토글'],
      ['Shift+Backspace', 'In/Out 지우기'],
      ['Ctrl+Shift+S', '구간 무손실 잘라내기 (lossless)'],
    ],
  },
  {
    title: '파일 · 도움말',
    items: [
      ['Ctrl+O', '영상 파일 열기'],
      ['Ctrl+T', '항상 위 (📌) 토글'],
      ['F1 · ?', '이 도움말 토글'],
    ],
  },
  {
    title: '마우스',
    items: [
      ['클릭', '재생 / 일시정지 (영상 위)'],
      ['더블 클릭', '풀스크린 토글'],
      ['휠 (영상 위)', '볼륨 ±5'],
      ['휠 (재생바 위)', '5초 이동'],
      ['재생바 위로 드래그', '정밀 스크럽 (멀어질수록 느려짐)'],
      ['재생바 호버', '썸네일 + 시각 미리보기'],
    ],
  },
];

export default function HelpModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col bg-bg-surface border border-white/10 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
          <h2 className="text-sm font-semibold">단축키</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          {SECTIONS.map((sec) => (
            <section key={sec.title}>
              <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
                {sec.title}
              </h3>
              <div className="space-y-1">
                {sec.items.map(([keys, desc]) => (
                  <div key={keys} className="flex items-center justify-between gap-3 text-xs py-0.5">
                    <span className="font-mono text-white/90 text-right">
                      {keys.split(' · ').map((k, i, arr) => (
                        <span key={k}>
                          <kbd className="inline-block bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px]">
                            {k}
                          </kbd>
                          {i < arr.length - 1 && <span className="text-white/30 mx-1">·</span>}
                        </span>
                      ))}
                    </span>
                    <span className="text-white/60 text-right shrink-0">{desc}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-white/30 text-center shrink-0">
          한국어 입력 모드에서도 동작 · 단축키는 키 위치 기준
        </div>
      </div>
    </div>
  );
}
