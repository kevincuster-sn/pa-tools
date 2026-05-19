import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';

export function registerFileIoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.openFile, async () => {
    return null;
  });

  ipcMain.handle(
    IPC_CHANNELS.saveFile,
    async (_event, _payload: { path?: string; data: unknown }) => {
      return null;
    },
  );

  ipcMain.handle(IPC_CHANNELS.saveFileAs, async (_event, _payload: { data: unknown }) => {
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.getRecentFiles, async (): Promise<string[]> => {
    return [];
  });
}
