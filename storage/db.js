'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const parseMinutesInput = require('./time');

// Each entry is one schema version. Append new entries; never edit old ones.
// PRAGMA user_version tracks how many have been applied.
const MIGRATIONS = [
  `
  CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color       TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tasks (
    id            INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    task_date     TEXT NOT NULL,                       -- local day, YYYY-MM-DD
    status        TEXT NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo','doing','done','blocked')),
    progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    estimate_min  INTEGER,
    actual_min    INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT,
    deleted_at    TEXT                                  -- soft delete, enables undo
  );
  CREATE INDEX idx_tasks_date         ON tasks(task_date);
  CREATE INDEX idx_tasks_project_date ON tasks(project_id, task_date);

  CREATE TABLE time_entries (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    minutes     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_time_entries_task ON time_entries(task_id);
  `,
  `
  ALTER TABLE tasks ADD COLUMN recurrence TEXT
    CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekdays', 'weekly'));
  ALTER TABLE tasks ADD COLUMN recurrence_id TEXT;
  CREATE UNIQUE INDEX idx_tasks_recurrence_date
    ON tasks(recurrence_id, task_date) WHERE recurrence_id IS NOT NULL;
  `,
];

function migrate(db, file) {
  const current = db.pragma('user_version', { simple: true });
  if (current >= MIGRATIONS.length) return;
  if (current > 0 && fs.existsSync(file)) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(file, `${file}.pre-v${current}.bak`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'tracker.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db, file);
  return db;
}

function parseMinutes(input) {
  return parseMinutesInput(input) ?? 0;
}

const UPDATABLE = ['title', 'status', 'progress', 'estimate_min', 'actual_min', 'notes', 'task_date', 'sort_order'];

function createRepo(db) {
  const upsertProject = db.prepare(
    `INSERT INTO projects(name) VALUES (?)
     ON CONFLICT(name) DO UPDATE SET archived = archived
     RETURNING id`
  );
  const projectId = (name) => (name && String(name).trim() ? upsertProject.get(String(name).trim()).id : null);

  const selectTask = db.prepare(
    `SELECT t.*, p.name AS project FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (title, project_id, task_date, status, progress, estimate_min, actual_min, notes, sort_order, created_at, completed_at, recurrence, recurrence_id)
     VALUES (@title, @project_id, @task_date, @status, @progress, @estimate_min, @actual_min, @notes,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE task_date = @task_date),
             COALESCE(@created_at, datetime('now')),
             CASE WHEN @status = 'done' THEN COALESCE(@created_at, datetime('now')) END,
             @recurrence, @recurrence_id)`
  );

  const getTask = (id) => selectTask.get(id);
  const taskInRecurrence = db.prepare(
    'SELECT 1 FROM tasks WHERE recurrence_id = ? AND task_date = ?'
  );
  const updateStatement = (patch, id, before) => {
    const sets = [];
    const params = { id };
    for (const field of UPDATABLE) {
      if (field in patch) { sets.push(`${field} = @${field}`); params[field] = patch[field]; }
    }
    if ('project' in patch) { sets.push('project_id = @project_id'); params.project_id = projectId(patch.project); }
    if (patch.status) {
      sets.push(`completed_at = CASE WHEN @status = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END`);
      if (patch.status === 'done' && !('progress' in patch)) sets.push('progress = 100');
      if (patch.status !== 'done' && !('progress' in patch)) sets.push('progress = 0');
    }
    if ('recurrence' in patch) {
      sets.push('recurrence = @recurrence');
      params.recurrence = patch.recurrence;
      sets.push('recurrence_id = @recurrence_id');
      params.recurrence_id = patch.recurrence
        ? before.recurrence_id || crypto.randomUUID()
        : null;
    }
    if (!sets.length) return null;
    sets.push(`updated_at = datetime('now')`);
    return { sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = @id AND deleted_at IS NULL`, params };
  };

  function nextOccurrence(task) {
    const date = new Date(`${task.task_date}T12:00:00`);
    if (task.recurrence === 'weekly') date.setDate(date.getDate() + 7);
    else {
      date.setDate(date.getDate() + 1);
      if (task.recurrence === 'weekdays') {
        while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
      }
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function createNextOccurrence(task) {
    if (!task.recurrence || !task.recurrence_id) return;
    const date = nextOccurrence(task);
    if (taskInRecurrence.get(task.recurrence_id, date)) return;
    insertTask.run({
      title: task.title,
      project_id: task.project_id,
      task_date: date,
      status: 'todo',
      progress: 0,
      estimate_min: task.estimate_min,
      actual_min: 0,
      notes: null,
      created_at: null,
      recurrence: task.recurrence,
      recurrence_id: task.recurrence_id,
    });
  }

  function addTask(input) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Task title is required');
    const status = input.status || 'todo';
    const info = insertTask.run({
      title,
      project_id: projectId(input.project),
      task_date: input.task_date,
      status,
      progress: status === 'done' ? 100 : input.progress || 0,
      estimate_min: input.estimate_min ?? null,
      actual_min: parseMinutes(input.minutes ?? input.actual_min),
      notes: input.notes ?? null,
      created_at: input.created_at ?? null,
      recurrence: input.recurrence || null,
      recurrence_id: input.recurrence ? (input.recurrence_id || crypto.randomUUID()) : null,
    });
    return getTask(info.lastInsertRowid);
  }

  function updateTask(id, patch) {
    return db.transaction(() => {
      const before = getTask(id);
      if (!before || before.deleted_at) throw new Error('Task not found');
      const update = updateStatement(patch, id, before);
      if (!update) return before;
      db.prepare(update.sql).run(update.params);
      if ('recurrence' in patch && before.recurrence_id) {
        db.prepare(
          `UPDATE tasks SET recurrence = @recurrence, recurrence_id = @recurrence_id,
             updated_at = datetime('now') WHERE recurrence_id = @previous_id AND id != @id`
        ).run({
          recurrence: patch.recurrence || null,
          recurrence_id: patch.recurrence ? before.recurrence_id : null,
          previous_id: before.recurrence_id,
          id,
        });
      }
      const after = getTask(id);
      const becameDone = patch.status === 'done' && before.status !== 'done';
      const recurrenceAddedToDone = patch.recurrence && before.status === 'done' && !before.recurrence_id;
      if (becameDone || recurrenceAddedToDone) createNextOccurrence(after);
      return after;
    })();
  }

  const listTasksByDate = db.prepare(
    `SELECT t.*, p.name AS project FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.task_date = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.id`
  );
  const listAllTasks = db.prepare(
    `SELECT t.*, p.name AS project FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.deleted_at IS NULL ORDER BY t.task_date, t.sort_order, t.id`
  );
  const softDelete = db.prepare(`UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?`);
  const undelete = db.prepare(`UPDATE tasks SET deleted_at = NULL WHERE id = ?`);
  const copyUnfinishedRows = db.prepare(
    `SELECT * FROM tasks WHERE task_date = ? AND deleted_at IS NULL AND status != 'done'
     ORDER BY sort_order, id`
  );
  const insertCopy = db.prepare(
    `INSERT INTO tasks (title, project_id, task_date, status, progress, estimate_min, actual_min, notes, sort_order)
     VALUES (@title, @project_id, @task_date, 'todo', 0, @estimate_min, 0, @notes,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE task_date = @task_date))`
  );
  const selectIdsByDate = db.prepare(
    'SELECT id FROM tasks WHERE task_date = ? AND deleted_at IS NULL ORDER BY sort_order, id'
  );
  const setSortOrder = db.prepare(
    'UPDATE tasks SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ? AND task_date = ? AND deleted_at IS NULL'
  );

  function copyUnfinishedTasks(fromDate, toDate) {
    return db.transaction(() => copyUnfinishedRows.all(fromDate).map((task) => {
      const result = insertCopy.run({
        title: task.title,
        project_id: task.project_id,
        task_date: toDate,
        estimate_min: task.estimate_min,
        notes: task.notes,
      });
      return getTask(result.lastInsertRowid);
    }))();
  }

  function reorderTasks(date, ids) {
    return db.transaction(() => {
      const existing = selectIdsByDate.all(date).map((task) => String(task.id));
      if (existing.length !== ids.length || existing.some((id) => !ids.includes(id))) {
        throw new Error('Task order does not match the current day');
      }
      ids.forEach((id, index) => setSortOrder.run(index, Number(id), date));
      return listTasksByDate.all(date);
    })();
  }

  // Analytics. All take inclusive YYYY-MM-DD bounds.
  const weekSummary = db.prepare(
    `SELECT COALESCE(p.name, 'No project') AS project,
            COUNT(*) AS tasks,
            SUM(t.status = 'done') AS done,
            SUM(t.actual_min) AS minutes
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.task_date BETWEEN ? AND ? AND t.deleted_at IS NULL
     GROUP BY p.id ORDER BY minutes DESC`
  );
  const dailyTotals = db.prepare(
    `SELECT task_date AS day, COUNT(*) AS tasks, SUM(status = 'done') AS done, SUM(actual_min) AS minutes
     FROM tasks WHERE task_date BETWEEN ? AND ? AND deleted_at IS NULL
     GROUP BY task_date ORDER BY task_date`
  );
  const monthlyTrend = db.prepare(
    `SELECT strftime('%Y-%m', task_date) AS month, COUNT(*) AS tasks, SUM(status = 'done') AS done, SUM(actual_min) AS minutes
     FROM tasks WHERE task_date BETWEEN ? AND ? AND deleted_at IS NULL
     GROUP BY month ORDER BY month`
  );
  const projectProgress = db.prepare(
    `SELECT p.id, p.name, COUNT(t.id) AS tasks, COALESCE(SUM(t.status = 'done'), 0) AS done,
            COALESCE(ROUND(AVG(t.progress)), 0) AS progress, COALESCE(SUM(t.actual_min), 0) AS minutes
     FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
     WHERE p.archived = 0 GROUP BY p.id ORDER BY p.name`
  );

  return {
    addTask,
    updateTask,
    getTask,
    listTasksByDate: (date) => listTasksByDate.all(date),
    listAllTasks: () => listAllTasks.all(),
    deleteTask: (id) => {
      const task = getTask(id);
      if (!task || task.deleted_at) throw new Error('Task not found');
      softDelete.run(id);
      return task;
    },
    undoDelete: (id) => {
      const task = getTask(id);
      if (!task || !task.deleted_at) throw new Error('Deleted task not found');
      undelete.run(id);
      return getTask(id);
    },
    copyUnfinishedTasks,
    reorderTasks,
    listProjects: () => projectProgress.all(),
    weekSummary: (from, to) => weekSummary.all(from, to),
    dailyTotals: (from, to) => dailyTotals.all(from, to),
    monthlyTrend: (from, to) => monthlyTrend.all(from, to),
  };
}

module.exports = { openDb, createRepo, parseMinutes, MIGRATIONS };
