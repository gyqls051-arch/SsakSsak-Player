// electron/utils.js 순수 함수 단위 테스트. 러너 없이 node --test로 돌린다.
//   npm test  (= node --test tests/)
// electron 모듈은 plain node에서 바이너리 경로 문자열로 resolve되므로
// app을 쓰지 않는 순수 함수만 여기서 검증한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// utils.js가 require('electron')을 하는데 plain node에선 바이너리 미설치로
// throw하므로 로드 전에 require 캐시에 스텁을 심는다.
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => os.tmpdir() } },
};

const utils = require('../electron/utils.js');
const state = require('../electron/state.js');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssakssak-test-'));
}

test('sanitizeBasename: 위험 문자와 제어문자 제거', () => {
  assert.equal(utils.sanitizeBasename('a<b>:c"d/e\\f|g?h*i'), 'a_b__c_d_e_f_g_h_i');
  assert.equal(utils.sanitizeBasename('name\x07file'), 'name_file');
  assert.equal(utils.sanitizeBasename('...'), 'capture');
  assert.equal(utils.sanitizeBasename(''), 'capture');
  assert.equal(utils.sanitizeBasename(null), 'capture');
  assert.equal(utils.sanitizeBasename('영상 파일.mp4'), '영상 파일.mp4');
});

test('sanitizeBasename: 180바이트 초과 시 잘라내고 해시 접미사', () => {
  const long = '가'.repeat(200); // 600 bytes
  const out = utils.sanitizeBasename(long);
  assert.ok(Buffer.byteLength(out, 'utf8') <= 180);
  assert.match(out, /-[0-9a-f]{12}$/);
  // 같은 원본은 같은 접미사 → 충돌 없이 안정적
  assert.equal(utils.sanitizeBasename(long), out);
});

test('formatTimeForFilename: HH-MM-SS-mmm', () => {
  assert.equal(utils.formatTimeForFilename(0), '00-00-00-000');
  assert.equal(utils.formatTimeForFilename(3661.5), '01-01-01-500');
  assert.equal(utils.formatTimeForFilename(-5), '00-00-00-000');
  assert.equal(utils.formatTimeForFilename(NaN), '00-00-00-000');
});

test('validateMediaInput: 확장자 화이트리스트와 실존 파일 검증', () => {
  const dir = tmpdir();
  const ok = path.join(dir, 'clip.mp4');
  const bad = path.join(dir, 'evil.exe');
  fs.writeFileSync(ok, 'x');
  fs.writeFileSync(bad, 'x');
  assert.equal(utils.validateMediaInput(ok), path.resolve(ok));
  assert.throws(() => utils.validateMediaInput(bad), /허용되지 않은/);
  assert.throws(() => utils.validateMediaInput(dir), /파일이 아닙니다/);
  assert.throws(() => utils.validateMediaInput(path.join(dir, 'none.mp4')), /찾을 수 없습니다/);
  assert.throws(() => utils.validateMediaInput(''), /입력 경로가 없습니다/);
  assert.throws(() => utils.validateMediaInput(123), /입력 경로가 없습니다/);
});

test('extractFileArg: argv에서 첫 재생 가능 파일만 추출', () => {
  const dir = tmpdir();
  const media = path.join(dir, 'movie.mkv');
  const txt = path.join(dir, 'note.txt');
  fs.writeFileSync(media, 'x');
  fs.writeFileSync(txt, 'x');
  assert.equal(
    utils.extractFileArg(['electron', '.', txt, media], dir),
    media,
  );
  assert.equal(utils.extractFileArg(['electron', '.', '--flag', txt], dir), null);
  assert.equal(utils.extractFileArg(['electron', dir], dir), null); // 디렉터리 제외
});

test('uniquePath: 충돌 시 _2 접미사, 덮어쓰기 없음', () => {
  const dir = tmpdir();
  const p = path.join(dir, 'cap.png');
  assert.equal(utils.uniquePath(p), p);
  fs.writeFileSync(p, 'x');
  const p2 = utils.uniquePath(p);
  assert.equal(p2, path.join(dir, 'cap_2.png'));
  fs.writeFileSync(p2, 'x');
  assert.equal(utils.uniquePath(p), path.join(dir, 'cap_3.png'));
});

test('isPathContained: base 밖 경로 차단', () => {
  const dir = tmpdir();
  const inner = path.join(dir, 'sub', 'f.mp4');
  fs.mkdirSync(path.dirname(inner), { recursive: true });
  fs.writeFileSync(inner, 'x');
  const outside = tmpdir();
  assert.equal(utils.isPathContained(dir, inner), true);
  assert.equal(utils.isPathContained(dir, dir, true), true);
  assert.equal(utils.isPathContained(dir, dir, false), false);
  assert.equal(utils.isPathContained(dir, outside), false);
  assert.equal(utils.isPathContained(dir, path.join(dir, '..', 'x')), false);
});

test('canonicalOutputPath: 비절대/디렉터리 파일명 거부', () => {
  const dir = tmpdir();
  assert.equal(
    utils.canonicalOutputPath(path.join(dir, 'out.mp4')),
    path.join(fs.realpathSync(dir), 'out.mp4'),
  );
  assert.throws(() => utils.canonicalOutputPath('relative/out.mp4'), /절대/);
  assert.throws(() => utils.canonicalOutputPath('/'), /파일명/);
  assert.throws(() => utils.canonicalOutputPath('/no/such/dir/f.mp4'), /./);
});

test('writeFileAtomic: 임시 경유 쓰기로 부분 파일이 남지 않음', async () => {
  const dir = tmpdir();
  const p = path.join(dir, 'a.txt');
  await utils.writeFileAtomic(p, 'hello', undefined, undefined);
  assert.equal(fs.readFileSync(p, 'utf8'), 'hello');
  // 같은 디렉터리에 .ssakssak-* 임시 파일이 남지 않는다
  assert.deepEqual(fs.readdirSync(dir), ['a.txt']);
});

test('getCaptureDir: state.captureDir이 살아있으면 그대로 사용', () => {
  const dir = tmpdir();
  state.captureDir = dir;
  assert.equal(utils.getCaptureDir(), dir);
  state.captureDir = null;
});

test('FF_PROTOCOL_WHITELIST: ffmpeg에 file,pipe만 허용', () => {
  assert.deepEqual(utils.FF_PROTOCOL_WHITELIST, ['-protocol_whitelist', 'file,pipe']);
});
