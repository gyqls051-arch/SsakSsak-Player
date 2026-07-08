# 싹싹김치 플레이어 — 변경 이력

## v0.2.0 — 2026-07-08 (Beta)

### 플레이어 기본기 (다음팟 패리티)
- **파일 연결 + 단일 인스턴스** — 탐색기 더블클릭으로 열기 (NSIS fileAssociations),
  두 번째 실행은 기존 창 포커스 + 해당 파일 재생 (`second-instance` argv 전달)
- **마우스 휠** — 영상 위 볼륨 ±5, 시크바 위 5초 이동
- **이어보기** — 재생 위치 자동 저장(5초 주기·LRU 200개), 다음 열기 때 자동 복원
  + "처음부터" 버튼. 시크릿 모드에서는 기록 안 함
- **재생 모드 4종** — 정지 / 다음 파일 / 전체 반복 / 한 파일 반복(mpv `loop-file`).
  폴더 재생목록 자동 진행
- **자막·오디오 싱크** — `Z`/`Shift+Z`, `D`/`Shift+D` (±0.1s), `Alt`=리셋,
  우클릭 '동기화' 메뉴 + 자막 크기(75~150%)
- **자막 자동 로드 강화** — fuzzy 매칭(`영상.kor.srt`), `subs`/`자막` 폴더 탐색
- **항상 위** — 📌 헤더 버튼 + `Ctrl+T`
- **챕터** — 시크바 틱, `PgUp`/`PgDn` 이동, 우클릭 챕터 목록

### 편집 기능
- **GIF/WebP 구간 내보내기** — In/Out 구간을 애니메이션으로 (최대 30초,
  palettegen/paletteuse · libwebp)
- **화면 조정** — 90° 회전, 비율 강제(자동/16:9/4:3), 줌 (우클릭 '화면' 메뉴,
  파일 전환 시 자동 리셋)
- **파형 오버레이** — 시크바 위 오디오 파형 표시 (1시간 이하 파일, 강조색 연동)

### 버그 수정
- 볼륨 131~150 구간이 무시되던 문제 (mpv `volume-max` 기본 130 클램프)
- 프레임 캡처가 화면 표시 프레임과 ±1프레임 어긋날 수 있던 문제
  (ffmpeg 재디코딩 → mpv 네이티브 `screenshot-to-file`로 전환)
- `Alt+문자` 조합이 평문 단축키(예: Alt+S 캡처)를 오발동시키던 문제
- README 단축키 표가 실제 동작과 다르던 문제 (←/→ = 프레임 이동)

### 내부 정리
- 미사용 `video-preload.js`, `captureFrameWithFfmpeg`, mpv `screenshot`
  커맨드 제거
- ESLint 베이스라인 에러 7건 정리 (설정 파일 sourceType, BOM 마커 주석 등)
- 열기/드롭 파일 필터에 `m2ts`/`3gp`/`ogv` 추가 (내부 허용 목록과 정합)

## v0.1.0 — 2026-05-25 (Beta)

### 첫 베타 릴리스
영상 편집자용 가벼운 플레이어 + 프리뷰 도구.

### 재생
- mpv 기반 재생 (`node-mpv` IPC)
- 하드웨어 가속 (Electron Chromium ↔ mpv 충돌 회피 위해 Chromium HW 비활성)
- 커스텀 프로토콜 `offcut-cap://` (캡쳐 PNG 서빙)
- A-B 루프 (`useABLoopSync`)
- Seek 썸네일 미리보기 (`useSeekThumbnail`)
- 파형 표시 (`useWaveform`)
- 자동 숨김 컨트롤 (`useAutoHideUI`)
- 전체화면 동기화 (`useFullscreenSync`)
- 키바인딩 (`useKeyBindings`)

### 파일 / 캡쳐
- 드래그 드롭 지원 (`useDragDrop`)
- 최근 파일 메뉴 (`useRecentFiles`)
- 현재 프레임 PNG 캡쳐 + 갤러리 탭
- 캡쳐 저장 경로 설정

### 트랜스코드
- ffmpeg 프리셋 기반 (`electron/transcode.js`)
- 실시간 진행률 (`onProgress` IPC)
- 취소 지원

### 메타
- ffprobe로 코덱·해상도·비트레이트 정보 표시
- XMP 메타데이터 핸들링 (`electron/xmp.js`)

### 라이선스 / 배포 메타
- LICENSE (MIT, 소스 코드)
- THIRD_PARTY_LICENSES.md (mpv, ffmpeg, node-mpv 등 명시)
- README (베타 명시, 이중 라이선스 구조 설명)
- .github/ISSUE_TEMPLATE 추가

### 알려진 제약
- **v0.x 베타** — 프로덕션 사용 시 본인 책임
- 코드 서명 미적용 (Windows SmartScreen 경고)
- 자동 업데이트 미통합
- 일부 키바인딩이 mpv 기본값과 중복 가능
- HDR 메타데이터 정확도는 mpv 버전에 의존
- 인스톨러는 mpv(GPLv2+)/ffmpeg(GPLv3) GPL 빌드를 번들하므로 인스톨러의 GPL 컴포넌트 부분은 GPLv3 의무 적용 (본 앱 코드는 별도 프로세스 호출이라 MIT 유지)

### 알려진 라이선스 이슈
- 현재 번들된 ffmpeg는 GPL 빌드 (`--enable-gpl --enable-libx264 --enable-libx265` 등 포함)
- 향후 LGPL 빌드 옵션 제공 검토 중 (`scripts/setup-binaries.ps1` 분기)
