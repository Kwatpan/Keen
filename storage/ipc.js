'use strict';
const { parseMinutes } = require('./db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Maps a database row to the shape the current renderer already uses.
function toView(row) {
  return {
    id: String(row.id),
    date: row.task_date,
    title: row.title,
    tag: row.project || '',
    mins: row.actual_min,
    status: row.status,
    created: Date.parse(row.created_at.replace(' ', 'T') + 'Z'),
  };
}

function registerIpc(ipcMain, repo) {
  ipcMain.handle('tasks:load', () => {
    const out = {};
    for (const row of repo.listAllTasks()) out[row.id] = toView(row);
    return out;
  });

  // Creates when the id is not a database id yet (the renderer invents "t…" ids), otherwise updates.
  ipcMain.handle('tasks:save', (_event, t) => {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) throw new Error('Task title is required');
    if (!DATE_RE.test(String(t.date))) throw new Error('Invalid task date');
    const id = String(t.id);
    if (/^\d+$/.test(id) && repo.getTask(Number(id))) {
      return toView(repo.updateTask(Number(id), {
        title: t.title.trim(),
        project: t.tag || null,
        actual_min: parseMinutes(t.mins),
        status: t.status,
        task_date: t.date,
      }));
    }
    return toView(repo.addTask({
      title: t.title,
      project: t.tag,
      minutes: t.mins,
      status: t.status,
      task_date: t.date,
    }));
  });

  ipcMain.handle('tasks:remove', (_event, id) => {
    repo.deleteTask(Number(id));
    return true;
  });
}

module.exports = { registerIpc, toView };
