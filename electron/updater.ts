import { app, BrowserWindow, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

const RELEASES_URL = 'https://github.com/kevincuster-sn/pa-tools/releases/latest';

function configureUpdater(): void {
  // Don't auto-download; we decide per-platform below.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (err: Error) => {
    console.error('[updater] error:', err.message);
  });
}

/**
 * Called on startup (behind `app.isPackaged` guard in main.ts).
 * Checks for updates silently; presents UI only when something is found.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  configureUpdater();
  void checkForUpdates(getWindow, { silent: true });
}

/**
 * Called from the "Check for Updates…" menu item.
 * Always reports a result to the user (including "you're up to date").
 */
export async function checkForUpdatesManual(getWindow: () => BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) {
    void dialog.showMessageBox({
      type: 'info',
      title: 'Update check unavailable',
      message: 'Auto-update only works in a packaged build.',
    });
    return;
  }

  configureUpdater();
  await checkForUpdates(getWindow, { silent: false });
}

async function checkForUpdates(
  getWindow: () => BrowserWindow | null,
  opts: { silent: boolean },
): Promise<void> {
  const isMac = process.platform === 'darwin';

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    autoUpdater.once('update-available', async (info: { version: string }) => {
      settle();

      const win = getWindow();
      const parent = win ?? undefined;

      if (isMac) {
        // macOS: unsigned builds can't apply updates via Squirrel.
        // Notify and open the download page instead.
        const { response } = await dialog.showMessageBox({
          ...(parent ? { browserWindow: parent } : {}),
          type: 'info',
          title: 'Update available',
          message: `PA Tools ${info.version} is available.`,
          detail:
            'A new version is ready for download. Click "Download" to open the releases page in your browser.',
          buttons: ['Download', 'Later'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) {
          void shell.openExternal(RELEASES_URL);
        }
      } else {
        // Windows: electron-updater can download and install silently.
        autoUpdater.autoDownload = true;
        void autoUpdater.downloadUpdate();

        autoUpdater.once('update-downloaded', async () => {
          const { response } = await dialog.showMessageBox({
            ...(parent ? { browserWindow: parent } : {}),
            type: 'info',
            title: 'Update ready',
            message: `PA Tools ${info.version} has been downloaded.`,
            detail:
              'Restart now to apply the update, or continue and it will install on next launch.',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
          });
          if (response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
      }
    });

    autoUpdater.once('update-not-available', async () => {
      settle();
      if (!opts.silent) {
        const win = getWindow();
        await dialog.showMessageBox({
          ...(win ? { browserWindow: win } : {}),
          type: 'info',
          title: 'No updates',
          message: `PA Tools ${app.getVersion()} is up to date.`,
        });
      }
    });

    // Resolve on error too so the app startup never hangs.
    autoUpdater.once('error', () => settle());

    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[updater] checkForUpdates failed:', err);
      settle();
    });
  });
}
