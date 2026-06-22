import { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import { checkForUpdatesManual } from '../updater';

export interface MenuOptions {
  getWindow: () => BrowserWindow | null;
  getRecentFiles: () => string[];
}

export function buildAppMenu(opts: MenuOptions): void {
  const send = (action: string, payload?: unknown) => {
    const win = opts.getWindow();
    if (win) win.webContents.send(IPC_CHANNELS.menuAction, action, payload);
  };

  const isMac = process.platform === 'darwin';
  const recent = opts.getRecentFiles();

  const recentSubmenu: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: 'No Recent Files', enabled: false }]
      : recent.map((p) => ({
          label: p,
          click: () => send('file:openRecent', p),
        }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: 'PA Tools',
            submenu: [
              { role: 'about' },
              {
                label: 'Check for Updates…',
                click: () => void checkForUpdatesManual(opts.getWindow),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('file:new'),
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('file:open'),
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('file:save'),
        },
        {
          label: 'Save As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => send('file:saveAs'),
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => send('file:close'),
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About PA Tools',
          click: () => send('help:about'),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => void checkForUpdatesManual(opts.getWindow),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
