'use client';

import { useCallback, useEffect, type ReactNode } from 'react';
import { emptyDocument } from '../../shared/file-format';
import type { FileIoError, OpenFileResult, SaveFileResult } from '../../shared/api';
import { fileNameFromPath, useDocumentStore } from '../state/document';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

const BASE_TITLE = 'PA Tools';

function reportError(error: FileIoError): void {
  const detail =
    error.issues && error.issues.length > 0
      ? '\n' + error.issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n')
      : '';
  window.alert(`${error.message}${detail}`);
}

export function AppShell({ children }: { children?: ReactNode }) {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const markClean = useDocumentStore((s) => s.markClean);

  const fileName = fileNameFromPath(currentFilePath);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prefix = isDirty ? '• ' : '';
    document.title = `${prefix}${fileName} — ${BASE_TITLE}`;
  }, [fileName, isDirty]);

  useEffect(() => {
    window.api?.setDirtyState(isDirty);
  }, [isDirty]);

  const doSave = useCallback(async (): Promise<boolean> => {
    const doc = currentDocument ?? emptyDocument();
    const result: SaveFileResult = await window.api.saveFile({
      path: currentFilePath ?? undefined,
      document: doc,
    });
    if (!result) return false; // cancelled
    if (!result.ok) {
      reportError(result.error);
      return false;
    }
    loadDocument(doc, result.path);
    markClean();
    return true;
  }, [currentDocument, currentFilePath, loadDocument, markClean]);

  const doSaveAs = useCallback(async (): Promise<boolean> => {
    const doc = currentDocument ?? emptyDocument();
    const result: SaveFileResult = await window.api.saveFileAs({ document: doc });
    if (!result) return false;
    if (!result.ok) {
      reportError(result.error);
      return false;
    }
    loadDocument(doc, result.path);
    markClean();
    return true;
  }, [currentDocument, loadDocument, markClean]);

  const confirmIfDirty = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    const choice = await window.api.confirmUnsavedChanges({ fileName });
    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;
    return doSave();
  }, [isDirty, fileName, doSave]);

  const handleOpenResult = useCallback(
    (result: OpenFileResult) => {
      if (!result) return;
      if (!result.ok) {
        reportError(result.error);
        return;
      }
      loadDocument(result.document, result.path);
    },
    [loadDocument],
  );

  useEffect(() => {
    if (!window.api) return;
    window.api.onMenuAction(async (action, payload) => {
      switch (action) {
        case 'file:new': {
          const ok = await confirmIfDirty();
          if (ok) loadDocument(emptyDocument(), null);
          break;
        }
        case 'file:open': {
          const ok = await confirmIfDirty();
          if (!ok) return;
          handleOpenResult(await window.api.openFile());
          break;
        }
        case 'file:openRecent': {
          const ok = await confirmIfDirty();
          if (!ok) return;
          if (typeof payload === 'string') {
            handleOpenResult(await window.api.openFileByPath(payload));
          }
          break;
        }
        case 'file:save': {
          await doSave();
          break;
        }
        case 'file:saveAs': {
          await doSaveAs();
          break;
        }
        case 'file:close': {
          const ok = await confirmIfDirty();
          if (ok) loadDocument(null, null);
          break;
        }
        default:
          break;
      }
    });
  }, [confirmIfDirty, doSave, doSaveAs, handleOpenResult, loadDocument]);

  useEffect(() => {
    if (!window.api) return;
    window.api.onRequestCloseConfirm(async () => {
      const ok = await confirmIfDirty();
      window.api.confirmCloseResponse(ok);
    });
  }, [confirmIfDirty]);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto bg-bg">{children}</main>
      </div>
      <StatusBar />
    </div>
  );
}
