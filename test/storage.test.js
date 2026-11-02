// Run with Electron's Node so the native module matches (see README):
//   PowerShell: $env:ELECTRON_RUN_AS_NODE=1; npx electron test\storage.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { openDb, createRepo, parseMinutes } = require('../storage/db');
const { importLegacyJson } = require('../storage/migrate-json');
const { registerIpc } = require('../storage/ipc');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttm-'));
const db = openDb(dir);
const repo = createRepo(db);

// schema + parser
assert.strictEqual(db.pragma('user_version', { simple: true }), 1);
[['90', 90], ['45m', 45], ['1h', 60], ['1.5h', 90], ['1h30', 90], ['', 0]].forEach(([s, m]) => assert.strictEqual(parseMinutes(s), m));

// legacy import in the exact shape the old renderer wrote
const t0 = Date.UTC(2026, 10, 2, 9, 0, 0);
const legacy = path.join(dir, 'tasks.json');
fs.writeFileSync(legacy, JSON.stringify({
  tb: { id: 'tb', date: '2026-11-02', title: 'Second', tag: 'Alpha', mins: 30, status: 'blocked', created: t0 + 5000 },
  ta: { id: 'ta', date: '2026-11-02', title: 'First', tag: 'alpha', mins: 45, status: 'done', created: t0 },
  tc: { id: 'tc', date: '2026-11-03', title: 'No tag', tag: '', mins: 0, status: 'todo', created: t0 + 9000 },
  bad: { id: 'bad', date: 'nope', title: 'Broken date', tag: '', mins: 0, status: 'todo', created: t0 },
}));
const r = importLegacyJson(db, repo, legacy);
assert.deepStrictEqual([r.found, r.imported, r.skipped], [true, 3, 1]);
assert.ok(fs.existsSync(legacy + '.migrated') && !fs.existsSync(legacy));
assert.strictEqual(importLegacyJson(db, repo, legacy).found, false, 'second run is a no-op');

// IPC handlers behave like the old load/save from the renderer's point of view
const handlers = {};
registerIpc({ handle: (ch, fn) => { handlers[ch] = fn; } }, repo);
const all = handlers['tasks:load']();
const list = Object.values(all);
assert.strictEqual(list.length, 3);
const first = list.find((t) => t.title === 'First');
assert.deepStrictEqual([first.tag, first.mins, first.status, first.date], ['alpha', 45, 'done', '2026-11-02']);
assert.strictEqual(list.filter((t) => t.tag === 'alpha').length, 2, 'project names match case-insensitively');
assert.ok(first.created === t0, 'original created time preserved');

const added = handlers['tasks:save'](null, { id: 'tnew123', date: '2026-11-04', title: ' New one ', tag: 'Beta', mins: 20, status: 'todo' });
assert.ok(/^\d+$/.test(added.id) && added.title === 'New one');
const toggled = handlers['tasks:save'](null, { ...added, status: 'done' });
assert.strictEqual(toggled.id, added.id); assert.strictEqual(toggled.status, 'done');
handlers['tasks:remove'](null, added.id);
assert.strictEqual(Object.keys(handlers['tasks:load']()).length, 3);
assert.throws(() => handlers['tasks:save'](null, { id: 'x', date: 'bad', title: 'x', status: 'todo' }));

console.log(repo.monthlyTrend('2026-01-01', '2026-12-31'));
db.close();
console.log('ALL PASSED');
