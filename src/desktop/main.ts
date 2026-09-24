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
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { prepareWindowAppearance } from './window-appearance';
import { manageWindowLayout } from './window-layout';
import { installNativeInteractions } from './native-interactions';
import { iconHostname, WebsiteIcons } from './website-icons';
import type { WindowCommand } from '../shared/types';
import { localEngine } from './engine';
import { Vault, generatePassword } from './vault';
import { touchIdSessionStore } from './biometrics';
import { AccountHints } from './account-hint';
import { BrowserBridge } from './browser-bridge';
import { MacAutoFill } from './macos-autofill';
import { createUpdates } from './updates';
import {
  browserRequestSchema,
  launcherRequestSchema,
  desktopRequestSchema,
  safely,
  UserError,
} from '../shared/protocol';
import type { CliPort } from './cli';
import type { DesktopRequest, BrowserRequest, LauncherRequest } from '../shared/protocol';

process.umask(0o077);
app.setName('Latch');
if (process.env.LATCH_DATA_DIR) app.setPath('userData', process.env.LATCH_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();

let window: BrowserWindow;
let appearance: ReturnType<typeof prepareWindowAppearance>;
let nativeInteractions: ReturnType<typeof installNativeInteractions>;
let websiteIcons: WebsiteIcons;
let vault: Vault;
let cli: CliPort | undefined;
let bridge: BrowserBridge<BrowserRequest>;
let safariBridge: BrowserBridge<BrowserRequest> | undefined;
let launcherBridge: BrowserBridge<LauncherRequest>;
let macAutoFill: MacAutoFill;
let updates: ReturnType<typeof createUpdates> | undefined;
let busy = false;
let copiedValue = '';
let clipboardTimer: NodeJS.Timeout | undefined;
let clipboardQueue: Promise<void> = Promise.resolve();
let isQuitting = false;
let lastUnlockAt = Date.now();
let setupError: string | undefined;
let hasAccountHint = false;
let mutationEpoch = 0;
/** Resolves once the vault knows whether an account is already signed in. */
let examined: Promise<unknown> = Promise.resolve();
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
    // Refresh the running Dock tile when macOS retains artwork from an older build.
    if (process.platform === 'darwin' && app.isPackaged) {
      app.dock?.setIcon(join(process.resourcesPath, 'latch-dock.png'));
    }
    await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
    websiteIcons = new WebsiteIcons(join(app.getPath('userData'), 'website-icons.json'));
    await websiteIcons.load();
    const engine = await localEngine({
      dataDir: join(app.getPath('userData'), 'bitwarden'),
    });
    setupError = engine.setupError;
    cli = engine.cli;
    const sessions = touchIdSessionStore(app.getPath('userData'));
    const hints = new AccountHints(join(app.getPath('userData'), 'account-hint.json'));
    const [, hint] = await Promise.all([sessions.load(), hints.read()]);
    vault = new Vault(engine.cli, sessions);
    macAutoFill = new MacAutoFill(vault);
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
          setupError = 'Could not check your vault. Restart Latch to try again.';
          if (window && !window.isDestroyed())
            window.webContents.send('latch:state', { ...vault.snapshot(), setupError });
        });
    const manifest = JSON.parse(await readFile(join(__dirname, 'extension.json'), 'utf8')) as {
      extensionId: string;
    };
    const handleBrowserRequest = async (request: BrowserRequest) => {
      if (request.type === 'open') {
        showWindow();
        return vault.snapshot().status;
      }
      if (request.type === 'status') return vault.snapshot().status;
      if (request.type === 'matches') return vault.matches(request.url);
      if (request.type === 'capture')
        return vault.capture(request.url, request.username, request.password);
      if (request.type === 'pendingCapture') return vault.pendingCapture(request.url);
      if (request.type === 'commitCapture') return vault.commitCapture(request.url);
      if (request.type === 'dismissCapture') return vault.dismissCapture();
      if (request.type === 'icon') {
        // Only an item the page may already see gets an icon; no secret is read.
        if (!websiteIcons.enabled) return null;
        const item = vault.matches(request.url).items.find((entry) => entry.id === request.id);
        if (!item?.website) return null;
        const epoch = mutationEpoch;
        const icon = await websiteIcons.get(item.website);
        return epoch === mutationEpoch && vault.snapshot().status === 'unlocked' ? icon : null;
      }
      return vault.fill(request.id, request.url);
    };
    bridge = new BrowserBridge({
      schema: browserRequestSchema,
      dataDir: app.getPath('userData'),
      extensionId: manifest.extensionId,
      executable: process.execPath,
      hostScript,
      handle: handleBrowserRequest,
    });
    await bridge.start();
    launcherBridge = new BrowserBridge({
      channel: 'raycast',
      schema: launcherRequestSchema,
      dataDir: app.getPath('userData'),
      extensionId: '',
      executable: '',
      hostScript: '',
      async handle(request) {
        if (request.type === 'open') {
          showWindow();
          return null;
        }
        if (request.type === 'unlock' || request.type === 'biometricUnlock') {
          await handleRequest(request);
          return null;
        }
        if (request.type === 'detail') {
          const item = vault.detail(request.id);
          if (item.type !== 1 && item.type !== 2)
            throw new UserError('This item type is not supported yet.');
          const { id, name, username, website, type, notes } = item;
          return { id, name, username, website, type, notes, hasPassword: Boolean(item.password) };
        }
        if (request.type !== 'search') return handleRequest(request);
        const { status, email, biometrics, biometricsOn } = vault.snapshot();
        const state = { status, email, canUseBiometrics: biometricsOn && biometrics === 'ready' };
        if (status !== 'unlocked') return { ...state, items: [] };
        const terms = request.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        const items = vault
          .items()
          .filter((item) => (item.type === 1 || item.type === 2) && !item.restricted)
          .filter((item) =>
            terms.every((term) =>
              `${item.name} ${item.username} ${item.website}`.toLocaleLowerCase().includes(term),
            ),
          )
          .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
          .slice(0, 80)
          .map(({ id, name, username, website, type }) => {
            const host = websiteIcons.enabled ? iconHostname(website) : null;
            return {
              id,
              name,
              username,
              website,
              type,
              ...(host
                ? { iconUrl: `https://icons.bitwarden.net/${encodeURIComponent(host)}/icon.png` }
                : {}),
            };
          });
        return { ...state, items };
      },
    });
    await launcherBridge.start();
    if (existsSync(join(process.resourcesPath, '../PlugIns/LatchSafari.appex'))) {
      try {
        const container = await macAutoFill.sharedContainer();
        if (!container) throw new Error('Safari shared container unavailable');
        safariBridge = new BrowserBridge({
          channel: 'safari',
          schema: browserRequestSchema,
          dataDir: container,
          socketDirectory: container,
          extensionId: '',
          executable: '',
          hostScript: '',
          handle: handleBrowserRequest,
        });
        await safariBridge.start();
      } catch {
        await safariBridge?.stop().catch(() => undefined);
        safariBridge = undefined;
        // Optional browser setup must not prevent access to the desktop vault.
        console.warn('Latch Safari connection unavailable. Check signing and App Group setup.');
      }
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    const requestedMaterial = process.env.LATCH_MATERIAL;
    nativeTheme.themeSource = 'system';
    appearance = prepareWindowAppearance({
      // Built-in vibrancy needs no addon; retain the existing explicit glass opt-in.
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
      title: 'Latch',
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
      if (!isQuitting) {
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
      if (state.status !== 'unlocked') {
        websiteIcons.clear();
        nativeInteractions.cancelConfirmation();
        void clearCopiedSecret().catch(() => undefined);
      } else lastUnlockAt = Date.now();
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
    updates = createUpdates();
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
    await examined;
  })
  .catch(() => {
    // Deliberately omit raw engine errors: they can contain vault data.
    console.error('Latch could not initialize. Check the installation and restart.');
    app.quit();
  });

async function handleRequest(request: DesktopRequest): Promise<unknown> {
  switch (request.type) {
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
      const epoch = mutationEpoch;
      const icon = await websiteIcons.get(item.website);
      return epoch === mutationEpoch && vault.snapshot().status === 'unlocked' ? icon : null;
    }
    case 'itemMenu': {
      if (vault.snapshot().status !== 'unlocked') return null;
      const epoch = mutationEpoch;
      const action = await nativeInteractions.itemMenu(vault.detail(request.id), request.position);
      return epoch === mutationEpoch && vault.snapshot().status === 'unlocked' ? action : null;
    }
    case 'confirm': {
      if (vault.snapshot().status !== 'unlocked') return false;
      const epoch = mutationEpoch;
      const confirmed = await nativeInteractions.confirm(request.action);
      return confirmed && epoch === mutationEpoch && vault.snapshot().status === 'unlocked';
    }
    case 'appearance':
      return appearance.snapshot();
    case 'state':
      if (!hasAccountHint) await examined;
      return { ...vault.snapshot(), ...(setupError ? { setupError } : {}) };
    case 'lock':
      ++mutationEpoch;
      return vault.lock();
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
  request: Extract<
    DesktopRequest,
    {
      type:
        | 'login'
        | 'unlock'
        | 'logout'
        | 'sync'
        | 'save'
        | 'delete'
        | 'restore'
        | 'biometricUnlock'
        | 'setBiometrics';
    }
  >,
) {
  if (busy) throw new UserError('Please wait for the current vault operation to finish.');
  busy = true;
  const epoch = mutationEpoch;
  try {
    await examined;
    if (epoch !== mutationEpoch) throw new UserError('Vault locked. Try again after unlocking.');
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
      case 'save':
        return await vault.save(request.draft);
      case 'delete':
        return await vault.remove(request.id);
      case 'restore':
        return await vault.restore(request.id);
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
      if (previous && (await clipboard.readText()) === previous) clipboard.clear();
    });
  return clipboardQueue;
}

function lockVault() {
  ++mutationEpoch;
  if (vault && (vault.snapshot().status !== 'signed-out' || busy))
    void vault.lock().catch(() => undefined);
}

function sendCommand(command: WindowCommand) {
  showWindow();
  if (!window.isDestroyed()) window.webContents.send('latch:command', command);
}

function installMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Latch',
      submenu: [
        { role: 'about' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('settings') },
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

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  globalShortcut.unregisterAll();
  ++mutationEpoch;
  void Promise.allSettled([
    vault?.lock(false),
    bridge?.stop(),
    launcherBridge?.stop(),
    safariBridge?.stop(),
    macAutoFill?.stop(),
    clearCopiedSecret(),
  ])
    // The vault server holds an unlocked vault, so it goes last and always.
    .then(() => cli?.stop?.())
    .finally(() => (updates ? updates.quit() : app.quit()));
});
