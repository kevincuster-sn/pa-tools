export type OpenFileResult = { path: string; data: unknown } | null;
export type SaveFileResult = { path: string } | null;

export type MenuActionHandler = (action: string) => void;

export interface PaToolsApi {
  openFile(): Promise<OpenFileResult>;
  saveFile(payload: { path?: string; data: unknown }): Promise<SaveFileResult>;
  saveFileAs(payload: { data: unknown }): Promise<SaveFileResult>;
  getRecentFiles(): Promise<string[]>;
  onMenuAction(handler: MenuActionHandler): void;
}

export const IPC_CHANNELS = {
  openFile: 'file:open',
  saveFile: 'file:save',
  saveFileAs: 'file:saveAs',
  getRecentFiles: 'file:recent',
  menuAction: 'menu:action',
} as const;
