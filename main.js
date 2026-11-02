const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFile = () => path.join(app.getPath('userData'), 'tasks.json');
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 520, height: 820, minWidth: 360, minHeight: 520,
    title: 'Task Tracking Monitor',
    backgroundColor: '#f7f6f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('load', () => {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); }
  catch (e) { return {}; }
});

ipcMain.handle('save', (_e, data) => {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile());
    return true;
  } catch (e) { return false; }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
