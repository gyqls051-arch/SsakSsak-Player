# 싹싹김치 플레이어 — TODO

> 2026-07-08 정리. v0.2.0 (다음팟 패리티 작업) 완료 반영.
> 완료된 항목은 CHANGELOG.md 로 이동, 여기엔 남은 것만 둔다.

## ✅ v0.2.0 에서 완료 (기록용 요약)

- 2026-05-16 코드 리뷰의 보안(B1~B5)·리팩토링(M1, M2) 항목 — 반영 완료
- A-B 반복, 무손실 추출, 시크바 썸네일, 자막 자동 로드(fuzzy), 다중 오디오 트랙,
  GIF/WebP 추출, 북마크+노트(메모), 파형 오버레이 — 구현 완료
- 파일 연결·단일 인스턴스, 휠, 이어보기, 재생 모드, 싱크 조절, 챕터, 항상 위,
  화면 회전/비율/줌 — 구현 완료 (`docs/plans/2026-07-06-v0.2-dev-spec.md` 참고)

## 🔜 다음 후보 (우선순위 순)

### 배포 품질
- **코드 서명** — Windows SmartScreen 경고 제거 (EV 인증서 or Azure Trusted Signing)
- **자동 업데이트** — electron-updater (asset_manager 의 R2 방식 재사용 가능)
- ~~**LGPL ffmpeg 빌드 전환**~~ — ✅ v0.3.0에서 완료 (BtbN lgpl 빌드 + HW 인코더 폴백)

### 기능
- **반복 캡처** — 매 N초 자동 PNG 시퀀스 (컨택트 시트는 있음, 자동 간격 캡처는 없음)
- **재생 통계** — 평균 비트레이트, 프레임 타임 그래프 (드롭프레임 디버깅)
- **트랜스코딩 모달 개선** — before/after 비교 (예상 사이즈 표시는 v0.1에 있음)

### UX
- **프레임리스 + 커스텀 타이틀바** — 시각 인상 개선
- **시작 화면 썸네일** — 최근 파일 카드에 실제 프레임 썸네일 + 길이 표시
- **정보 패널 시각화** — 색공간 차트, 비트레이트 추이 그래프

### 🍦 nice-to-have
- HDR → SDR 톤맵 옵션
- LUT (.cube) 미리보기
- 두 영상 좌우 비교 (편집 전/후)

## 📌 외부 환경 메모

- mpv/ffmpeg 바이너리: `resources/bin/` (`npm run setup:bin`)
- ⚠️ `ELECTRON_RUN_AS_NODE=1` 이 사용자 PowerShell 에 set 되어 있음 → launcher 가
  자체 strip 하지만 영구 제거 권장
  (`[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User')`)
- ffmpeg = BtbN LGPL build (138MB · static, libx264/x265 제외 → HW 인코더 폴백 사용)
