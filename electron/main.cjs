const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, shell } = require('electron');

let plannerRuntime;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function createWindow() {
  plannerRuntime = await startEmbeddedPlanner();

  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: 'Weekly Planner by MJB',
    backgroundColor: '#080710',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await window.loadURL(plannerRuntime.url);
}

async function startEmbeddedPlanner() {
  const root = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
  const serverModulePath = path.join(root, 'server', 'index.js');
  const serverModule = await import(pathToFileURL(serverModulePath).href);

  return serverModule.startPlannerServer({
    port: 0,
    host: '127.0.0.1',
    publicDir: path.join(root, 'public'),
    dbPath: path.join(app.getPath('userData'), 'planner.db'),
    silent: true
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  plannerRuntime?.close();
});
