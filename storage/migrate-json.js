'use strict';
const fs = require('fs');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);

// Keen's tasks.json is an object keyed by task id:
//   { "t1abc": { id, date: "2026-11-02", title, tag, mins, status, created: 1730000000000 }, ... }
// Arrays and { tasks: [...] } are also accepted.
function flatten(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tasks)) return raw.tasks;
  if (raw && typeof raw === 'object') return Object.values(raw).filter((v) => v && typeof v === 'object');
  return [];
}

function toSqlTime(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : null;
}

function normalise(t) {
  const title = typeof t.title === 'string' ? t.title.trim() : '';
  const date = typeof t.date === 'string' && DATE_RE.test(t.date) ? t.date : null;
  if (!title || !date) return null;
  const status = STATUSES.has(t.status) ? t.status : 'todo';
  return {
    title,
    task_date: date,
    project: t.tag || null,
    minutes: Number(t.mins) || 0,
    status,
    created: Number(t.created) || 0,
    created_at: toSqlTime(Number(t.created)),
  };
}

// Returns { found, imported, skipped }. The source file is renamed, never deleted.
function importLegacyJson(db, repo, jsonPath) {
  if (!fs.existsSync(jsonPath)) return { found: false, imported: 0, skipped: 0 };
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rows = flatten(raw).map(normalise);
  const good = rows.filter(Boolean).sort((a, b) => a.created - b.created);
  const skipped = rows.length - good.length;

  db.transaction(() => {
    for (const r of good) repo.addTask(r);
  })();

  fs.renameSync(jsonPath, `${jsonPath}.migrated`);
  return { found: true, imported: good.length, skipped };
}

module.exports = { importLegacyJson };
