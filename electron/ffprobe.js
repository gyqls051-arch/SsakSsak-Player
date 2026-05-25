const { spawn } = require('node:child_process');

function runFfprobe(ffprobeBin, filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
    const proc = spawn(ffprobeBin, args, { windowsHide: true });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c.toString('utf8')));
    proc.stderr.on('data', (c) => (err += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
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
