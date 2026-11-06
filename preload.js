const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ttm', {
  load: () => ipcRenderer.invoke('tasks:load'),
  listProjects: () => ipcRenderer.invoke('tasks:projects'),
  saveTask: (task) => ipcRenderer.invoke('tasks:save', task),
  removeTask: (id) => ipcRenderer.invoke('tasks:remove', id),
  undoTask: (id) => ipcRenderer.invoke('tasks:undo', id),
  reorderTasks: (date, ids) => ipcRenderer.invoke('tasks:reorder', date, ids),
  copyUnfinished: (date) => ipcRenderer.invoke('tasks:copy-unfinished', date),
  saveSummary: (text) => ipcRenderer.invoke('summary:save', text)
});
