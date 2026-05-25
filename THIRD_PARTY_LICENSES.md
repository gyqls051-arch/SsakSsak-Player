# Third-Party Licenses

OFFCUT Player의 인스톨러 배포물에는 아래 제3자 소프트웨어가 포함됩니다.
본 앱의 소스 코드는 [MIT 라이선스](LICENSE)이며, 아래 컴포넌트들은 각자의 라이선스 조건에 따릅니다.

> **중요**: mpv와 ffmpeg는 GPL 라이선스이므로, 이들을 번들한 인스톨러(`OFFCUT Player Setup X.X.X.exe`)는
> 보수적으로 **GPLv2+ 의무를 따른다**고 명시합니다. README의 [라이선스 섹션](README.md#라이선스-️-중요) 참고.

---

## 1. mpv (영상 재생 엔진) ⚠️ GPL

- **라이선스**: **GPLv2+** (일부 LGPL 빌드 옵션 있음, 본 앱은 GPL 빌드 사용)
- **출처**: https://mpv.io/
- **소스 코드**: https://github.com/mpv-player/mpv
- **공식 빌드**: https://sourceforge.net/projects/mpv-player-windows/files/
- **버전 (현재 번들)**: v0.41.0+
- **사용 방식**:
  - `mpv.exe`는 별도 프로세스로 실행되며, `node-mpv` 라이브러리가 JSON IPC로 통신
  - 본 앱과 mpv는 동적/정적 링크 관계가 아니며, 표준 IPC 인터페이스로만 통신
- **사용자 권리**: 번들된 `mpv.exe`를 다른 호환 GPL 빌드로 교체 가능. `resources/bin/mpv.exe` (소스 빌드 시) 또는 설치 폴더 내 `resources/bin/mpv.exe` (인스톨러 설치 시) 덮어쓰기.

---

## 2. FFmpeg (트랜스코드 + 메타데이터) ⚠️ GPL

- **라이선스**: **GPLv2+** (현재 번들된 빌드는 `--enable-gpl --enable-version3` 옵션 포함)
- **출처**: https://ffmpeg.org/
- **소스 코드**: https://github.com/FFmpeg/FFmpeg
- **공식 Windows 빌드**: https://github.com/BtbN/FFmpeg-Builds
- **버전 (현재 번들)**: master (BtbN GPL build)
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

인스톨러 재배포자는 다음을 함께 제공해야 합니다:
1. **mpv 소스 코드 접근 경로**: https://github.com/mpv-player/mpv
2. **ffmpeg 소스 코드 접근 경로**: https://github.com/FFmpeg/FFmpeg
3. **본 문서 (THIRD_PARTY_LICENSES.md)**
4. **LICENSE (MIT, 본 앱 소스용)**
5. (선택) `OFFCUT Player Setup X.X.X.exe` 또는 동등한 형태의 빌드 산출물

이 모든 정보는 GitHub Releases 페이지에서 함께 제공됩니다.

---

## 라이선스 관련 문의

라이선스 의무 위반으로 보이는 부분이 있으면 [Issues](https://github.com/<USER>/<REPO>/issues/new)로 알려주세요.
