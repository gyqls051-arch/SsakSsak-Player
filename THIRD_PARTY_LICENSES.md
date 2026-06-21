# Third-Party Licenses

싹싹김치 플레이어의 인스톨러 배포물에는 아래 제3자 소프트웨어가 포함됩니다.
본 앱의 소스 코드는 [MIT 라이선스](LICENSE)이며, 아래 컴포넌트들은 각자의 라이선스 조건에 따릅니다.

> **중요**: 번들된 ffmpeg는 **GPLv3**(`--enable-gpl --enable-version3`), mpv는 **GPLv2+** 입니다.
> 이들을 함께 담은 인스톨러(`싹싹김치 플레이어 Setup X.X.X.exe`)의 GPL 컴포넌트 부분은
> 보수적으로 **GPLv3 의무를 따른다**고 명시합니다.
> 본 앱 자체 코드는 MIT이며, mpv·ffmpeg를 **별도 프로세스로 호출(단순 집합 / mere aggregation)** 하므로
> 본 앱 소스 공개 의무는 전염되지 않습니다. 의무 이행 방법은 아래 [GPL 의무 사항 충족 안내](#gpl-의무-사항-충족-안내) 참고.

---

## 1. mpv (영상 재생 엔진) ⚠️ GPL

- **라이선스**: **GPLv2+** (mpv 코어는 GPLv2+; LGPL 빌드 옵션 있으나 본 앱은 GPL 빌드 사용)
- **출처**: https://mpv.io/
- **소스 코드**: https://github.com/mpv-player/mpv
- **공식 빌드 제공처**: shinchiro/mpv-winbuild-cmake — https://github.com/shinchiro/mpv-winbuild-cmake (`mpv-x86_64-v3-*.7z`)
- **번들 버전 (정확)**: `mpv v0.41.0-524-g5921fe50b` (2026-04-21 빌드)
- **대응 소스 (corresponding source)**:
  - mpv: https://github.com/mpv-player/mpv/tree/5921fe50b
  - mpv 내장 FFmpeg (`N-124056-gc92304f8c`): https://github.com/FFmpeg/FFmpeg/tree/c92304f8c
  - 빌드 스크립트: https://github.com/shinchiro/mpv-winbuild-cmake
- **사용 방식**:
  - `mpv.exe`는 별도 프로세스로 실행되며, `node-mpv` 라이브러리가 JSON IPC로 통신
  - 본 앱과 mpv는 동적/정적 링크 관계가 아니며, 표준 IPC 인터페이스로만 통신
- **사용자 권리**: 번들된 `mpv.exe`를 다른 호환 GPL 빌드로 교체 가능. `resources/bin/mpv.exe` (소스 빌드 시) 또는 설치 폴더 내 `resources/bin/mpv.exe` (인스톨러 설치 시) 덮어쓰기.

---

## 2. FFmpeg (트랜스코드 + 메타데이터) ⚠️ GPL

- **라이선스**: **GPLv3** (`--enable-gpl --enable-version3`). `--enable-nonfree` 없음 → 재배포 가능, `--disable-libfdk-aac` 확인.
- **출처**: https://ffmpeg.org/
- **소스 코드**: https://github.com/FFmpeg/FFmpeg
- **공식 Windows 빌드 제공처**: BtbN/FFmpeg-Builds — https://github.com/BtbN/FFmpeg-Builds (`ffmpeg-master-latest-win64-gpl.zip`)
- **번들 버전 (정확)**: `N-124464-gb2867481d9` (2026-05-15 빌드)
- **대응 소스 (corresponding source)**:
  - FFmpeg: https://github.com/FFmpeg/FFmpeg/tree/b2867481d9
  - 빌드 스크립트: https://github.com/BtbN/FFmpeg-Builds
- **사용 방식**:
  - `ffmpeg.exe`, `ffprobe.exe`는 `child_process.spawn`으로 별도 프로세스 호출
  - 본 앱과 FFmpeg는 파일 시스템 + stdin/stdout으로만 통신
- **포함된 GPL 컴포넌트**: libx264, libx265, libxvid, libvidstab, frei0r 등
- **사용자 권리**: 번들된 `ffmpeg.exe` / `ffprobe.exe`를 다른 호환 빌드로 교체 가능.

### LGPL 빌드로 교체하고 싶다면

향후 `scripts/setup-binaries.ps1`에 LGPL 옵션 분기를 추가할 계획.
현재는 수동으로 BtbN LGPL 빌드(`ffmpeg-master-latest-win64-lgpl.zip`)를 다운받아
`resources/bin/`에 교체할 수 있습니다. 단, LGPL 빌드는 libx264/x265가 빠지므로 일부 트랜스코드 프리셋이 작동하지 않을 수 있습니다.

---

## 3. node-mpv (Node.js ↔ mpv IPC)

- **라이선스**: MIT
- **출처**: https://github.com/00SteinsGate00/Node-MPV
- **버전**: ^2.0.0-beta.0

---

## 4. Electron

- **라이선스**: MIT (Electron 자체), 단 번들된 Chromium은 BSD-3-Clause, V8은 BSD-3-Clause, Node.js는 MIT
- **출처**: https://www.electronjs.org/
- **버전**: ^33.3.2

---

## 5. React / React DOM

- **라이선스**: MIT
- **출처**: https://react.dev/
- **버전**: ^18.3.1

---

## 6. Zustand (상태관리)

- **라이선스**: MIT
- **출처**: https://github.com/pmndrs/zustand
- **버전**: ^4.5.5

---

## 7. Tailwind CSS

- **라이선스**: MIT
- **출처**: https://tailwindcss.com/
- **버전**: ^3.4.6

---

## 8. Vite / electron-builder / TypeScript

- 모두 빌드 도구. 산출물에는 NSIS 런타임만 포함.
- Vite (MIT), electron-builder (MIT), TypeScript (Apache-2.0).

---

## 9. NSIS (인스톨러)

- **라이선스**: zlib/libpng
- **출처**: https://nsis.sourceforge.io/
- 자유 재배포 가능.

---

## Chromium 라이선스 통지

Electron에 번들된 Chromium은 다음 라이선스를 따릅니다:
- Chromium 자체: BSD-3-Clause
- V8 JavaScript 엔진: BSD-3-Clause
- 그 외 서드파티 컴포넌트: https://chromium.googlesource.com/chromium/src/+/master/LICENSE

---

## GPL 의무 사항 충족 안내

번들된 mpv·ffmpeg는 별도 실행 파일(별도 프로세스)로 호출되며, 본 앱(MIT)과 정적/동적 링크 관계가 아닙니다
(단순 집합 / mere aggregation). 따라서 **본 앱의 소스 공개 의무는 발생하지 않습니다.** 다만 GPL 바이너리를
재배포하는 데 따른 아래 의무를 이행합니다.

인스톨러 재배포자는 다음을 함께 제공해야 합니다:

1. **본 문서 (THIRD_PARTY_LICENSES.md)** 및 각 GPL 컴포넌트의 라이선스 전문
2. **mpv 대응 소스**: https://github.com/mpv-player/mpv/tree/5921fe50b
   (빌드 스크립트: https://github.com/shinchiro/mpv-winbuild-cmake )
3. **ffmpeg 대응 소스**: https://github.com/FFmpeg/FFmpeg/tree/b2867481d9
   (빌드 스크립트: https://github.com/BtbN/FFmpeg-Builds )
4. **LICENSE (MIT, 본 앱 소스용)**
5. (선택) `싹싹김치 플레이어 Setup X.X.X.exe` 또는 동등한 형태의 빌드 산출물

이 모든 정보는 GitHub Releases 페이지에서 함께 제공됩니다.

> 위 "대응 소스" 링크는 **실제 번들된 바이너리와 동일한 커밋**을 가리킵니다 (GPLv3 §6 / GPLv2 §3의
> "corresponding source" 요건). 빌드를 새 버전으로 교체하면 이 커밋 해시도 함께 갱신해야 합니다.

### 서면 제공 오퍼 (Written Offer — GPLv3 §6 / GPLv2 §3)

싹싹김치 플레이어 배포자는, 본 인스톨러를 수령한 모든 제3자에게 배포일로부터 **최소 3년간**, 번들된 mpv 및
FFmpeg 바이너리에 **대응하는 완전한 소스 코드**를 (a) 위 공개 저장소 링크를 통해 무상으로, 또는 (b) 요청 시
물리적 매체·전송에 드는 실비 이하의 비용으로 제공합니다. 소스 코드 요청은
[Issues](https://github.com/rlagyqls051-create/OFFCUT_Play/issues/new) 또는 배포 페이지에 명시된 연락처로
접수할 수 있습니다.

---

## 라이선스 관련 문의

라이선스 의무 위반으로 보이는 부분이 있으면 [Issues](https://github.com/rlagyqls051-create/OFFCUT_Play/issues/new)로 알려주세요.
