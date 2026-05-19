import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const MAX_RECENT = 10;
const FILE_NAME = 'recent-files.json';

function recentFilePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

let cached: string[] | null = null;
let listeners: Array<(files: string[]) => void> = [];

export async function loadRecentFiles(): Promise<string[]> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(recentFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    cached = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    cached = [];
  }
  return cached;
}

async function persist(files: string[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(recentFilePath()), { recursive: true });
    await fs.writeFile(recentFilePath(), JSON.stringify(files, null, 2), 'utf8');
  } catch {
    // best-effort
  }
}

export async function addRecentFile(filePath: string): Promise<string[]> {
  const list = await loadRecentFiles();
  const next = [filePath, ...list.filter((p) => p !== filePath)].slice(0, MAX_RECENT);
  cached = next;
  await persist(next);
  for (const l of listeners) l(next);
  return next;
}

export async function pruneMissing(): Promise<string[]> {
  const list = await loadRecentFiles();
  const checks = await Promise.all(
    list.map(async (p) => {
      try {
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    }),
  );
  const next = checks.filter((p): p is string => p !== null);
  if (next.length !== list.length) {
    cached = next;
    await persist(next);
    for (const l of listeners) l(next);
  }
  return next;
}

export function getRecentFilesSync(): string[] {
  return cached ?? [];
}

export function onRecentFilesChanged(fn: (files: string[]) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
