// Run with Electron's Node so the native module matches (see README):
//   PowerShell: $env:ELECTRON_RUN_AS_NODE=1; npx electron test\storage.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');
const { openDb, createRepo, parseMinutes, MIGRATIONS } = require('../storage/db');
const { importLegacyJson } = require('../storage/migrate-json');
const { registerIpc } = require('../storage/ipc');
const parseMinutesInput = require('../storage/time');

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keen-'));
  const upgradeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keen-v1-'));
  const db = openDb(dir);
  const repo = createRepo(db);

  try {
    assert.strictEqual(MIGRATIONS.length, 2);
    assert.strictEqual(db.pragma('user_version', { simple: true }), 2);
    const oldDb = new Database(path.join(upgradeDir, 'tracker.db'));
    oldDb.exec(MIGRATIONS[0]);
    oldDb.prepare('INSERT INTO tasks (title, task_date) VALUES (?, ?)').run('Keep this row', '2026-01-02');
    oldDb.pragma('user_version = 1');
    oldDb.close();
    const upgradedDb = openDb(upgradeDir);
    try {
      const upgradedRepo = createRepo(upgradedDb);
      assert.strictEqual(upgradedDb.pragma('user_version', { simple: true }), 2);
      assert.strictEqual(upgradedRepo.listAllTasks()[0].title, 'Keep this row');
      assert.ok(fs.existsSync(path.join(upgradeDir, 'tracker.db.pre-v1.bak')));
    } finally {
      upgradedDb.close();
    }

    [['90', 90], ['45m', 45], ['1h', 60], ['1.5h', 90], ['1h30', 90], ['', 0]]
      .forEach(([input, minutes]) => assert.strictEqual(parseMinutes(input), minutes));
    assert.strictEqual(parseMinutesInput('not a duration'), null);
    assert.strictEqual(db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'recurrence'), true);

    const t0 = Date.UTC(2026, 10, 2, 9, 0, 0);
    const legacy = path.join(dir, 'tasks.json');
    fs.writeFileSync(legacy, JSON.stringify({
      tb: { id: 'tb', date: '2026-11-02', title: 'Second', tag: 'Alpha', mins: 30, status: 'blocked', created: t0 + 5000 },
      ta: { id: 'ta', date: '2026-11-02', title: 'First', tag: 'alpha', mins: 45, status: 'done', created: t0 },
      tc: { id: 'tc', date: '2026-11-03', title: 'No tag', tag: '', mins: 0, status: 'todo', created: t0 + 9000 },
      bad: { id: 'bad', date: 'nope', title: 'Broken date', tag: '', mins: 0, status: 'todo', created: t0 },
    }));
    const imported = importLegacyJson(db, repo, legacy);
    assert.deepStrictEqual([imported.found, imported.imported, imported.skipped], [true, 3, 1]);
    assert.ok(fs.existsSync(legacy + '.migrated') && !fs.existsSync(legacy));
    assert.strictEqual(importLegacyJson(db, repo, legacy).found, false);

    const handlers = {};
    let dialogArguments;
    let cancelSummary = false;
    registerIpc({ handle: (channel, handler) => { handlers[channel] = handler; } }, repo, {
      documentsPath: dir,
      dialog: {
        showSaveDialog: async (...args) => {
          dialogArguments = args;
          if (cancelSummary) return { canceled: true, filePath: '' };
          return { canceled: false, filePath: path.join(dir, 'summary.txt') };
        },
      },
    });

    const all = handlers['tasks:load']();
    const importedTasks = Object.values(all);
    assert.strictEqual(importedTasks.length, 3);
    const first = importedTasks.find((task) => task.title === 'First');
    assert.deepStrictEqual([first.tag, first.mins, first.status, first.date], ['alpha', 45, 'done', '2026-11-02']);
    assert.strictEqual(importedTasks.filter((task) => task.tag === 'alpha').length, 2);
    assert.strictEqual(first.created, t0);
    assert.deepStrictEqual(handlers['tasks:projects']().map((name) => name.toLowerCase()).sort(), ['alpha']);
    assert.deepStrictEqual(repo.monthlyTrend('2026-01-01', '2026-12-31'), [
      { month: '2026-11', tasks: 3, done: 1, minutes: 75 },
    ]);
    const project = handlers['projects:create'](null, { name: 'Roadmap', color: '#3B6EA8' });
    assert.deepStrictEqual([project.name, project.color, project.archived], ['Roadmap', '#3B6EA8', 0]);
    const projectTask = handlers['tasks:save'](null, {
      id: 'tproject1', date: '2026-11-10', title: 'Project task', tag: 'Roadmap', mins: 30, status: 'doing',
    });
    const projectSummary = handlers['projects:list']().find((item) => item.id === project.id);
    assert.deepStrictEqual(
      [projectSummary.tasks, projectSummary.done, projectSummary.minutes],
      [1, 0, 30]
    );
    assert.deepStrictEqual(
      handlers['projects:tasks'](null, String(project.id)).map(({ title, status, mins }) => [title, status, mins]),
      [['Project task', 'doing', 30]]
    );
    const renamedProject = handlers['projects:update'](null, String(project.id), {
      name: 'Keen Roadmap', color: '#3F8F7B',
    });
    assert.deepStrictEqual([renamedProject.name, renamedProject.color], ['Keen Roadmap', '#3F8F7B']);
    assert.strictEqual(handlers['tasks:load']()[projectTask.id].tag, 'Keen Roadmap');
    assert.strictEqual(handlers['projects:archive'](null, String(project.id), true).archived, 1);
    assert.ok(!handlers['tasks:projects']().includes('Keen Roadmap'));
    assert.strictEqual(handlers['projects:tasks'](null, String(project.id)).length, 1);
    assert.strictEqual(handlers['projects:archive'](null, String(project.id), false).archived, 0);
    assert.throws(() => handlers['projects:create'](null, { name: '   ', color: '#fff' }), /Project name/);
    assert.throws(() => handlers['projects:update'](null, String(project.id), { color: 'red' }), /six-digit hex/);
    assert.throws(() => handlers['projects:archive'](null, String(project.id), 'yes'), /archive state/);
    assert.throws(() => handlers['projects:tasks'](null, '999999'), /not found/);
    assert.throws(() => handlers['projects:update'](null, 'invalid', { name: 'Nope' }), /project id/);
    assert.strictEqual(handlers['projects:create'](null, { name: 'No color' }).color, null);

    const added = handlers['tasks:save'](null, {
      id: 'tnew123', date: '2026-11-04', title: ' New one ', tag: 'Beta', mins: '1h30', status: 'todo',
    });
    assert.ok(/^\d+$/.test(added.id) && added.title === 'New one');
    assert.strictEqual(added.mins, 90);
    const edited = handlers['tasks:save'](null, {
      ...added, title: 'Edited title', tag: 'Gamma', mins: '45m', status: 'doing',
    });
    assert.deepStrictEqual([edited.title, edited.tag, edited.mins, edited.status], ['Edited title', 'Gamma', 45, 'doing']);

    const source = handlers['tasks:save'](null, {
      id: 'tsource9', date: '2026-11-04', title: 'Carry this', tag: 'Gamma', mins: 30, status: 'todo',
    });
    const copied = handlers['tasks:copy-unfinished'](null, '2026-11-05');
    assert.strictEqual(copied.length, 2);
    assert.ok(copied.every((task) => task.date === '2026-11-05' && task.status === 'todo' && task.mins === 0));
    assert.ok(copied.every((task) => !task.recurrence));

    const order = repo.listTasksByDate('2026-11-04').map((task) => String(task.id));
    const reordered = handlers['tasks:reorder'](null, '2026-11-04', order.slice().reverse());
    assert.deepStrictEqual(reordered.map((task) => task.id), order.slice().reverse());
    assert.deepStrictEqual(reordered.map((task) => task.sortOrder), [0, 1]);
    assert.throws(() => handlers['tasks:reorder'](null, '2026-11-04', [order[0]]), /does not match/);
    assert.throws(() => handlers['tasks:reorder'](null, '2026-11-04', [order[0], order[0]]), /duplicate/);

    const recurring = handlers['tasks:save'](null, {
      id: 'trepeat1', date: '2026-11-06', title: 'Weekday task', tag: 'Gamma',
      mins: '1.5h', status: 'todo', recurrence: 'weekdays',
    });
    const completed = handlers['tasks:save'](null, { ...recurring, status: 'done' });
    assert.strictEqual(completed.status, 'done');
    const mondayTask = repo.listTasksByDate('2026-11-09').find((task) => task.title === 'Weekday task');
    assert.ok(mondayTask, 'weekday recurrence skips the weekend');
    assert.deepStrictEqual([mondayTask.status, mondayTask.actual_min, mondayTask.recurrence], ['todo', 0, 'weekdays']);
    handlers['tasks:save'](null, { ...completed, status: 'done' });
    assert.strictEqual(repo.listTasksByDate('2026-11-09').filter((task) => task.title === 'Weekday task').length, 1);
    const mondayTaskView = handlers['tasks:load']()[mondayTask.id];
    handlers['tasks:save'](null, { ...mondayTaskView, recurrence: 'weekly' });
    const updatedMonday = handlers['tasks:load']()[mondayTask.id];
    handlers['tasks:save'](null, { ...updatedMonday, status: 'done' });
    assert.ok(repo.listTasksByDate('2026-11-16').some((task) => task.title === 'Weekday task' && task.recurrence === 'weekly'));

    const removed = handlers['tasks:remove'](null, added.id);
    assert.strictEqual(removed.id, added.id);
    assert.ok(!handlers['tasks:load']()[added.id]);
    const restored = handlers['tasks:undo'](null, added.id);
    assert.deepStrictEqual([restored.id, restored.title], [added.id, 'Edited title']);
    assert.throws(() => handlers['tasks:undo'](null, added.id), /not found/);

    assert.throws(() => handlers['tasks:save'](null, { id: 'tbad1', date: '2026-02-30', title: 'x' }), /date/);
    assert.throws(() => handlers['tasks:save'](null, { id: 'tbad2', date: '2026-11-04', title: 'x', status: 'invalid' }), /status/);
    assert.throws(() => handlers['tasks:save'](null, { id: 'tbad3', date: '2026-11-04', title: 'x', mins: 'soon' }), /time/);
    assert.throws(() => handlers['tasks:save'](null, { id: 'bad id', date: '2026-11-04', title: 'x' }), /id/);
    assert.throws(() => handlers['tasks:save'](null, { id: 'tbad4', date: '2026-11-04', title: 'x'.repeat(501) }), /title/);
    assert.throws(() => handlers['tasks:copy-unfinished'](null, 'not-a-date'), /date/);

    const summary = 'Weekly summary\nTasks: 2';
    const saved = await handlers['summary:save'](null, summary);
    assert.strictEqual(saved.saved, true);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'summary.txt'), 'utf8'), summary);
    assert.strictEqual(dialogArguments[0].title, 'Save weekly summary');
    assert.deepStrictEqual(dialogArguments[0].filters, [{ name: 'Text files', extensions: ['txt'] }]);
    cancelSummary = true;
    assert.deepStrictEqual(await handlers['summary:save'](null, summary), { saved: false });
    await assert.rejects(() => handlers['summary:save'](null, '  '), /summary/);

    console.log('ALL PASSED');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(upgradeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
