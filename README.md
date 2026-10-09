# 싹싹김치 플레이어

> 영상 편집자를 위한 가벼운 데스크톱 플레이어 · 프리뷰 도구 (Windows)
>
> **v0.1.0 — Beta.** 프로덕션 사용은 본인 책임입니다.

mpv 재생 엔진 + ffmpeg 유틸리티를 Electron + React로 감싼, 편집 워크플로우에 특화된 플레이어입니다.
프레임 단위 탐색, 구간 캡처, 무손실 잘라내기, Premiere/AE용 마커 내보내기 등을 지원합니다.

---

## 주요 기능

- **재생** — mpv 기반(`node-mpv` IPC). 프레임 단위 앞/뒤 이동, 배속, 전체화면, 휠 볼륨/시크
- **파일 연결** — 탐색기에서 영상 더블클릭으로 열기, 단일 인스턴스 (두 번째 실행은 기존 창에서 재생)
- **이어보기** — 보던 위치 자동 기억·복원 ("처음부터" 되돌리기 포함, 시크릿 모드 제외)
- **재생 모드** — 정지 / 다음 파일 자동 재생 / 전체 반복 / 한 파일 반복 (🔁 토글)
- **A–B 루프** — In(`I`) / Out(`O`) 지정 후 구간 반복
- **자막** — 자동 로드(fuzzy — `영상.kor.srt`, `subs/` 폴더 인식), 트랙 선택, 싱크(`Z`)·크기 조절
- **오디오** — 다중 트랙 선택, 싱크 조절(`D`)
- **챕터** — 시크바 틱 + `PgUp/PgDn` 이동 + 우클릭 챕터 목록
- **프레임 캡처** — 화면에 보이는 프레임 그대로 원본 해상도 PNG/JPG 저장, 갤러리 탭에서 관리
- **무손실 구간 추출** — In/Out 구간을 재인코딩 없이(`-c copy`) 잘라내기
- **GIF/WebP 내보내기** — In/Out 구간을 짧은 애니메이션으로 (최대 30초)
- **용량 줄이기(트랜스코드)** — 유튜브 1080p / 웹 720p / 카카오톡 300MB / 디스코드 8·25MB / 비트레이트 절반 / 오디오만(MP3) 프리셋, 실시간 진행률·취소
- **마커 내보내기** — 캡처 지점을 Premiere/After Effects가 인식하는 `.xmp`로 내보내기
- **프리뷰** — 시크바 호버 썸네일, 오디오 파형 오버레이
- **화면** — 90° 회전, 비율 강제(16:9/4:3), 줌, 항상 위(📌 · `Ctrl+T`)
- **편의** — 드래그앤드롭, 최근 파일, 자동 숨김 UI, 미디어 정보(ffprobe), 강조색 변경, 시크릿 모드

## 지원 포맷

재생은 mpv가 담당하므로 **대부분의 컨테이너/코덱을 그대로 재생**합니다 — mp4, mkv, mov, avi, webm, m4v,
wmv, flv, ts/mts/m2ts, mpg/mpeg 등 + H.264 / H.265(HEVC) / AV1 / VP9 / ProRes / DNxHD 등.
열기 대화상자의 필터에 없더라도 "모든 파일"로 열 수 있습니다.

> 참고: H.264 / H.265 / AAC 등 일부 코덱에는 별도의 특허 라이선스 풀(MPEG-LA / Via LA)이 존재합니다.
> 이는 GPL과는 별개 사안이며, 무료 플레이어 배포(VLC · mpv · HandBrake 등과 동일한 구도)에서 실무상
> 위험은 낮지만, 대규모 상업 배포 시에는 별도 검토를 권장합니다. 자세한 내용은
> [라이선스](#라이선스) 참고.

## 단축키 (요약)

| 키 | 동작 |
|---|---|
| `Space` | 재생 / 일시정지 |
| `← / →` `, / .` | 프레임 뒤 / 앞 |
| `Shift + ← →` | 1초 이동 |
| `Ctrl + ← →` / `J / L` | 5초 이동 |
| `I` / `O` | In / Out 지정 |
| `S` | 현재 프레임 캡처 |
| `Ctrl+O` | 파일 열기 |
| `F` / `Enter` | 전체화면 |
| `?` / `F1` | 전체 단축키 도움말 |

---

## 개발 / 빌드

```bash
npm install
npm run setup:bin      # mpv.exe + ffmpeg.exe + ffprobe.exe 를 resources/bin/ 에 내려받음
npm run dev            # Vite + Electron 개발 모드
npm run build          # 프로덕션 번들 (tsc + vite)
npm run electron:build # 인스톨러(NSIS) 빌드 → release/
```

`resources/bin/`의 mpv(GPL)·ffmpeg/ffprobe(LGPL 빌드) 바이너리는 저장소에 커밋되지 않습니다.
`npm run setup:bin`이 공식 빌드(BtbN LGPL)를 내려받습니다.

---

## 라이선스

이 프로젝트는 **이중 라이선스 구조**입니다.

- **싹싹김치 플레이어 소스 코드 → [MIT](LICENSE)**
- **배포 인스톨러 → mpv(GPLv2+) · FFmpeg(LGPLv3 빌드) 바이너리를 번들**

mpv·ffmpeg는 앱에 링크되지 않고 **별도 프로세스(IPC / child process)로 호출**되므로(단순 집합, mere
aggregation), 본 앱 코드의 소스 공개 의무는 발생하지 않습니다. 다만 번들된 GPL/LGPL 바이너리에 대해서는
라이선스 전문 동봉 + 대응 소스 제공 의무가 있으며, 그 이행 방법(정확한 버전·소스 커밋 링크·written offer)은
**[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)** 에 정리되어 있습니다.

결론: **상업적 무료(또는 유료) 배포가 가능하며, 본 앱 코드는 비공개로 둘 수 있습니다.**

## 알려진 제약 (v0.x)

- 코드 서명 미적용 → Windows SmartScreen 경고가 표시될 수 있음
- 자동 업데이트 미통합
- 일부 키바인딩이 mpv 기본값과 중복될 수 있음

문제 제보: [Issues](https://github.com/gyqls051-arch/SsakSsak-Player/issues)
