import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type MenuActionHandler,
  type OpenFileResult,
  type PaToolsApi,
  type SaveFileResult,
} from '../shared/api';

const api: PaToolsApi = {
  openFile: () => ipcRenderer.invoke(IPC_CHANNELS.openFile) as Promise<OpenFileResult>,
  saveFile: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveFile, payload) as Promise<SaveFileResult>,
  saveFileAs: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveFileAs, payload) as Promise<SaveFileResult>,
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.getRecentFiles) as Promise<string[]>,
  onMenuAction: (handler: MenuActionHandler) => {
    ipcRenderer.on(IPC_CHANNELS.menuAction, (_event, action: string) => handler(action));
  },
};

contextBridge.exposeInMainWorld('api', api);
