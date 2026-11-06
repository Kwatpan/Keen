const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ttm', {
  load: () => ipcRenderer.invoke('tasks:load'),
  listTaskHistory: (from, to) => ipcRenderer.invoke('tasks:history', from, to),
  listProjects: () => ipcRenderer.invoke('tasks:projects'),
  listProjectFolders: () => ipcRenderer.invoke('projects:list'),
  listProjectTasks: (id) => ipcRenderer.invoke('projects:tasks', id),
  createProject: (project) => ipcRenderer.invoke('projects:create', project),
  updateProject: (id, patch) => ipcRenderer.invoke('projects:update', id, patch),
  archiveProject: (id, archived) => ipcRenderer.invoke('projects:archive', id, archived),
  saveTask: (task) => ipcRenderer.invoke('tasks:save', task),
  removeTask: (id) => ipcRenderer.invoke('tasks:remove', id),
  undoTask: (id) => ipcRenderer.invoke('tasks:undo', id),
  reorderTasks: (date, ids) => ipcRenderer.invoke('tasks:reorder', date, ids),
  copyUnfinished: (date) => ipcRenderer.invoke('tasks:copy-unfinished', date),
  saveSummary: (text) => ipcRenderer.invoke('summary:save', text)
});
