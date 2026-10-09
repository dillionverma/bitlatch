import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  browserRequestSchema,
  browserSaveResultSchema,
  launcherRequestSchema,
  UserError,
  type BrowserRequest,
  type DesktopRequest,
} from '@latch/shared/protocol';
import { LocalTransport } from './local-transport';
import type { VerifiedPeer } from './local-transport';
import { ExternalAccess } from './external-access';
import { installBrowser } from './browser-registration';
import type { BrowserConnection, BrowserUnlockState } from '@latch/shared/types';
import { iconHostname, type WebsiteIcons } from './website-icons';
import type { Vault } from './vault';
import type { MacAutoFill } from './macos-autofill';

interface BridgeDependencies {
  dataDir: string;
  browserRoot?: string;
  hostScript: string;
  nativeHost?: string;
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
  nativeHost,
  vault,
  websiteIcons,
  macAutoFill,
  showWindow,
  handleRequest,
  epoch,
  assertRunning,
}: BridgeDependencies) {
  const transports: { stop(): Promise<void> }[] = [];
  const externalAccess = new ExternalAccess(macAutoFill, epoch);
  const stop = async () => {
    await Promise.allSettled(transports.map((transport) => transport.stop()));
  };
  let safariBridge: LocalTransport<BrowserRequest> | undefined;
  let lastBrowserContact: number | null = null;
  try {
    const manifest = JSON.parse(await readFile(join(__dirname, 'extension.json'), 'utf8')) as {
      extensionId: string;
    };
    const handleBrowserRequest = async (request: BrowserRequest, peer?: VerifiedPeer) => {
      assertRunning();
      // This handler runs only after the local transport authenticates the request.
      lastBrowserContact = Date.now();
      if (request.type === 'open') {
        showWindow();
        return vault.snapshot().status;
      }
      if (request.type === 'status') return vault.snapshot().status;
      if (request.type === 'unlockState') {
        const { status, biometrics, biometricsOn } = vault.snapshot();
        return {
          state: status,
          canUseBiometrics: biometricsOn && biometrics === 'ready',
        } satisfies BrowserUnlockState;
      }
      if (request.type === 'biometricUnlock') {
        await handleRequest(request);
        externalAccess.grant('browser', peer);
        return vault.snapshot().status;
      }
      if (request.type === 'browse') return vault.browserItems(request.query, request.url);
      if (request.type === 'detail') {
        vault.requireBrowserItem(request.id, true);
        return handleRequest(request);
      }
      if (request.type === 'save') {
        if (request.draft.id) vault.requireBrowserItem(request.draft.id);
        return browserSaveResultSchema.parse(await handleRequest(request));
      }
      if (
        request.type === 'delete' ||
        request.type === 'restore' ||
        request.type === 'setFavorite'
      ) {
        vault.requireBrowserItem(request.id, request.type === 'restore');
        return handleRequest(request);
      }
      if (request.type === 'generate' || request.type === 'sync') return handleRequest(request);
      if (request.type === 'lock') {
        await handleRequest(request);
        return vault.snapshot().status;
      }
      if (request.type === 'copy') {
        vault.requireBrowserItem(request.id, true);
        await handleRequest(request);
        return null;
      }
      if (request.type === 'matches') return vault.matches(request.url);
      if (request.type === 'websiteIcon') {
        vault.requireBrowserItem(request.id, true);
        return handleRequest(request);
      }
      if (request.type === 'capture')
        return vault.capture(request.url, request.username, request.password);
      if (request.type === 'pendingCapture') return vault.pendingCapture(request.url);
      if (request.type === 'commitCapture') return handleRequest(request);
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
      if (request.type === 'fill') return vault.fill(request.id, request.url);
      const unhandled: never = request;
      throw new UserError(`Unsupported browser request: ${String(unhandled)}`);
    };
    const responseGuard = (request: BrowserRequest) => {
      const startedAt = epoch();
      return () => {
        if (
          !['open', 'status', 'unlockState', 'lock'].includes(request.type) &&
          startedAt !== epoch()
        )
          throw new UserError('Vault locked. Try again after unlocking.');
      };
    };
    const browserRequestTimeout = (request: BrowserRequest) =>
      ['open', 'status', 'unlockState', 'lock'].includes(request.type) ? 10_000 : 120_000;
    const bridge = new LocalTransport({
      schema: browserRequestSchema,
      dataDir,
      handle: handleBrowserRequest,
      authorize: async (request, peer) => {
        if (
          !['open', 'status', 'unlockState', 'lock', 'biometricUnlock'].includes(request.type) &&
          vault.snapshot().status === 'unlocked'
        )
          await externalAccess.require('browser', peer);
      },
      responseGuard,
      requestTimeout: browserRequestTimeout,
    });
    transports.push(bridge);
    await bridge.start().catch(() => {
      console.warn('Bitlatch browser connection unavailable. Check the app signature.');
    });
    const launcherBridge = new LocalTransport({
      channel: 'raycast',
      hostPath: nativeHost,
      schema: launcherRequestSchema,
      dataDir,
      requestTimeout: (request) =>
        request.type === 'biometricUnlock' ||
        request.type === 'copy' ||
        request.type === 'detail' ||
        request.type === 'search'
          ? 120_000
          : 10_000,
      responseGuard: (request) => {
        const startedAt = epoch();
        return () => {
          if (!['open', 'lock', 'biometricUnlock'].includes(request.type) && startedAt !== epoch())
            throw new UserError('Vault locked. Try again after unlocking.');
        };
      },
      authorize: async (request, peer) => {
        if (vault.snapshot().status !== 'unlocked') return;
        if (request.type === 'search') await externalAccess.require('raycast', peer);
        if (request.type === 'detail' || request.type === 'copy')
          await externalAccess.requireFresh(
            request.type === 'copy'
              ? 'Copy a Bitlatch credential in Raycast'
              : 'View a Bitlatch item in Raycast',
            peer,
          );
      },
      async handle(request, peer) {
        assertRunning();
        if (request.type === 'open') {
          showWindow();
          return null;
        }
        if (request.type === 'biometricUnlock') {
          await handleRequest(request);
          externalAccess.grant('raycast', peer);
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
    await launcherBridge.start().catch(() => {
      console.warn('Bitlatch Raycast connection unavailable. Check the app signature.');
    });
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
          responseGuard,
          requestTimeout: browserRequestTimeout,
        });
        transports.push(safariBridge);
        await safariBridge.start();
      } catch {
        await safariBridge?.stop().catch(() => undefined);
        if (safariBridge) transports.splice(transports.indexOf(safariBridge), 1);
        // Optional browser setup must not prevent access to the desktop vault.
        console.warn('Bitlatch Safari connection unavailable. Check signing and App Group setup.');
      }
    }
    // Registration is setup, not proof that an extension is connected. A failure
    // here must never prevent opening the vault or using Raycast.
    const registered = await installBrowser(
      {
        dataDir,
        extensionId: manifest.extensionId,
        executable: process.execPath,
        hostScript,
        nativeHost,
      },
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
