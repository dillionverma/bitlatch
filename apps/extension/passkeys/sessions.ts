import { browser, type Browser } from 'wxt/browser';
import {
  passkeyPageRequestSchema,
  type BrowserRequest,
  type PasskeyPageRequest,
} from '@latch/shared/protocol';
import type {
  BrowserUnlockState,
  PasskeyAssertion,
  PasskeyMatch,
  PasskeyRegistration,
  Result,
  UserVerification,
} from '@latch/shared/types';
import type {
  PasskeyErrorName,
  PasskeyPageReply,
  PasskeyView,
  PasskeyWindowReply,
  PasskeyWindowRequest,
} from './messages';

type Native = <T>(request: BrowserRequest) => Promise<Result<T>>;

/** One page request, from the moment the page asks until it gets exactly one reply. */
interface Session {
  tabId: number;
  /** The page address Chrome reported for the requesting frame. */
  url: string;
  origin: string;
  rpId: string;
  userVerification: UserVerification;
  request: PasskeyPageRequest;
  windowId?: number;
  port?: Browser.runtime.Port;
  settle(reply: PasskeyPageReply): void;
}

const WINDOW_PATH = '/passkey.html';
const fallback: PasskeyPageReply = { fallback: true };
const failure = (name: PasskeyErrorName, message: string): PasskeyPageReply => ({
  error: { name, message },
});

/**
 * Answers WebAuthn requests from top-level pages with a Bitlatch window. A page
 * falls back to the browser's own passkeys when Bitlatch is not running, has no
 * passkey for the site, or the user chooses another device.
 */
