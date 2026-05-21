import { contextBridge, ipcRenderer } from 'electron';
import type {
  ConfirmUnsavedPayload,
  MenuActionHandler,
  OpenFileResult,
  PaToolsApi,
  SaveFileResult,
  UnsavedChoice,
} from '../shared/api';

// Inlined from shared/api.ts. With sandbox: true, preload scripts cannot
// require relative paths — keep this in sync with IPC_CHANNELS there.
const CH = {
  openFile: 'file:open',
  openFileByPath: 'file:openByPath',
  saveFile: 'file:save',
  saveFileAs: 'file:save-as',
  getRecentFiles: 'file:recent',
  confirmUnsaved: 'file:confirmUnsaved',
  setDirty: 'app:setDirty',
  menuAction: 'menu:action',
  requestCloseConfirm: 'app:requestCloseConfirm',
  confirmCloseResponse: 'app:confirmCloseResponse',
} as const;

const api: PaToolsApi = {
  openFile: () => ipcRenderer.invoke(CH.openFile) as Promise<OpenFileResult>,
  openFileByPath: (path: string) =>
    ipcRenderer.invoke(CH.openFileByPath, path) as Promise<OpenFileResult>,
  saveFile: (payload) => ipcRenderer.invoke(CH.saveFile, payload) as Promise<SaveFileResult>,
  saveFileAs: (payload) => ipcRenderer.invoke(CH.saveFileAs, payload) as Promise<SaveFileResult>,
  getRecentFiles: () => ipcRenderer.invoke(CH.getRecentFiles) as Promise<string[]>,
  confirmUnsavedChanges: (payload: ConfirmUnsavedPayload) =>
    ipcRenderer.invoke(CH.confirmUnsaved, payload) as Promise<UnsavedChoice>,
  setDirtyState: (isDirty: boolean) => {
    ipcRenderer.send(CH.setDirty, isDirty);
  },
  onMenuAction: (handler: MenuActionHandler) => {
    const listener = (_event: unknown, action: string, payload?: unknown) =>
      handler(action, payload);
    ipcRenderer.on(CH.menuAction, listener);
    return () => {
      ipcRenderer.removeListener(CH.menuAction, listener);
    };
  },
  onRequestCloseConfirm: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(CH.requestCloseConfirm, listener);
    return () => {
      ipcRenderer.removeListener(CH.requestCloseConfirm, listener);
    };
  },
  confirmCloseResponse: (allow: boolean) => {
    ipcRenderer.send(CH.confirmCloseResponse, allow);
  },
};

contextBridge.exposeInMainWorld('api', api);
