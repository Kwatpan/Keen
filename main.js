const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { openDb, createRepo } = require('./storage/db');
const { importLegacyJson } = require('./storage/migrate-json');
const { registerIpc } = require('./storage/ipc');

const legacyFile = () => path.join(app.getPath('userData'), 'tasks.json');
let win = null;
let db = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 560, minHeight: 520,
    title: 'Task Tracking Monitor',
    backgroundColor: '#F4F6F9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function startStorage() {
  db = openDb(app.getPath('userData'));
  const repo = createRepo(db);
  try {
    const result = importLegacyJson(db, repo, legacyFile());
    if (result.found) console.log('Imported legacy tasks.json:', result);
  } catch (e) {
    // The old file is left untouched if the import fails, so nothing is lost.
    console.error('Legacy import failed:', e);
  }
  registerIpc(ipcMain, repo);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { startStorage(); createWindow(); });
  app.on('before-quit', () => { if (db) db.close(); });
  app.on('window-all-closed', () => app.quit());
}
