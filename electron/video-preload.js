const { ipcRenderer } = require('electron');

// Single + double click on the embedded video area. We can't get mouse
// events from inside mpv (it has --input-vo-keyboard=no and consumes none),
// but mpv overlays the child window's HWND while leaving HTML body events
// intact — so a thin DOM listener here is enough.
let lastDownAt = 0;
let singleTimer = null;
const DOUBLE_CLICK_MS = 280;

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const now = Date.now();
  if (now - lastDownAt < DOUBLE_CLICK_MS) {
    if (singleTimer) {
      clearTimeout(singleTimer);
      singleTimer = null;
    }
    lastDownAt = 0;
    ipcRenderer.send('video:dblclick');
    return;
  }
  lastDownAt = now;
  singleTimer = setTimeout(() => {
    singleTimer = null;
    ipcRenderer.send('video:click');
  }, DOUBLE_CLICK_MS);
});
