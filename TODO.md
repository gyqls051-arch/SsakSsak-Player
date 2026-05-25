# OFFCUT Player — TODO

## 📋 코드 리뷰 결과 (2026-05-16)

### 🛡️ 보안 — 배포 전 fix 권장

| # | 항목 | 위험 | 노력 |
|---|---|---|---|
| B1 | `index.html` CSP 의 `'unsafe-inline'` script-src 가 prod 빌드에도 박혀 있음 → prod 전용 CSP 분리 (dev: HMR 위해 unsafe-inline, prod: `script-src 'self'`) | 🟡 중 | 30분 |
| B2 | `offcut-cap://` protocol handler 가 path 검증 없이 임의 파일 읽기 가능. `path.normalize(decoded).startsWith(captureDir)` 로 capture dir 안에만 한정 | 🟡 중 | 15분 |
| B3 | prod 빌드에서 DevTools 명시적 차단 안 됨. `webPreferences.devTools: !isDev` 추가 | 🟢 낮음 | 5분 |
| B4 | `capture:setDir(dir)` 가 사용자 입력 그대로 `fs.mkdirSync` — path traversal 가능 (single-user 영향이라 risk 낮음) | 🟢 낮음 | 10분 |
| B5 | mainWindow `sandbox: false` — sandbox:true 시도해볼 만함 (preload require 영향 테스트) | 🟢 낮음 | 15분 |

### 🛠️ 유지보수 — 리팩토링

| # | 항목 | 노력 |
|---|---|---|
| M1 | `electron/main.js` (460줄) 를 `electron/windows/`, `electron/ipc/`, `electron/utils/` 로 분할 | 1~2시간 |
| M2 | `src/App.tsx` (250줄) 의 useEffect 들을 `useFileOpen`, `useVideoEmbed`, `useAutoHideUI`, `useFullscreen` 으로 추출 | 30분 |
| M3 | debug `console.log` 7개 정리 (`electron/main.js:255,298,303,306`, `electron/mpv-controller.js:46,60,62`) | 5분 |
| M4 | dead dep `cross-env` 등 정리 (devDeps) | 5분 |
| M5 | 일부 `catch {}` 무시 처리에 의도 주석 또는 명시적 처리 | 15분 |

---

## ✨ 추가 기능 — 편집자 타겟

### 🔥 임팩트 큰 것 (우선순위 높음)
- **A-B 구간 반복** — `I` (in), `O` (out) 마킹 + `L` 토글 반복. 같은 구간 반복 시청.
- **클립 lossless 추출** — 시작/끝 시점 지정 → ffmpeg `-c copy` 로 원본 품질 유지하며 추출 (트랜스코딩 X, 5초만에 끝남)
- **시크바 hover thumbnail preview** — YouTube/Premiere 표준. mpv 의 `screenshot-to-file` 을 일정 간격으로 미리 생성 + sprite 시트.
- **자막 자동 로드** — 영상 옆 `.srt` `.ass` 자동 인식, 토글 (V 키), 자막 트랙 select

### 🌶️ 편집자 어필
- **다중 오디오 트랙 select** — 다국어 또는 멀티마이크 영상
- **GIF / WEBP 짧은 추출** — 구간 지정 → 짧은 애니로 export (디스코드/슬랙 첨부용)
- **반복 캡처** — 매 N 초마다 자동 PNG 시퀀스 (썸네일 시트 / contact sheet)
- **북마크 + 노트** — 시점에 텍스트 메모 → JSON / CSV / TXT export (편집 점검)
- **재생 통계** — 평균 비트레이트, 프레임 타임 그래프 (드롭프레임 디버깅)

### 🍦 nice-to-have
- **HDR → SDR 톤맵 옵션** — HDR 영상 SDR 모니터에서 보기
- **LUT (.cube) 미리보기** — 컬러 그레이딩 프리뷰
- **두 영상 좌우 비교** — 편집 전/후, 두 컷 비교

---

## 🎨 UX — 심심하지 않게

| 영역 | 개선 |
|---|---|
| **시작 화면** | "영상 파일 열기" 버튼만 → 최근 파일 그리드 (큰 카드 + 썸네일 + 시간) |
| **시크바** | 평평한 바 → **hover thumbnail preview** + 오디오 **waveform 오버레이** |
| **정보 패널** | 텍스트만 → 색공간 차트, 비디오 frame 미리보기, 비트레이트 추이 그래프 |
| **트랜스코딩 모달** | 결과 예상 사이즈 미리 표시 (시작 누르기 전), before/after 비교 |
| **다크 테마** | 단순 검정 + orange 액센트 → 미세한 gradient, micro-interaction (버튼 hover ripple), accent 색 선택 옵션 |
| **로딩 상태** | 영상 열 때 / ffprobe 실행 중 indicator |
| **헤더** | 단순 → 프레임리스 + 커스텀 타이틀바 (File/Edit/View/Help 메뉴 → 커스텀 메뉴) |
| **풀스크린** | 헤더/컨트롤바만 오버레이 → 자막/북마크/재생속도 표시 + 마우스 미동 시 모두 페이드 |

---

## 🗺️ M5 마무리 + 추가 작업 우선순위 추천

1. **M5b** — 프레임리스 + 커스텀 타이틀바 + 다크 폴리시 (당장 시각 인상)
2. **보안 fix** (B1~B3) — 배포 전 필수
3. **M5c** — debug 로그 정리 + NSIS 빌드 (1차 시안 완성)
4. **A-B 반복 + 클립 lossless 추출** — 편집자 타겟 첫 큰 기능
5. **시크바 thumbnail preview** — UX 점프 (가장 그림 좋아짐)
6. **자막 자동 로드** — 사용성
7. **main.js / App.tsx 리팩토링** — 위 기능 들어가기 전에 하는 게 충돌 적음

---

## 📌 외부 환경 메모
- mpv/ffmpeg 바이너리: `resources/bin/` 에 배치 (`npm run setup:bin`)
- ⚠️ `ELECTRON_RUN_AS_NODE=1` 이 사용자 PowerShell 에 set 되어 있음 → launcher 가 자체 strip 하지만 영구 제거 권장 ([Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User'))
- ffmpeg = BtbN GPL build (193MB · static). 추후 LGPL shared build 로 교체 시 ffmpeg/ffprobe 합쳐 10MB 정도로 축소 가능
