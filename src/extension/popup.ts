import type { Result, VaultStatus } from '../shared/types';

const status = document.querySelector<HTMLElement>('#status')!;
const checkbox = document.querySelector<HTMLInputElement>('#autofill')!;
const domain = document.querySelector<HTMLElement>('#domain')!;
const message = document.querySelector<HTMLElement>('#message')!;

document.querySelector<HTMLButtonElement>('#open')!.addEventListener('click', async () => {
  const response = (await chrome.runtime.sendMessage({ type: 'open' })) as Result<unknown>;
  if (!response.ok) message.textContent = response.error;
  else window.close();
});

void (async () => {
  const state = (await chrome.runtime.sendMessage({ type: 'status' })) as Result<VaultStatus>;
  status.textContent = state.ok
    ? { unlocked: 'Vault unlocked', locked: 'Vault locked', 'signed-out': 'Sign in on your Mac' }[
        state.value
      ]
    : 'Waiting for Mac app';
  if (!state.ok) message.textContent = state.error;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const url = new URL(tab.url);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  domain.textContent = url.hostname;
  checkbox.disabled = false;
  const settings = await chrome.storage.local.get('autoFillOrigins');
  const origins: string[] = Array.isArray(settings.autoFillOrigins)
    ? settings.autoFillOrigins.filter(
        (value: unknown): value is string => typeof value === 'string',
      )
    : [];
  checkbox.checked = origins.includes(url.origin);
  checkbox.addEventListener('change', async () => {
    const next = checkbox.checked
      ? [...new Set([...origins, url.origin])]
      : origins.filter((origin) => origin !== url.origin);
    await chrome.storage.local.set({ autoFillOrigins: next });
    message.textContent = checkbox.checked
      ? 'Enabled. A single matching login will fill on the next page load. The page can read filled passwords.'
      : 'Use the inline picker to fill on this site.';
  });
})().catch(() => {
  status.textContent = 'Open Latch to connect';
});
