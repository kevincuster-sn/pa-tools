import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { IPC_CHANNELS } from '../shared/api';
import { registerFileIoHandlers } from './ipc/file-io';
import { buildAppMenu } from './ipc/menu';
import {
  getRecentFilesSync,
  loadRecentFiles,
  onRecentFilesChanged,
  pruneMissing,
} from './recent-files';
import { initAutoUpdater } from './updater';
import { loadWindowState, saveWindowState } from './window-state';

// Must be called before app.whenReady() so Electron sets up the scheme correctly.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let isDirty = false;
let allowClose = false;
let pendingCloseResolve: ((allow: boolean) => void) | null = null;

async function createWindow(): Promise<void> {
  const state = await loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const persist = () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    void saveWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    });
  };
  mainWindow.on('resize', persist);
  mainWindow.on('move', persist);

  mainWindow.on('close', (event) => {
    if (!isDirty || allowClose) return;
    event.preventDefault();
    if (!mainWindow) return;
    mainWindow.webContents.send(IPC_CHANNELS.requestCloseConfirm);
    new Promise<boolean>((resolve) => {
      pendingCloseResolve = resolve;
    }).then((allow) => {
      if (allow) {
        allowClose = true;
        mainWindow?.close();
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL('app://localhost/index.html');
  }
}

app.whenReady().then(async () => {
  const rendererBase = path.resolve(path.join(__dirname, '..', '..', 'renderer', 'out'));
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const filePath = path.resolve(path.join(rendererBase, url.pathname));
    if (!filePath.startsWith(rendererBase)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerFileIoHandlers();

  ipcMain.on(IPC_CHANNELS.setDirty, (_event, dirty: boolean) => {
    isDirty = !!dirty;
  });

  ipcMain.on(IPC_CHANNELS.confirmCloseResponse, (_event, allow: boolean) => {
    pendingCloseResolve?.(!!allow);
    pendingCloseResolve = null;
  });

  await loadRecentFiles();
  await pruneMissing();
  const rebuildMenu = () =>
    buildAppMenu({
      getWindow: () => mainWindow,
      getRecentFiles: () => getRecentFilesSync(),
    });
  rebuildMenu();
  onRecentFilesChanged(() => rebuildMenu());

  await createWindow();

  if (!isDev) {
    initAutoUpdater(() => mainWindow);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
