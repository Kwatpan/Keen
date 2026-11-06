'use strict';
const fs = require('fs/promises');
const path = require('path');
const parseMinutes = require('./time');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES = new Set(['todo', 'doing', 'done', 'blocked']);
const RECURRENCE_VALUES = new Set(['daily', 'weekdays', 'weekly']);
const MAX_MINUTES = 525600;

function assertDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error('Invalid task date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid task date');
  }
  return value;
}

function previousDate(value) {
  const date = new Date(`${assertDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function assertHistoryRange(from, to) {
  const start = new Date(`${assertDate(from)}T00:00:00.000Z`).getTime();
  const end = new Date(`${assertDate(to)}T00:00:00.000Z`).getTime();
  if (end < start || end - start > 6 * 24 * 60 * 60 * 1000) {
    throw new Error('Task history range must be seven days or fewer');
  }
}

function numericId(value, entity = 'task') {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`Invalid ${entity} id`);
  const id = String(value);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error(`Invalid ${entity} id`);
  return Number(id);
}

function toView(row) {
  if (!row) throw new Error('Task not found');
  return {
    id: String(row.id),
    date: row.task_date,
    title: row.title,
    tag: row.project || '',
    mins: row.actual_min,
    status: row.status,
    sortOrder: row.sort_order,
    recurrence: row.recurrence || '',
    created: Date.parse(row.created_at.replace(' ', 'T') + 'Z'),
  };
}

function toProjectTask(row) {
  return {
    ...toView(row),
    estimateMins: row.estimate_min,
    notes: row.notes || '',
  };
}

function validateProjectName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new Error('Project name must be between 1 and 120 characters');
  }
  return value.trim();
}

function validateProjectColor(value) {
  if (value != null && value !== '' && (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))) {
    throw new Error('Project color must be a six-digit hex color');
  }
  return value || null;
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Invalid task');
  if (typeof task.id !== 'string' || task.id.length > 64 || (!/^\d+$/.test(task.id) && !/^t[a-z\d]+$/i.test(task.id))) {
    throw new Error('Invalid task id');
  }
  assertDate(task.date);
  if (typeof task.title !== 'string' || !task.title.trim() || task.title.trim().length > 500) {
    throw new Error('Task title must be between 1 and 500 characters');
  }
  if (task.tag != null && (typeof task.tag !== 'string' || task.tag.trim().length > 120)) {
    throw new Error('Project must be 120 characters or fewer');
  }
  if (task.status != null && !STATUS_VALUES.has(task.status)) throw new Error('Invalid task status');
  const mins = parseMinutes(task.mins);
  if (mins == null || mins > MAX_MINUTES) throw new Error('Invalid task time');
  if (task.recurrence != null && task.recurrence !== '' && !RECURRENCE_VALUES.has(task.recurrence)) {
    throw new Error('Invalid recurrence option');
  }
  return { mins, id: task.id };
}

function registerIpc(ipcMain, repo, options = {}) {
  ipcMain.handle('tasks:load', () => {
    const out = {};
    for (const row of repo.listAllTasks()) out[row.id] = toView(row);
    return out;
  });

  ipcMain.handle('tasks:projects', () => repo.listProjects().map((project) => project.name));

  ipcMain.handle('tasks:history', (_event, from, to) => {
    assertHistoryRange(from, to);
    return repo.listTaskHistory(from, to);
  });

  ipcMain.handle('projects:list', () => repo.listAllProjects());

  ipcMain.handle('projects:tasks', (_event, id) => {
    const projectId = numericId(id, 'project');
    if (!repo.getProject(projectId)) throw new Error('Project not found');
    return repo.listProjectTasks(projectId).map(toProjectTask);
  });

  ipcMain.handle('projects:create', (_event, input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid project');
    return repo.createProject({
      name: validateProjectName(input.name),
      color: validateProjectColor(input.color),
    });
  });

  ipcMain.handle('projects:update', (_event, id, patch) => {
    const projectId = numericId(id, 'project');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid project update');
    const fields = {};
    if ('name' in patch) fields.name = validateProjectName(patch.name);
    if ('color' in patch) fields.color = validateProjectColor(patch.color);
    if (!Object.keys(fields).length) throw new Error('No project changes provided');
    return repo.updateProject(projectId, fields);
  });

  ipcMain.handle('projects:archive', (_event, id, archived) => {
    const projectId = numericId(id, 'project');
    if (typeof archived !== 'boolean') throw new Error('Invalid project archive state');
    return repo.archiveProject(projectId, archived);
  });

  ipcMain.handle('tasks:save', (_event, task) => {
    const { mins, id } = validateTask(task);
    const status = task.status || 'todo';
    const recurrence = task.recurrence || null;
    if (/^\d+$/.test(id)) {
      const current = repo.getTask(Number(id));
      if (!current || current.deleted_at) throw new Error('Task not found');
      return toView(repo.updateTask(Number(id), {
        title: task.title.trim(),
        project: task.tag?.trim() || null,
        actual_min: mins,
        status,
        task_date: task.date,
        recurrence,
      }));
    }
    return toView(repo.addTask({
      title: task.title.trim(),
      project: task.tag?.trim() || null,
      minutes: mins,
      status,
      task_date: task.date,
      recurrence,
    }));
  });

  ipcMain.handle('tasks:remove', (_event, id) => toView(repo.deleteTask(numericId(id))));

  ipcMain.handle('tasks:undo', (_event, id) => toView(repo.undoDelete(numericId(id))));

  ipcMain.handle('tasks:reorder', (_event, date, ids) => {
    assertDate(date);
    if (!Array.isArray(ids) || ids.length > 2000) throw new Error('Invalid task order');
    const parsedIds = ids.map(numericId);
    if (new Set(parsedIds).size !== parsedIds.length) throw new Error('Task order contains duplicate ids');
    return repo.reorderTasks(date, parsedIds.map(String)).map(toView);
  });

  ipcMain.handle('tasks:copy-unfinished', (_event, date) => {
    const targetDate = assertDate(date);
    return repo.copyUnfinishedTasks(previousDate(targetDate), targetDate).map(toView);
  });

  ipcMain.handle('summary:save', async (_event, text) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 200000) {
      throw new Error('Invalid weekly summary');
    }
    if (!options.dialog || typeof options.dialog.showSaveDialog !== 'function') {
      throw new Error('Save dialog is unavailable');
    }
    const dialogOptions = {
      title: 'Save weekly summary',
      defaultPath: path.join(options.documentsPath || '', 'Keen-weekly-summary.txt'),
      filters: [{ name: 'Text files', extensions: ['txt'] }],
    };
    const result = options.getWindow?.()
      ? await options.dialog.showSaveDialog(options.getWindow(), dialogOptions)
      : await options.dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, text, { encoding: 'utf8' });
    return { saved: true };
  });
}

module.exports = { registerIpc, toView, toProjectTask, assertDate, assertHistoryRange, validateTask };
