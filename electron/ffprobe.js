const { spawnTracked } = require('./utils.js');

const FFPROBE_TIMEOUT_MS = 20_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_BYTES = 128 * 1024;

function runFfprobe(ffprobeBin, filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      // Restrict to local file/pipe protocols so a crafted path can't be
      // interpreted as a network/concat/subfile protocol URL.
      '-protocol_whitelist', 'file,pipe',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
    const proc = spawnTracked(ffprobeBin, args, { windowsHide: true }, FFPROBE_TIMEOUT_MS);
    let out = '';
    let err = '';
    let overflow = false;
    proc.stdout.on('data', (chunk) => {
      if (Buffer.byteLength(out, 'utf8') + chunk.length > MAX_STDOUT_BYTES) {
        overflow = true;
        try { proc.kill('SIGTERM'); } catch { /* already exited */ }
        return;
      }
      out += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      if (Buffer.byteLength(err, 'utf8') < MAX_STDERR_BYTES) {
        err += chunk.toString('utf8').slice(0, MAX_STDERR_BYTES - Buffer.byteLength(err, 'utf8'));
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (proc.ssakssakTimedOut) {
        reject(new Error('ffprobe 실행 시간이 초과되었습니다'));
        return;
      }
      if (overflow) {
        reject(new Error('ffprobe 출력이 허용 크기를 초과했습니다'));
        return;
      }
      if (code !== 0) {
        reject(new Error(err.trim() || `ffprobe exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe JSON: ${e.message}`));
      }
    });
  });
}

module.exports = { runFfprobe };
