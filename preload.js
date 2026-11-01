const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  open: f => ipcRenderer.invoke('open', f),
  transcode: f => ipcRenderer.invoke('transcode', f),
  cancel: () => ipcRenderer.invoke('cancel'),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  newWindow: f => ipcRenderer.invoke('new-window', f),
  showInFolder: f => ipcRenderer.invoke('show-in-folder', f),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('exit-fullscreen'),
  setTitle: t => ipcRenderer.send('set-title', t),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  updateState: () => ipcRenderer.invoke('update-state'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  whatsNew: () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'whatsnew.json'), 'utf8')); } catch { return null; } },
  assocStatus: () => ipcRenderer.invoke('assoc-status'),
  setDefaultApp: () => ipcRenderer.invoke('assoc-set-default'),
  fitWindow: v => ipcRenderer.invoke('fit-window', v),
  pathForFile: f => webUtils.getPathForFile(f),
  on: (ch, cb) => ipcRenderer.on(ch, (_e, v) => cb(v))
});
