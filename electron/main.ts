import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerFileIoHandlers } from './ipc/file-io';
import { buildAppMenu } from './ipc/menu';
import { loadWindowState, saveWindowState } from './window-state';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

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
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'out', 'index.html'));
  }
}

app.whenReady().then(async () => {
  registerFileIoHandlers();
  buildAppMenu(() => mainWindow);
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
