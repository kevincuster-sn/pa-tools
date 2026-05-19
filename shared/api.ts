import type { Document } from './file-format';

export type FileIoError = {
  kind: 'cancelled' | 'not-found' | 'validation' | 'newer-version' | 'io';
  message: string;
  issues?: { path: string; message: string }[];
};

export type OpenFileResult =
  | { ok: true; path: string; document: Document }
  | { ok: false; error: FileIoError }
  | null;

export type SaveFileResult = { ok: true; path: string } | { ok: false; error: FileIoError } | null;

export type MenuActionHandler = (action: string, payload?: unknown) => void;

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

export interface ConfirmUnsavedPayload {
  fileName: string;
}

export interface SaveFilePayload {
  path?: string;
  document: Document;
}

export interface SaveFileAsPayload {
  document: Document;
}

export interface PaToolsApi {
  openFile(): Promise<OpenFileResult>;
  openFileByPath(path: string): Promise<OpenFileResult>;
  saveFile(payload: SaveFilePayload): Promise<SaveFileResult>;
  saveFileAs(payload: SaveFileAsPayload): Promise<SaveFileResult>;
  getRecentFiles(): Promise<string[]>;
  confirmUnsavedChanges(payload: ConfirmUnsavedPayload): Promise<UnsavedChoice>;
  setDirtyState(isDirty: boolean): void;
  onMenuAction(handler: MenuActionHandler): void;
  onRequestCloseConfirm(handler: () => void): void;
  confirmCloseResponse(allow: boolean): void;
}

export const IPC_CHANNELS = {
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
