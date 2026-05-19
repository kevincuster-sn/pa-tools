import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ConfirmUnsavedPayload,
  type MenuActionHandler,
  type OpenFileResult,
  type PaToolsApi,
  type SaveFileResult,
  type UnsavedChoice,
} from '../shared/api';

const api: PaToolsApi = {
  openFile: () => ipcRenderer.invoke(IPC_CHANNELS.openFile) as Promise<OpenFileResult>,
  openFileByPath: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFileByPath, path) as Promise<OpenFileResult>,
  saveFile: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveFile, payload) as Promise<SaveFileResult>,
  saveFileAs: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveFileAs, payload) as Promise<SaveFileResult>,
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.getRecentFiles) as Promise<string[]>,
  confirmUnsavedChanges: (payload: ConfirmUnsavedPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmUnsaved, payload) as Promise<UnsavedChoice>,
  setDirtyState: (isDirty: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.setDirty, isDirty);
  },
  onMenuAction: (handler: MenuActionHandler) => {
    ipcRenderer.on(IPC_CHANNELS.menuAction, (_event, action: string, payload?: unknown) =>
      handler(action, payload),
    );
  },
  onRequestCloseConfirm: (handler: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.requestCloseConfirm, () => handler());
  },
  confirmCloseResponse: (allow: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.confirmCloseResponse, allow);
  },
};

contextBridge.exposeInMainWorld('api', api);