export function passkeySessions(native: Native) {
  const sessions = new Map<string, Session>();
  /** Requests the page gave up on before their session started. */
  const abandoned = new Set<string>();

  function close(id: string, reply: PasskeyPageReply) {
    sessions.get(id)?.settle(reply);
  }

  async function request(
    id: string,
    message: unknown,
    sender: Browser.runtime.MessageSender,
    url: string | null,
  ): Promise<PasskeyPageReply> {
    const tabId = sender.tab?.id;
    const parsed = passkeyPageRequestSchema.safeParse(message);
    if (!url || sender.frameId !== 0 || tabId === undefined || !parsed.success) return fallback;
    if (sessions.has(id)) return failure('NotAllowedError', 'This request is already open.');
    const page = new URL(url);
    const pageRequest = parsed.data;
    const rpId =
      (pageRequest.kind === 'get' ? pageRequest.rpId : pageRequest.rp.id) ?? page.hostname;
    const state = await native<BrowserUnlockState>({ type: 'unlockState' });
    if (!state.ok || state.value.state === 'signed-out') return fallback;
    if (state.value.state === 'unlocked') {
      const allowed = pageRequest.kind === 'get' ? pageRequest.allowCredentials : [];
      const passkeys = await native<PasskeyMatch[]>({ type: 'passkeys', url, rpId, allowed });
      // The browser rejects a relying party that does not belong to the page itself.
      if (!passkeys.ok || (pageRequest.kind === 'get' && !passkeys.value.length)) return fallback;
    }
    if (abandoned.delete(id)) return failure('AbortError', 'The page canceled the request.');
    for (const [other, session] of sessions)
      if (session.tabId === tabId)
        close(other, failure('NotAllowedError', 'A newer request replaced this one.'));
    const timeout = Math.min(Math.max(pageRequest.timeout ?? 300_000, 30_000), 300_000);
    return new Promise<PasskeyPageReply>((resolve) => {
      const timer = setTimeout(
        () => close(id, failure('NotAllowedError', 'The passkey request timed out.')),
        timeout,
      );
      const session: Session = {
        tabId,
        url,
        origin: page.origin,
        rpId,
        userVerification: pageRequest.userVerification ?? 'preferred',
        request: pageRequest,
        settle(reply) {
          if (sessions.get(id) !== session) return;
          sessions.delete(id);
          clearTimeout(timer);
          if (session.windowId !== undefined)
            void browser.windows.remove(session.windowId).catch(() => {});
          resolve(reply);
        },
      };
      sessions.set(id, session);
      void openWindow(id, session, sender.tab?.windowId).catch(() =>
        close(id, failure('NotAllowedError', 'Bitlatch could not open its passkey window.')),
      );
    });
  }

  async function openWindow(id: string, session: Session, parentId: number | undefined) {
    const width = 380;
    const height = 420;
    const parent = parentId === undefined ? undefined : await browser.windows.get(parentId);
    const created = await browser.windows.create({
      url: browser.runtime.getURL(`${WINDOW_PATH}?session=${encodeURIComponent(id)}`),
      type: 'popup',
      width,
      height,
      focused: true,
      ...(parent?.left !== undefined && parent.width !== undefined
        ? {
            left: Math.round(parent.left + (parent.width - width) / 2),
            top: Math.round((parent.top ?? 0) + 80),
          }
        : {}),
    });
    if (sessions.get(id) !== session) {
      if (created?.id !== undefined) await browser.windows.remove(created.id);
      return;
    }
    session.windowId = created?.id;
  }

  async function view(session: Session): Promise<PasskeyView> {
    const state = await native<BrowserUnlockState>({ type: 'unlockState' });
    const vault = state.ok ? state.value.state : 'unavailable';
    const request = session.request;
    let passkeys: PasskeyMatch[] = [];
    if (vault === 'unlocked' && request.kind === 'get') {
      const result = await native<PasskeyMatch[]>({
        type: 'passkeys',
        url: session.url,
        rpId: session.rpId,
        allowed: request.allowCredentials,
      });
      if (!result.ok) throw new Error(result.error);
      passkeys = result.value;
    }
    return {
      kind: request.kind,
      rpId: session.rpId,
      rpName: request.kind === 'create' ? request.rp.name : '',
      userName: request.kind === 'create' ? request.user.name || request.user.displayName : '',
      state: vault,
      canUseBiometrics: state.ok && state.value.canUseBiometrics,
      passkeys,
      userVerification: session.userVerification,
    };
  }

  /** The tab must still show the page that asked, or nothing is signed for it. */
  async function samePage(session: Session) {
    const tab = await browser.tabs.get(session.tabId).catch(() => undefined);
    return !!tab?.url && URL.parse(tab.url)?.origin === session.origin;
  }

  async function act(id: string, session: Session, message: PasskeyWindowRequest) {
    const reply = (value: PasskeyWindowReply) => session.port?.postMessage(value);
    const show = async () => reply({ type: 'view', view: await view(session) });
    if (message.type === 'load') return show();
    if (message.type === 'fallback') return close(id, fallback);
    if (message.type === 'cancel')
      return close(id, failure('NotAllowedError', 'The passkey request was canceled.'));
    if (message.type === 'openApp') {
      await native({ type: 'open' });
      return;
    }
    if (message.type === 'unlock') {
      const result = await native({ type: 'biometricUnlock' });
      if (!result.ok) throw new Error(result.error);
      return show();
    }
    if (!(await samePage(session)))
      return close(id, failure('NotAllowedError', 'The page changed.'));
    const request = session.request;
    const common = {
      url: session.url,
      rpId: session.rpId,
      challenge: request.challenge,
      userVerification: session.userVerification,
    };
    if (message.type === 'choose' && request.kind === 'get') {
      const result = await native<PasskeyAssertion>({
        type: 'assertPasskey',
        ...common,
        id: message.id,
        credentialId: message.credentialId,
      });
      if (!result.ok) throw new Error(result.error);
      return close(id, { credential: { kind: 'get', ...result.value } });
    }
    if (message.type === 'save' && request.kind === 'create') {
      const result = await native<PasskeyRegistration>({
        type: 'registerPasskey',
        ...common,
        rpName: request.rp.name,
        userName: request.user.name,
        userDisplayName: request.user.displayName,
        userHandle: request.user.id,
        algorithms: request.algorithms,
        excluded: request.excludeCredentials,
      });
      if (!result.ok) throw new Error(result.error);
      return close(id, { credential: { kind: 'create', ...result.value } });
    }
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'passkey' || port.sender?.id !== browser.runtime.id) return;
    const page = URL.parse(port.sender?.url ?? '');
    const id =
      page && page.origin + page.pathname === browser.runtime.getURL(WINDOW_PATH)
        ? page.searchParams.get('session')
        : null;
    const session = id === null ? undefined : sessions.get(id);
    if (!id || !session || session.port) {
      port.disconnect();
      return;
    }
    session.port = port;
    let busy = false;
    port.onMessage.addListener((message: PasskeyWindowRequest) => {
      if (sessions.get(id) !== session) return;
      // Leaving stays possible while a vault request is still running.
      if (message.type === 'fallback' || message.type === 'cancel') {
        void act(id, session, message);
        return;
      }
      if (busy) return;
      busy = true;
      void act(id, session, message)
        .catch((error: unknown) =>
          session.port?.postMessage({
            type: 'error',
            message:
              error instanceof Error && error.message
                ? error.message
                : 'Something went wrong. Try again.',
          } satisfies PasskeyWindowReply),
        )
        .finally(() => {
          busy = false;
        });
    });
    port.onDisconnect.addListener(() =>
      close(id, failure('NotAllowedError', 'The passkey window was closed.')),
    );
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    for (const [id, session] of sessions)
      if (session.tabId === tabId) close(id, failure('AbortError', 'The tab was closed.'));
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.url) return;
    for (const [id, session] of sessions)
      if (session.tabId === tabId && URL.parse(change.url)?.origin !== session.origin)
        close(id, failure('AbortError', 'The page changed.'));
  });

  return {
    request,
    cancel(id: string, sender: Browser.runtime.MessageSender) {
      const session = sessions.get(id);
      if (!session) {
        if (abandoned.size > 100) abandoned.clear();
        abandoned.add(id);
      } else if (session.tabId === sender.tab?.id)
        close(id, failure('AbortError', 'The page canceled the request.'));
    },
  };
}
