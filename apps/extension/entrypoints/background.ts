import { defineBackground } from 'wxt/utils/define-background';
import { browser, type Browser } from 'wxt/browser';
import type {
  BrowserMatches,
  CaptureOffer,
  FillCredential,
  Result,
  VaultStatus,
} from '@latch/shared/types';

export default defineBackground(() => {
  const HOST = 'app.latch.vault';
  let port: Browser.runtime.Port | undefined;
  let pending: {
    resolve: (value: Result<unknown>) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  function native<T>(request: object): Promise<Result<T>> {
    if (import.meta.env.BROWSER === 'safari') {
      return new Promise((resolve) => {
        const timer = setTimeout(
          () => resolve({ ok: false, error: 'Latch is not responding.' }),
          10000,
        );
        browser.runtime.sendNativeMessage(HOST, request).then(
          (value) => {
            clearTimeout(timer);
            resolve(value as Result<T>);
          },
          () => {
            clearTimeout(timer);
            resolve({ ok: false, error: 'Open Latch and enable its Safari extension.' });
          },
        );
      });
    }
    return new Promise((resolve) => {
      if (!port) {
        port = browser.runtime.connectNative(HOST);
        port.onMessage.addListener((message: Result<unknown>) => {
          const next = pending.shift();
          if (next) {
            clearTimeout(next.timer);
            next.resolve(message);
          }
        });
        port.onDisconnect.addListener(() => {
          void browser.runtime.lastError;
          port = undefined;
          for (const entry of pending) {
            clearTimeout(entry.timer);
            entry.resolve({
              ok: false,
              error: 'Open Latch on your computer to connect your vault.',
            });
          }
          pending = [];
        });
      }
      const timer = setTimeout(() => {
        port?.disconnect();
        port = undefined;
        rejectPending();
      }, 10_000);
      pending.push({ resolve: resolve as (result: Result<unknown>) => void, timer });
      try {
        port.postMessage(request);
      } catch {
        rejectPending();
        port = undefined;
      }
    });
  }

  function rejectPending() {
    for (const entry of pending) {
      clearTimeout(entry.timer);
      entry.resolve({
        ok: false,
        error: 'Latch is not responding. Open the desktop app and try again.',
      });
    }
    pending = [];
  }

  function senderUrl(sender: Browser.runtime.MessageSender): string | null {
    if (sender.id !== browser.runtime.id || !sender.tab || !sender.url || !sender.tab.url)
      return null;
    try {
      const frame = new URL(sender.url);
      const top = new URL(sender.tab.url);
      if (frame.origin !== top.origin || !['https:', 'http:'].includes(frame.protocol)) return null;
      return frame.href;
    } catch {
      return null;
    }
  }

  // One global badge follows the active tab. Read URLs from Chrome, never the page.
  let badgeVersion = 0;
  let badgeLabel = '';
  async function refreshBadge(clear = false) {
    const version = ++badgeVersion;
    try {
      if (clear) await browser.action.setBadgeText({ text: '' });
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const url = tab?.url;
      // Keep connection detection alive on new tabs and browser settings pages,
      // without requesting any vault items for those pages.
      if (!url || !/^https?:\/\//.test(url)) await native<VaultStatus>({ type: 'status' });
      const result =
        url && /^https?:\/\//.test(url)
          ? await native<BrowserMatches>({ type: 'matches', url })
          : null;
      if (version !== badgeVersion) return;
      const unlocked = result?.ok && result.value.state === 'unlocked';
      const count = unlocked ? result.value.items.length : 0;
      // The picker returns at most 12 suggestions.
      const text = count ? (count >= 12 ? '12+' : String(count)) : '';
      const title =
        !url || !/^https?:\/\//.test(url)
          ? 'Latch'
          : !result?.ok
            ? 'Latch — open the desktop app'
            : !unlocked
              ? 'Latch — vault locked'
              : `Latch — ${text || 'No'} matching ${count === 1 ? 'login' : 'logins'}`;
      if (!clear && badgeLabel === title) return;
      badgeLabel = title;
      await browser.action.setBadgeBackgroundColor({ color: '#334155' });
      if (typeof browser.action.setBadgeTextColor === 'function')
        await browser.action.setBadgeTextColor({ color: '#FFFFFF' });
      await browser.action.setBadgeText({ text });
      await browser.action.setTitle({ title });
    } catch {
      if (version === badgeVersion) {
        badgeLabel = '';
        await browser.action.setBadgeText({ text: '' }).catch(() => undefined);
      }
    }
  }
  browser.tabs.onActivated.addListener(() => void refreshBadge(true));
  browser.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.active && (change.url || change.status === 'complete')) void refreshBadge(true);
  });
  browser.windows.onFocusChanged.addListener(() => void refreshBadge(true));
  // Also retry after Latch starts or restarts; a missing port is not permanent.
  setInterval(() => {
    void refreshBadge();
  }, 5000);
  void refreshBadge(true);

  browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    const type = message.type;
    void (async () => {
      const isPopup =
        sender.id === browser.runtime.id && sender.url === browser.runtime.getURL('/popup.html');
      if (type === 'open' && (isPopup || senderUrl(sender)))
        return native<VaultStatus>({ type: 'open' });
      // Status contains only the lock state. Content callers still require the
      // same trusted same-origin sender metadata as matches and fills.
      if (type === 'status' && (isPopup || senderUrl(sender)))
        return native<VaultStatus>({ type: 'status' });
      const url = senderUrl(sender);
      if (!url) return { ok: false, error: 'Autofill is unavailable in this frame.' };
      if (type === 'matches') return native<BrowserMatches>({ type, url });
      if (type === 'fill' && 'id' in message && typeof message.id === 'string')
        return native<FillCredential>({ type, url, id: message.id });
      if (type === 'icon' && 'id' in message && typeof message.id === 'string')
        return native<string | null>({ type, url, id: message.id });
      if (
        type === 'capture' &&
        'username' in message &&
        typeof message.username === 'string' &&
        'password' in message &&
        typeof message.password === 'string'
      )
        return native<CaptureOffer>({
          type,
          url,
          username: message.username,
          password: message.password,
        });
      if (type === 'pendingCapture' || type === 'commitCapture')
        return native<CaptureOffer>({ type, url });
      if (type === 'dismissCapture') return native<CaptureOffer>({ type });
      return { ok: false, error: 'Unsupported request.' };
    })()
      .then(respond)
      .catch(() => respond({ ok: false, error: 'Unable to connect to Latch.' }));
    return true;
  });
});
