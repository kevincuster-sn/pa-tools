import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const DEFAULT_STATE: WindowState = { width: 1600, height: 1000 };

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await fs.readFile(stateFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_STATE.width,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_STATE.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveWindowState(state: WindowState): Promise<void> {
  try {
    await fs.mkdir(path.dirname(stateFile()), { recursive: true });
    await fs.writeFile(stateFile(), JSON.stringify(state), 'utf8');
  } catch {
    // Ignore persistence failures — non-critical.
  }
}
