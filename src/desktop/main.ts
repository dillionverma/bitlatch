import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  powerMonitor,
  session,
  shell,
} from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { localEngine } from './engine';
import { Vault, generatePassword } from './vault';
import { BrowserBridge } from './browser-bridge';
import { desktopRequestSchema, safely, UserError } from '../shared/protocol';
import type { DesktopRequest } from '../shared/protocol';

process.umask(0o077);
app.setName('Latch');
if (process.env.LATCH_DATA_DIR) app.setPath('userData', process.env.LATCH_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();

let window: BrowserWindow;
let vault: Vault;
let bridge: BrowserBridge;
let busy = false;
let copiedValue = '';
let clipboardTimer: NodeJS.Timeout | undefined;
let clipboardQueue: Promise<void> = Promise.resolve();
let isQuitting = false;
let lastUnlockAt = Date.now();
let setupError: string | undefined;
const rendererPath = join(__dirname, '../renderer/index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const extensionPath = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked/dist/extension')
  : join(__dirname, '../extension');
const hostScript = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked/dist/desktop/native-host.cjs')
  : join(__dirname, 'native-host.cjs');

function showWindow() {
  if (!window) return;
  window.show();
  window.focus();
}

app.on('second-instance', showWindow);
app.on('activate', showWindow);

void app
  .whenReady()
  .then(async () => {
    await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
    const engine = await localEngine({
      dataDir: join(app.getPath('userData'), 'bitwarden'),
      appPath: app.getAppPath(),
      packaged: app.isPackaged,
    });
    setupError = engine.setupError;
    vault = new Vault(engine.cli);
    const manifest = JSON.parse(await readFile(join(__dirname, 'extension.json'), 'utf8')) as {
      extensionId: string;
    };
    bridge = new BrowserBridge({
      dataDir: app.getPath('userData'),
      extensionId: manifest.extensionId,
      executable: process.execPath,
      hostScript,
      handle(request) {
        if (request.type === 'open') {
          showWindow();
          return vault.snapshot().status;
        }
        if (request.type === 'status') return vault.snapshot().status;
        if (request.type === 'matches') return vault.matches(request.url);
        return vault.fill(request.id, request.url);
      },
    });
    await bridge.start();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      width: 1080,
      height: 720,
      minWidth: 820,
      minHeight: 550,
      title: 'Latch',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 19 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#faf9f7',
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
        webSecurity: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.once('ready-to-show', () => window.show());
    vault.on('state', (state) => {
      if (state.status !== 'unlocked') void clearCopiedSecret().catch(() => undefined);
      else lastUnlockAt = Date.now();
      if (!window.isDestroyed()) window.webContents.send('latch:state', state);
    });
    ipcMain.handle('latch:request', (event, raw: unknown) =>
      safely(async () => {
        if (
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== rendererUrl
        )
          throw new UserError('Request denied.');
        const parsed = desktopRequestSchema.safeParse(raw);
        if (!parsed.success) throw new UserError('Please check the values you entered.');
        return handleRequest(parsed.data);
      }),
    );
    installMenu();
    globalShortcut.register('CommandOrControl+Shift+Space', showWindow);
    powerMonitor.on('suspend', lockVault);
    powerMonitor.on('lock-screen', lockVault);
    setInterval(() => {
      if (
        vault.snapshot().status === 'unlocked' &&
        Date.now() - lastUnlockAt >= 300_000 &&
        powerMonitor.getSystemIdleTime() >= 300
      )
        lockVault();
    }, 10_000).unref();
    await window.loadFile(rendererPath);
    if (!setupError) await vault.initialize();
  })
  .catch(() => {
    // Deliberately omit raw engine errors: they can contain vault data.
    console.error('Latch could not initialize. Check the installation and restart.');
    app.quit();
  });

async function handleRequest(request: DesktopRequest): Promise<unknown> {
  switch (request.type) {
    case 'state':
      return { ...vault.snapshot(), ...(setupError ? { setupError } : {}) };
    case 'lock':
      return vault.lock();
    case 'items':
      return vault.items();
    case 'detail':
      return vault.detail(request.id);
    case 'generate':
      return generatePassword();
    case 'installBrowser':
      return bridge.install(process.env.LATCH_BROWSER_ROOT);
    case 'openExtensionFolder': {
      const error = await shell.openPath(extensionPath);
      if (error) throw new UserError('The extension folder could not be opened.');
      return;
    }
    case 'copy': {
      clipboardQueue = clipboardQueue
        .catch(() => undefined)
        .then(async () => {
          copiedValue = vault.detail(request.id)[request.field];
          await clipboard.writeText(copiedValue);
          if (clipboardTimer) clearTimeout(clipboardTimer);
          clipboardTimer = setTimeout(
            () => void clearCopiedSecret().catch(() => undefined),
            30_000,
          );
        });
      await clipboardQueue;
      return;
    }
    default:
      return mutateVault(request);
  }
}

async function mutateVault(
  request: Extract<DesktopRequest, { type: 'login' | 'unlock' | 'logout' | 'sync' | 'save' }>,
) {
  if (busy) throw new UserError('Please wait for the current vault operation to finish.');
  busy = true;
  try {
    switch (request.type) {
      case 'login':
        return await vault.login(request.input);
      case 'unlock':
        return await vault.unlock(request.password);
      case 'logout':
        return await vault.logout();
      case 'sync':
        return await vault.sync();
      case 'save':
        return await vault.save(request.draft);
    }
  } finally {
    busy = false;
  }
}

function clearCopiedSecret() {
  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardQueue = clipboardQueue
    .catch(() => undefined)
    .then(async () => {
      const previous = copiedValue;
      copiedValue = '';
      if (previous && (await clipboard.readText()) === previous) await clipboard.clear();
    });
  return clipboardQueue;
}

function lockVault() {
  if (vault && (vault.snapshot().status !== 'signed-out' || busy))
    void vault.lock().catch(() => undefined);
}

function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Latch',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Lock vault', accelerator: 'CmdOrCtrl+L', click: lockVault },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Search vault',
            accelerator: 'CmdOrCtrl+K',
            click: () => {
              showWindow();
              window.webContents.send('latch:focus-search');
            },
          },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  globalShortcut.unregisterAll();
  void Promise.allSettled([vault?.lock(), bridge?.stop(), clearCopiedSecret()]).finally(() =>
    app.quit(),
  );
});
