const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ttm', {
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data)
});
