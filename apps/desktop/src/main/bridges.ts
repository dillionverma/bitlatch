import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  browserRequestSchema,
  launcherRequestSchema,
  UserError,
  type BrowserRequest,
  type DesktopRequest,
} from '@latch/shared/protocol';
import { LocalTransport } from './local-transport';
import { installBrowser } from './browser-registration';
import type { BrowserConnection } from '@latch/shared/types';
import { iconHostname, type WebsiteIcons } from './website-icons';
import type { Vault } from './vault';
import type { MacAutoFill } from './macos-autofill';

interface BridgeDependencies {
  dataDir: string;
  browserRoot?: string;
  hostScript: string;
  vault: Vault;
  websiteIcons: WebsiteIcons;
  macAutoFill: MacAutoFill;
  showWindow: () => void;
  handleRequest: (request: DesktopRequest) => Promise<unknown>;
  epoch: () => number;
  assertRunning: () => void;
}

export async function startBridges({
  dataDir,
  browserRoot,
  hostScript,
  vault,
  websiteIcons,
  macAutoFill,
  showWindow,
  handleRequest,
  epoch,
  assertRunning,
}: BridgeDependencies) {
  const transports: { stop(): Promise<void> }[] = [];
  const stop = async () => {
    await Promise.allSettled(transports.map((transport) => transport.stop()));
  };
  let safariBridge: LocalTransport<BrowserRequest> | undefined;
  let lastBrowserContact: number | null = null;
  try {
    const manifest = JSON.parse(await readFile(join(__dirname, 'extension.json'), 'utf8')) as {
      extensionId: string;
    };
    const handleBrowserRequest = async (request: BrowserRequest) => {
      assertRunning();
      // This handler runs only after the local transport authenticates the request.
      lastBrowserContact = Date.now();
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
        const startedAt = epoch();
        const icon = await websiteIcons.get(item.website);
        return startedAt === epoch() && vault.snapshot().status === 'unlocked' ? icon : null;
      }
      return vault.fill(request.id, request.url);
    };
    const bridge = new LocalTransport({
      schema: browserRequestSchema,
      dataDir,
      handle: handleBrowserRequest,
    });
    transports.push(bridge);
    await bridge.start();
    const launcherBridge = new LocalTransport({
      channel: 'raycast',
      schema: launcherRequestSchema,
      dataDir,
      requestTimeout: (request) =>
        request.type === 'unlock' || request.type === 'biometricUnlock' ? 120_000 : 10_000,
      async handle(request) {
        assertRunning();
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
    transports.push(launcherBridge);
    await launcherBridge.start();
    if (existsSync(join(process.resourcesPath, '../PlugIns/LatchSafari.appex'))) {
      try {
        const container = await macAutoFill.sharedContainer();
        if (!container) throw new Error('Safari shared container unavailable');
        safariBridge = new LocalTransport({
          channel: 'safari',
          schema: browserRequestSchema,
          dataDir: container,
          socketDirectory: container,
          handle: handleBrowserRequest,
        });
        transports.push(safariBridge);
        await safariBridge.start();
      } catch {
        await safariBridge?.stop().catch(() => undefined);
        if (safariBridge) transports.splice(transports.indexOf(safariBridge), 1);
        // Optional browser setup must not prevent access to the desktop vault.
        console.warn('Latch Safari connection unavailable. Check signing and App Group setup.');
      }
    }
    // Registration is setup, not proof that an extension is connected. A failure
    // here must never prevent opening the vault or using Raycast.
    const registered = await installBrowser(
      { dataDir, extensionId: manifest.extensionId, executable: process.execPath, hostScript },
      browserRoot,
    ).then(
      () => true,
      () => false,
    );
    return {
      stop,
      browserConnection: (): BrowserConnection =>
        lastBrowserContact !== null && Date.now() - lastBrowserContact < 15_000
          ? 'connected'
          : registered
            ? 'not-detected'
            : 'setup-error',
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
