import { app, dialog, MenuItem } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function createUpdates() {
  const enabled =
    app.isPackaged &&
    process.platform === 'darwin' &&
    !process.env.LATCH_DATA_DIR &&
    existsSync(join(process.resourcesPath, 'app-update.yml'));
  let checking = false;
  let downloaded = false;
  let installing = false;
  let stopping = false;
  let restart = false;
  let initial: NodeJS.Timeout | undefined;
  let interval: NodeJS.Timeout | undefined;
  const menuItem = new MenuItem({
    label: 'Check for Updates…',
    enabled,
    click: () => {
      if (downloaded) {
        restart = true;
        app.quit();
      } else void check(true);
    },
  });

  const refresh = () => {
    menuItem.label = downloaded
      ? 'Restart to Update…'
      : checking
        ? 'Checking for Updates…'
        : 'Check for Updates…';
    menuItem.enabled = enabled && !checking;
  };
  async function check(manual = false) {
    if (checking || downloaded || stopping) return;
    checking = true;
    refresh();
    try {
      const result = await autoUpdater.checkForUpdates();
      await result?.downloadPromise;
      if (manual && !stopping)
        await dialog.showMessageBox({
          type: 'info',
          message: downloaded ? 'An update is ready.' : 'Latch is up to date.',
          detail: downloaded ? 'It will be installed when you quit Latch.' : undefined,
        });
    } catch {
      if (manual && !stopping)
        await dialog.showMessageBox({
          type: 'info',
          message: 'Could not update Latch.',
          detail: 'Please try again later.',
        });
    } finally {
      checking = false;
      refresh();
    }
  }

  if (enabled) {
    autoUpdater.logger = null;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    // The main process must finish vault/clipboard/CLI cleanup before Squirrel
    // closes windows or replaces the application.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('error', () => {
      if (installing) app.quit();
    });
    autoUpdater.on('update-available', () => {
      menuItem.label = 'Downloading Update…';
    });
    autoUpdater.on('update-downloaded', () => {
      downloaded = true;
      refresh();
    });
    initial = setTimeout(() => void check(), 30_000);
    interval = setInterval(() => void check(), 6 * 60 * 60 * 1_000);
    initial.unref();
    interval.unref();
  }

  return {
    menuItem,
    stop() {
      stopping = true;
      clearTimeout(initial);
      clearInterval(interval);
    },
    quit() {
      if (!downloaded) return app.quit();
      installing = true;
      autoUpdater.autoRunAppAfterInstall = restart;
      try {
        autoUpdater.quitAndInstall();
      } catch {
        app.quit();
      }
    },
  };
}
