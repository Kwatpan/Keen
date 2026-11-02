const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ttm', {
  load: () => ipcRenderer.invoke('tasks:load'),
  saveTask: (task) => ipcRenderer.invoke('tasks:save', task),
  removeTask: (id) => ipcRenderer.invoke('tasks:remove', id)
});
