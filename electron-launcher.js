const electronPath = require('electron');
const { spawn } = require('node:child_process');

if (typeof electronPath !== 'string') {
  console.error('[launcher] Expected electron binary path, got:', typeof electronPath);
  process.exit(1);
}

// CRITICAL: strip ELECTRON_RUN_AS_NODE — if set in the parent shell, the spawned
// electron binary will run as plain Node and `require('electron')` returns the
// binary path string instead of the main-process module object.
const env = { ...process.env, NODE_ENV: 'development' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

console.log('[launcher] electron:', electronPath);

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[launcher] Failed to spawn electron:', err);
  process.exit(1);
});
