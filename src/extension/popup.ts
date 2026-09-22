import type { Result, VaultStatus } from '../shared/types';

const status = document.querySelector<HTMLElement>('#status')!;
const checkbox = document.querySelector<HTMLInputElement>('#autofill')!;
const domain = document.querySelector<HTMLElement>('#domain')!;
const message = document.querySelector<HTMLElement>('#message')!;
const open = document.querySelector<HTMLButtonElement>('#open')!;
const connectionError = document.createElement('p');
connectionError.className = 'connection-error';
connectionError.setAttribute('role', 'alert');
connectionError.hidden = true;
status.after(connectionError);
status.setAttribute('role', 'status');
message.setAttribute('role', 'status');
message.setAttribute('aria-live', 'polite');
checkbox.setAttribute('aria-describedby', 'domain message');
document.querySelector('.badge')!.textContent = 'Preview';

// Same local mark as the Mac app. No remote asset or HTML interpolation.
const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
mark.setAttribute('viewBox', '0 0 24 24');
mark.setAttribute('fill', 'none');
mark.setAttribute('aria-hidden', 'true');
for (const d of ['M6 10V7a6 6 0 0 1 12 0v2M5 10h14v11H5z', 'M12 14v3']) {
  const path = document.createElementNS(mark.namespaceURI, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.65');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  mark.append(path);
}
document.querySelector('.mark')!.replaceChildren(mark);

function feedback(text: string, error = false) {
  message.classList.toggle('error', error);
  message.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
}

async function send<T>(type: 'status' | 'open'): Promise<Result<T>> {
  try {
    return (await chrome.runtime.sendMessage({ type })) as Result<T>;
  } catch {
    return { ok: false, error: 'Open Latch and connect your browser in Settings.' };
  }
}

open.addEventListener('click', async () => {
  open.disabled = true;
  open.setAttribute('aria-busy', 'true');
  const response = await send<unknown>('open');
  if (!response.ok) {
    feedback(response.error, true);
    open.disabled = false;
    open.removeAttribute('aria-busy');
    open.focus();
  } else window.close();
});

let statusTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
async function refreshStatus() {
  const state = await send<VaultStatus>('status');
  if (disposed) return;
  const label = state.ok
    ? { unlocked: 'Vault unlocked', locked: 'Vault locked', 'signed-out': 'Sign in on your Mac' }[
        state.value
      ]
    : 'Mac app disconnected';
  if (status.textContent !== label) status.textContent = label;
  const error = state.ok ? '' : state.error;
  if (connectionError.textContent !== error) connectionError.textContent = error;
  connectionError.hidden = state.ok;
  statusTimer = setTimeout(() => void refreshStatus(), 1000);
}
window.addEventListener('pagehide', () => {
  disposed = true;
  clearTimeout(statusTimer);
});
void refreshStatus();

void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const url = new URL(tab.url);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  domain.textContent = url.host;
  domain.title = url.origin;
  const settings = await chrome.storage.local.get('autoFillOrigins');
  let origins: string[] = Array.isArray(settings.autoFillOrigins)
    ? settings.autoFillOrigins.filter(
        (value: unknown): value is string => typeof value === 'string',
      )
    : [];
  checkbox.checked = origins.includes(url.origin);
  checkbox.disabled = false;
  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    try {
      // Read again so another popup's site setting is not overwritten.
      const current = await chrome.storage.local.get('autoFillOrigins');
      origins = Array.isArray(current.autoFillOrigins)
        ? current.autoFillOrigins.filter(
            (value: unknown): value is string => typeof value === 'string',
          )
        : [];
      const next = enabled
        ? [...new Set([...origins, url.origin])]
        : origins.filter((origin) => origin !== url.origin);
      await chrome.storage.local.set({ autoFillOrigins: next });
      origins = next;
      feedback(
        enabled
          ? 'Enabled. One matching login will fill on the next page load. The page can read filled passwords.'
          : 'Use the inline picker to fill on this site.',
      );
    } catch {
      checkbox.checked = !enabled;
      feedback('Could not save this site setting. Try again.', true);
    } finally {
      checkbox.disabled = false;
      checkbox.focus();
    }
  });
})().catch(() => {
  feedback('Could not read this site setting. Reopen the popup to try again.', true);
});
