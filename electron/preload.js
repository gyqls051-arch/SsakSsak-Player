const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('offcut', {
  openVideoDialog: () => ipcRenderer.invoke('dialog:openVideo'),
  openSubtitle: () => ipcRenderer.invoke('dialog:openSubtitle'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  chooseDirectory: (defaultPath) => ipcRenderer.invoke('dialog:chooseDirectory', defaultPath),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  mpv: {
    open: (filePath) => ipcRenderer.invoke('mpv:open', filePath),
    command: (cmd, ...args) => ipcRenderer.invoke('mpv:command', cmd, ...args),
    getTracks: () => ipcRenderer.invoke('mpv:getTracks'),
    setProperty: (name, value) => ipcRenderer.invoke('mpv:setProperty', name, value),
    setABLoop: (inPoint, outPoint) => ipcRenderer.invoke('mpv:setABLoop', inPoint, outPoint),
    getProperty: (name) => ipcRenderer.invoke('mpv:getProperty', name),
    onStatus: (handler) => {
      const listener = (_e, status) => handler(status);
      ipcRenderer.on('mpv:status', listener);
      return () => ipcRenderer.removeListener('mpv:status', listener);
    },
  },
  capture: {
    now: (opts) => ipcRenderer.invoke('capture:now', opts),
    copyCurrent: () => ipcRenderer.invoke('capture:copyCurrent'),
    copyFile: (p) => ipcRenderer.invoke('capture:copyFile', p),
    startDrag: (p) => ipcRenderer.invoke('capture:startDrag', p),
    saveImage: (dataUrl, outPath) => ipcRenderer.invoke('capture:saveImage', dataUrl, outPath),
    getDir: () => ipcRenderer.invoke('capture:getDir'),
    setDir: (dir) => ipcRenderer.invoke('capture:setDir', dir),
    reveal: (p) => ipcRenderer.invoke('capture:reveal', p),
  },
  ffprobe: {
    info: (filePath) => ipcRenderer.invoke('ffprobe:info', filePath),
  },
  transcode: {
    presets: () => ipcRenderer.invoke('transcode:presets'),
    start: (params) => ipcRenderer.invoke('transcode:start', params),
    cancel: () => ipcRenderer.invoke('transcode:cancel'),
    onProgress: (handler) => {
      const listener = (_e, data) => handler(data);
      ipcRenderer.on('transcode:progress', listener);
      return () => ipcRenderer.removeListener('transcode:progress', listener);
    },
  },
  video: {
    setBounds: (bounds) => ipcRenderer.invoke('video:setBounds', bounds),
    hide: () => ipcRenderer.invoke('video:hide'),
    setOverlayActive: (active) => ipcRenderer.invoke('video:setOverlayActive', active),
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    onFullscreenChange: (handler) => {
      const listener = (_e, value) => handler(value);
      ipcRenderer.on('window:fullscreen', listener);
      return () => ipcRenderer.removeListener('window:fullscreen', listener);
    },
  },
  menu: {
    showVideo: (ctx) => ipcRenderer.invoke('window:showVideoMenu', ctx),
    onAction: (handler) => {
      const listener = (_e, action) => handler(action);
      ipcRenderer.on('menu:action', listener);
      return () => ipcRenderer.removeListener('menu:action', listener);
    },
  },
  markers: {
    exportXmp: (params) => ipcRenderer.invoke('markers:exportXmp', params),
  },
  notes: {
    exportText: (content, outPath) => ipcRenderer.invoke('notes:exportText', content, outPath),
  },
  clip: {
    extract: (params) => ipcRenderer.invoke('clip:extract', params),
    export: (params) => ipcRenderer.invoke('clip:export', params),
    gif: (params) => ipcRenderer.invoke('clip:gif', params),
  },
  preview: {
    thumbnail: (params) => ipcRenderer.invoke('preview:thumbnail', params),
    waveform: (params) => ipcRenderer.invoke('preview:waveform', params),
    overlayShow: (params) => ipcRenderer.invoke('preview:overlayShow', params),
    overlayHide: () => ipcRenderer.invoke('preview:overlayHide'),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  app: {
    confirmQuit: () => ipcRenderer.invoke('app:confirmQuit'),
    cancelQuit: () => ipcRenderer.invoke('app:cancelQuit'),
    onExitAd: (handler) => {
      const listener = () => handler();
      ipcRenderer.on('app:exit-ad', listener);
      return () => ipcRenderer.removeListener('app:exit-ad', listener);
    },
    rendererReady: () => ipcRenderer.invoke('app:rendererReady'),
    onOpenFile: (handler) => {
      const listener = (_e, p) => handler(p);
      ipcRenderer.on('app:open-file', listener);
      return () => ipcRenderer.removeListener('app:open-file', listener);
    },
  },
  files: {
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return null;
      }
    },
  },
});
