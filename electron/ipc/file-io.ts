import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  IPC_CHANNELS,
  type ConfirmUnsavedPayload,
  type ExportSavePayload,
  type ExportSaveResult,
  type FileIoError,
  type OpenFileResult,
  type SaveFileAsPayload,
  type SaveFileResult,
  type SaveFilePayload,
  type UnsavedChoice,
} from '../../shared/api';
import { PAMAP_EXTENSION } from '../../shared/file-format';
import { packPamap, unpackPamap } from '../../shared/pamap';
import { NewerFileFormatError, MissingMigrationError } from '../../shared/migrations';
import { PamapValidationError } from '../../shared/schemas';
import { addRecentFile, loadRecentFiles } from '../recent-files';

// In-flight identity for the document currently held by the renderer.
// Lets us preserve fileId + createdAt across saves of the same document.
interface ActiveDocMeta {
  filePath: string | null;
  fileId: string;
  createdAt: string;
}
let activeDoc: ActiveDocMeta | null = null;

function newActiveMeta(filePath: string | null): ActiveDocMeta {
  return {
    filePath,
    fileId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

function errorToFileIoError(e: unknown): FileIoError {
  if (e instanceof PamapValidationError) {
    return { kind: 'validation', message: e.message, issues: e.issues };
  }
  if (e instanceof NewerFileFormatError) {
    return { kind: 'newer-version', message: e.message };
  }
  if (e instanceof MissingMigrationError) {
    return { kind: 'validation', message: e.message };
  }
  if (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'ENOENT'
  ) {
    return { kind: 'not-found', message: e instanceof Error ? e.message : String(e) };
  }
  return { kind: 'io', message: e instanceof Error ? e.message : String(e) };
}

async function readAndParse(filePath: string): Promise<OpenFileResult> {
  try {
    const buf = await fs.readFile(filePath);
    const bundle = await unpackPamap(buf);
    activeDoc = {
      filePath,
      fileId: bundle.manifest.fileId,
      createdAt: bundle.manifest.createdAt,
    };
    await addRecentFile(filePath);
    return { ok: true, path: filePath, document: bundle.document };
  } catch (e) {
    return { ok: false, error: errorToFileIoError(e) };
  }
}

async function writeBundle(filePath: string, payload: SaveFilePayload): Promise<SaveFileResult> {
  try {
    if (!activeDoc || activeDoc.filePath !== filePath) {
      // First save to this path — adopt or create identity.
      activeDoc = activeDoc ? { ...activeDoc, filePath } : newActiveMeta(filePath);
    }
    const bytes = await packPamap(payload.document, {
      appVersion: app.getVersion(),
      fileId: activeDoc.fileId,
      createdAt: activeDoc.createdAt,
    });
    await fs.writeFile(filePath, bytes);
    activeDoc.filePath = filePath;
    await addRecentFile(filePath);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: errorToFileIoError(e) };
  }
}

export function registerFileIoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.openFile, async (event): Promise<OpenFileResult> => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const opts: Electron.OpenDialogOptions = {
      title: 'Open PA Workbench file',
      properties: ['openFile'],
      filters: [{ name: 'PA Workbench', extensions: [PAMAP_EXTENSION] }],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return readAndParse(result.filePaths[0]!);
  });

  ipcMain.handle(
    IPC_CHANNELS.openFileByPath,
    async (_event, filePath: string): Promise<OpenFileResult> => {
      return readAndParse(filePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveFile,
    async (event, payload: SaveFilePayload): Promise<SaveFileResult> => {
      const target = payload.path ?? activeDoc?.filePath ?? null;
      if (!target) {
        // No known path — delegate to Save As flow.
        return saveAsFlow(event.sender, payload);
      }
      return writeBundle(target, payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveFileAs,
    async (event, payload: SaveFileAsPayload): Promise<SaveFileResult> => {
      return saveAsFlow(event.sender, payload);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getRecentFiles, async (): Promise<string[]> => {
    return loadRecentFiles();
  });

  ipcMain.handle(
    IPC_CHANNELS.exportSave,
    async (event, payload: ExportSavePayload): Promise<ExportSaveResult> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const opts: Electron.SaveDialogOptions = {
        title: 'Export capability map',
        defaultPath: payload.defaultName,
        filters: [{ name: payload.filterName, extensions: payload.extensions }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return null;
      try {
        await fs.writeFile(result.filePath, Buffer.from(payload.data));
        return { ok: true, path: result.filePath };
      } catch (e) {
        return { ok: false, error: errorToFileIoError(e) };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.confirmUnsaved,
    async (event, payload: ConfirmUnsavedPayload): Promise<UnsavedChoice> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const opts: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Save changes to ${payload.fileName}?`,
        detail: 'Your changes will be lost if you don’t save them.',
        noLink: true,
      };
      const result = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
      if (result.response === 0) return 'save';
      if (result.response === 1) return 'discard';
      return 'cancel';
    },
  );
}

async function saveAsFlow(
  sender: Electron.WebContents,
  payload: SaveFilePayload | SaveFileAsPayload,
): Promise<SaveFileResult> {
  const win = BrowserWindow.fromWebContents(sender) ?? undefined;
  const defaultName =
    (payload as SaveFilePayload).path ?? activeDoc?.filePath ?? `Untitled.${PAMAP_EXTENSION}`;
  const opts: Electron.SaveDialogOptions = {
    title: 'Save PA Workbench file',
    defaultPath: path.basename(defaultName),
    filters: [{ name: 'PA Workbench', extensions: [PAMAP_EXTENSION] }],
  };
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (result.canceled || !result.filePath) return null;
  return writeBundle(result.filePath, { document: payload.document, path: result.filePath });
}

// Test/runtime hook for resetting in-memory state — used when starting a new document.
export function resetActiveDoc(): void {
  activeDoc = null;
}
