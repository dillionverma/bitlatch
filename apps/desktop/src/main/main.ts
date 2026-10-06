import {
  app,
  BrowserWindow,
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
import { mkdir } from 'node:fs/promises';
import { prepareWindowAppearance } from './window-appearance';
import { manageWindowLayout } from './window-layout';
import { installNativeInteractions } from './native-interactions';
import { WebsiteIcons } from './website-icons';
import type { WindowCommand } from '@latch/shared/types';
import { localEngine } from './engine';
import { Vault, generatePassword } from './vault';
import { touchIdSessionStore } from './biometrics';
import { AccountHints } from './account-hint';
import { browserSetup, connectBrowser } from './browser-setup';
import { startBridges } from './bridges';
import { DesktopLifecycle } from './lifecycle';
import { MacAutoFill } from './macos-autofill';
import { createUpdates } from './updates';
import { desktopRequestSchema, safely, UserError } from '@latch/shared/protocol';
import type { DesktopRequest } from '@latch/shared/protocol';

process.umask(0o077);
// Keep the existing data directory and OS encryption identity across the rename.
app.setName('Latch');
app.setPath('userData', process.env.LATCH_DATA_DIR ?? join(app.getPath('appData'), 'Latch'));
if (!app.requestSingleInstanceLock()) app.quit();

let window: BrowserWindow;
let appearance: ReturnType<typeof prepareWindowAppearance>;
let nativeInteractions: ReturnType<typeof installNativeInteractions>;
let websiteIcons: WebsiteIcons;
let vault: Vault;
let bridges: Awaited<ReturnType<typeof startBridges>>;
let macAutoFill: MacAutoFill;
let updates: ReturnType<typeof createUpdates> | undefined;
let busy = false;
let setupError: string | undefined;
let hasAccountHint = false;
const lifecycle = new DesktopLifecycle();
/** Resolves once the vault knows whether an account is already signed in. */
let examined: Promise<unknown> = Promise.resolve();
const rendererPath = join(__dirname, '../renderer/index.html');
const rendererUrl =
  !app.isPackaged && process.env.LATCH_RENDERER_URL
    ? new URL(process.env.LATCH_RENDERER_URL).href
    : pathToFileURL(rendererPath).href;
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
// Development restarts must release the warm CLI and secrets through normal shutdown.
if (!app.isPackaged) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit());
}

