# OFFCUT Player — 변경 이력

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
- 인스톨러는 mpv/ffmpeg GPL 빌드를 번들하므로 인스톨러 자체는 GPLv2+ 의무 적용

### 알려진 라이선스 이슈
- 현재 번들된 ffmpeg는 GPL 빌드 (`--enable-gpl --enable-libx264 --enable-libx265` 등 포함)
- 향후 LGPL 빌드 옵션 제공 검토 중 (`scripts/setup-binaries.ps1` 분기)
