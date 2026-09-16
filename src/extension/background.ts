import type { BrowserMatches, FillCredential, Result, VaultStatus } from '../shared/types';

const HOST = 'app.latch.vault';
let port: chrome.runtime.Port | undefined;
let pending: { resolve: (value: Result<unknown>) => void; timer: ReturnType<typeof setTimeout> }[] =
  [];

function native<T>(request: unknown): Promise<Result<T>> {
  return new Promise((resolve) => {
    if (!port) {
      port = chrome.runtime.connectNative(HOST);
      port.onMessage.addListener((message: Result<unknown>) => {
        const next = pending.shift();
        if (next) {
          clearTimeout(next.timer);
          next.resolve(message);
        }
      });
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        port = undefined;
        for (const entry of pending) {
          clearTimeout(entry.timer);
          entry.resolve({ ok: false, error: 'Open Latch and connect your browser in Settings.' });
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
    entry.resolve({ ok: false, error: 'Latch is not responding. Open the Mac app and try again.' });
  }
  pending = [];
}

function senderUrl(sender: chrome.runtime.MessageSender): string | null {
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url || !sender.tab.url) return null;
  try {
    const frame = new URL(sender.url);
    const top = new URL(sender.tab.url);
    if (frame.origin !== top.origin || !['https:', 'http:'].includes(frame.protocol)) return null;
    return frame.href;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const type = message.type;
  void (async () => {
    const isPopup =
      sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html');
    if (type === 'open' && (isPopup || senderUrl(sender)))
      return native<VaultStatus>({ type: 'open' });
    if (type === 'status' && isPopup) return native<VaultStatus>({ type: 'status' });
    const url = senderUrl(sender);
    if (!url) return { ok: false, error: 'Autofill is unavailable in this frame.' };
    if (type === 'matches') return native<BrowserMatches>({ type, url });
    if (type === 'fill' && 'id' in message && typeof message.id === 'string')
      return native<FillCredential>({ type, url, id: message.id });
    return { ok: false, error: 'Unsupported request.' };
  })()
    .then(respond)
    .catch(() => respond({ ok: false, error: 'Unable to connect to Latch.' }));
  return true;
});