lifecycle.startup = app
  .whenReady()
  .then(async () => {
    app.setName('Bitlatch');
    // Refresh the running Dock tile when macOS retains artwork from an older build.
    if (process.platform === 'darwin' && app.isPackaged) {
      app.dock?.setIcon(join(process.resourcesPath, 'latch-dock.png'));
    }
    await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
    await lifecycle.loadPreferences(join(app.getPath('userData'), 'preferences.json'));
    websiteIcons = new WebsiteIcons(join(app.getPath('userData'), 'website-icons.json'));
    await websiteIcons.load();
    const engine = await localEngine({
      dataDir: join(app.getPath('userData'), 'bitwarden'),
    });
    setupError = engine.setupError;
    lifecycle.cli = engine.cli;
    const sessions = touchIdSessionStore(app.getPath('userData'));
    const hints = new AccountHints(join(app.getPath('userData'), 'account-hint.json'));
    const [, hint] = await Promise.all([sessions.load(), hints.read()]);
    vault = new Vault(engine.cli, sessions);
    lifecycle.attachVault(vault, () => {
      websiteIcons.clear();
      nativeInteractions?.cancelConfirmation();
    });
    macAutoFill = lifecycle.track(new MacAutoFill(vault));
    vault.on('state', () => macAutoFill.update());
    // AutoFill setup failures must not prevent opening or locking the vault.
    void macAutoFill
      .status()
      .then(() => macAutoFill.update())
      .catch(() => undefined);
    if (hint) {
      vault.showLockedAccount(hint);
      hasAccountHint = true;
    }
    vault.on('state', (state) => hints.remember(state));
    // Account metadata can paint immediately; actions still wait for the CLI.
    examined = setupError
      ? Promise.resolve()
      : vault.initialize().catch(() => {
          setupError = 'Could not check your vault. Restart Bitlatch to try again.';
          if (window && !window.isDestroyed())
            window.webContents.send('latch:state', { ...vault.snapshot(), setupError });
        });
    bridges = lifecycle.track(
      await startBridges({
        dataDir: app.getPath('userData'),
        browserRoot: process.env.LATCH_BROWSER_ROOT,
        hostScript,
        vault,
        websiteIcons,
        macAutoFill,
        showWindow,
        handleRequest,
        epoch: () => lifecycle.epoch,
        assertRunning: () => lifecycle.assertRunning(),
      }),
    );
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    const requestedMaterial = process.env.LATCH_MATERIAL;
    nativeTheme.themeSource = 'system';
    appearance = prepareWindowAppearance({
      // Keep native vibrancy as the default; glass remains an explicit opt-in.
      allowGlass: requestedMaterial === 'glass',
      override:
        requestedMaterial === 'vibrancy' ||
        requestedMaterial === 'unavailable' ||
        requestedMaterial === 'solid'
          ? requestedMaterial
          : requestedMaterial === 'glass'
            ? 'glass'
            : 'vibrancy',
    });
    window = new BrowserWindow({
      ...appearance.windowOptions,
      width: 1080,
      height: 720,
      minWidth: 820,
      minHeight: 550,
      title: 'Bitlatch',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 19 },
      // An inactive-window click must only activate, never reveal or copy a secret.
      acceptFirstMouse: false,
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
    appearance.attach(window);
    nativeInteractions = installNativeInteractions(window);
    const updateWindowLayout = manageWindowLayout(window);
    updateWindowLayout(vault.snapshot());
    const unsubscribeAppearance = appearance.subscribe((snapshot) => {
      if (!window.isDestroyed()) window.webContents.send('latch:appearance', snapshot);
    });
    window.once('closed', unsubscribeAppearance);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('close', (event) => {
      if (!lifecycle.quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.once('ready-to-show', () => window.show());
    let previousBiometrics = vault.snapshot().biometrics;
    const refreshBiometrics = () => {
      if (window.isDestroyed()) return;
      const state = vault.snapshot();
      if (state.biometrics === previousBiometrics) return;
      previousBiometrics = state.biometrics;
      window.webContents.send('latch:state', state);
    };
    window.on('focus', () => {
      void macAutoFill.status().catch(() => undefined);
      refreshBiometrics();
    });
    powerMonitor.on('resume', refreshBiometrics);
    powerMonitor.on('unlock-screen', refreshBiometrics);
    vault.on('state', (state) => {
      nativeInteractions.cancelMenu();
      if (!window.isDestroyed()) {
        window.webContents.send('latch:state', state);
        updateWindowLayout(state);
      }
    });
    ipcMain.handle('latch:request', (event, raw: unknown) =>
      safely(async () => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== rendererUrl
        )
          throw new UserError('Request denied.');
        const parsed = desktopRequestSchema.safeParse(raw);
        if (!parsed.success) throw new UserError('Please check the values you entered.');
        return handleRequest(parsed.data);
      }),
    );
    updates = lifecycle.updates = createUpdates();
    installMenu();
    globalShortcut.register('CommandOrControl+Shift+Space', showWindow);
    await window.loadURL(rendererUrl);
    await examined;
  })
  .catch(() => {
    // Deliberately omit raw engine errors: they can contain vault data.
    console.error('Bitlatch could not initialize. Check the installation and restart.');
    app.quit();
  });

async function handleRequest(request: DesktopRequest): Promise<unknown> {
  lifecycle.assertRunning();
  switch (request.type) {
    case 'lockTimeout':
      return lifecycle.lockTimeoutMinutes;
    case 'setLockTimeout':
      return lifecycle.setLockTimeout(request.minutes);
    case 'macAutoFill':
      return macAutoFill.status();
    case 'enableMacAutoFill':
      return macAutoFill.enable();
    case 'macAutoFillSettings':
      return macAutoFill.settings();
    case 'websiteIcons':
      return websiteIcons.enabled;
    case 'setWebsiteIcons':
      return websiteIcons.setEnabled(request.enabled);
    case 'websiteIcon': {
      if (vault.snapshot().status !== 'unlocked' || !websiteIcons.enabled) return null;
      const item = vault.detail(request.id);
      if (item.type !== 1 || item.restricted) return null;
      const epoch = lifecycle.epoch;
      const icon = await websiteIcons.get(item.website);
      return epoch === lifecycle.epoch && vault.snapshot().status === 'unlocked' ? icon : null;
    }
    case 'itemMenu': {
      if (vault.snapshot().status !== 'unlocked') return null;
      const epoch = lifecycle.epoch;
      const action = await nativeInteractions.itemMenu(vault.detail(request.id), request.position);
      return epoch === lifecycle.epoch && vault.snapshot().status === 'unlocked' ? action : null;
    }
    case 'confirm': {
      if (vault.snapshot().status !== 'unlocked') return false;
      const epoch = lifecycle.epoch;
      const confirmed = await nativeInteractions.confirm(request.action);
      return confirmed && epoch === lifecycle.epoch && vault.snapshot().status === 'unlocked';
    }
    case 'appearance':
      return appearance.snapshot();
    case 'state':
      if (!hasAccountHint) await examined;
      return { ...vault.snapshot(), ...(setupError ? { setupError } : {}) };
    case 'lock':
      return lifecycle.lock();
    case 'challenge':
      // Feeds a sign-in that is already in progress, so it bypasses the busy gate.
      return vault.answerChallenge(request.answer);
    case 'items':
      return vault.items();
    case 'trash':
      return vault.trash();
    case 'detail':
      return vault.detail(request.id);
    case 'generate':
      return generatePassword(request.options);
    case 'browserSetup':
      return browserSetup(macAutoFill);
    case 'connectBrowser':
      return connectBrowser(request.browser, macAutoFill);
    case 'browserConnection':
      return bridges.browserConnection();
    case 'openExtensionFolder': {
      const error = await shell.openPath(extensionPath);
      if (error) throw new UserError('The extension folder could not be opened.');
      return;
    }
    case 'copy':
      return lifecycle.copy(request.id, request.field);
    default:
      return mutateVault(request);
  }
}

async function mutateVault(
  request: Extract<
    DesktopRequest,
    {
      type:
        | 'login'
        | 'unlock'
        | 'logout'
        | 'sync'
        | 'commitCapture'
        | 'save'
        | 'setFavorite'
        | 'delete'
        | 'restore'
        | 'biometricUnlock'
        | 'setBiometrics';
    }
  >,
) {
  if (busy) throw new UserError('Please wait for the current vault operation to finish.');
  busy = true;
  const epoch = lifecycle.epoch;
  try {
    await examined;
    if (epoch !== lifecycle.epoch) throw new UserError('Vault locked. Try again after unlocking.');
    if (setupError) throw new UserError(setupError);
    switch (request.type) {
      case 'login':
        return await vault.login(request.input);
      case 'unlock':
        return await vault.unlock(request.password);
      case 'biometricUnlock':
        return await vault.unlockWithBiometrics();
      case 'setBiometrics':
        return await vault.setBiometrics(request.enabled);
      case 'logout':
        return await vault.logout();
      case 'sync':
        return await vault.sync();
      case 'commitCapture':
        return await vault.commitCapture(request.url);
      case 'save':
        return await vault.save(request.draft);
      case 'setFavorite':
        return await vault.setFavorite(request.id, request.favorite);
      case 'delete':
        return await vault.remove(request.id);
      case 'restore':
        return await vault.restore(request.id);
    }
  } finally {
    busy = false;
  }
}

function sendCommand(command: WindowCommand) {
  showWindow();
  if (!window.isDestroyed()) window.webContents.send('latch:command', command);
}

function installMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Bitlatch',
      submenu: [
        { role: 'about' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('settings') },
        { type: 'separator' },
        {
          label: 'Lock vault',
          accelerator: 'CmdOrCtrl+L',
          click: () => void lifecycle.lock().catch(() => undefined),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Login', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Quick open',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            sendCommand('search');
          },
        },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]);
  if (updates) menu.items[0]?.submenu?.insert(1, updates.menuItem);
  Menu.setApplicationMenu(menu);
}
