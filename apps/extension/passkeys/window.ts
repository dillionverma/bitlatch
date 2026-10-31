import { browser } from 'wxt/browser';
import '@latch/shared/theme.css';
import './window.css';
import { element, mark } from '../content/render';
import type { PasskeyView, PasskeyWindowReply, PasskeyWindowRequest } from './messages';

const site = document.querySelector<HTMLElement>('#site')!;
const title = document.querySelector<HTMLElement>('#title')!;
const description = document.querySelector<HTMLElement>('#description')!;
const list = document.querySelector<HTMLElement>('#passkeys')!;
const account = document.querySelector<HTMLElement>('#account')!;
const accountName = document.querySelector<HTMLElement>('#account-name')!;
const accountSite = document.querySelector<HTMLElement>('#account-site')!;
const primary = document.querySelector<HTMLButtonElement>('#primary')!;
const message = document.querySelector<HTMLElement>('#message')!;
const fallback = document.querySelector<HTMLButtonElement>('#fallback')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;

document.querySelector('.mark')!.append(mark());
account.querySelector('.tile')!.append(keyIcon());

const port = browser.runtime.connect({ name: 'passkey' });
let current: PasskeyView | null = null;
let primaryAction: PasskeyWindowRequest | null = null;

function send(request: PasskeyWindowRequest) {
  if (request.type !== 'load') setBusy(true);
  message.hidden = true;
  port.postMessage(request);
}

function setBusy(busy: boolean) {
  for (const button of document.querySelectorAll<HTMLButtonElement>('main button'))
    button.disabled = busy;
}

port.onMessage.addListener((reply: PasskeyWindowReply) => {
  setBusy(false);
  if (reply.type === 'error') {
    message.textContent = reply.message;
    message.hidden = false;
    return;
  }
  current = reply.view;
  render(reply.view);
});
// The background closes this window once the page has its answer.
port.onDisconnect.addListener(() => window.close());

function render(view: PasskeyView) {
  site.textContent = view.rpId;
  document.title = `Bitlatch · ${view.rpId}`;
  list.hidden = true;
  account.hidden = true;
  primary.hidden = true;
  primaryAction = null;
  if (view.state !== 'unlocked') {
    const missing = view.state === 'unavailable' || view.state === 'signed-out';
    title.textContent = missing ? 'Open Bitlatch' : 'Unlock Bitlatch';
    description.textContent = missing
      ? `Sign in to Bitlatch on this computer to use your passkey for ${view.rpId}.`
      : `Unlock your vault to use your passkey for ${view.rpId}.`;
    if (view.canUseBiometrics && !missing) showPrimary('Unlock with Touch ID', { type: 'unlock' });
    else showPrimary(missing ? 'Open Bitlatch' : 'Open Bitlatch to unlock', { type: 'openApp' });
    return;
  }
  if (view.kind === 'create') {
    title.textContent = 'Save a passkey';
    description.textContent = `Bitlatch saves the passkey in your vault as a new login for ${view.rpName || view.rpId}.`;
    accountName.textContent = view.userName || 'New passkey';
    accountSite.textContent =
      view.rpName && view.rpName !== view.rpId ? `${view.rpName} · ${view.rpId}` : view.rpId;
    account.hidden = false;
    showPrimary('Save passkey', { type: 'save' });
    return;
  }
  title.textContent = `Sign in to ${view.rpId}`;
  if (!view.passkeys.length) {
    description.textContent = 'Bitlatch has no passkey for this website.';
    return;
  }
  description.textContent =
    view.passkeys.length === 1
      ? 'Use this passkey from your vault.'
      : 'Choose a passkey from your vault.';
  list.replaceChildren(
    ...view.passkeys.map((passkey) => {
      const row = element('button', 'item');
      row.type = 'button';
      row.setAttribute('role', 'listitem');
      const tile = element('span', 'tile');
      tile.append(keyIcon());
      const text = element('span', 'item-text');
      text.append(
        element('span', 'item-name', passkey.userName || passkey.name),
        element('span', 'item-sub', passkey.userName ? passkey.name : passkey.rpId),
      );
      row.append(tile, text);
      row.addEventListener('click', () =>
        send({ type: 'choose', id: passkey.id, credentialId: passkey.credentialId }),
      );
      return row;
    }),
  );
  list.hidden = false;
  list.querySelector<HTMLButtonElement>('button')?.focus({ focusVisible: false });
}

function showPrimary(label: string, action: PasskeyWindowRequest) {
  primary.textContent = label;
  primary.hidden = false;
  primaryAction = action;
  primary.focus({ focusVisible: false });
}

primary.addEventListener('click', () => {
  if (primaryAction) send(primaryAction);
});
fallback.addEventListener('click', () => send({ type: 'fallback' }));
cancel.addEventListener('click', () => send({ type: 'cancel' }));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') send({ type: 'cancel' });
});
// Unlocking in the desktop app shows up here without another click.
const reloadWhileLocked = () => {
  if (current && current.state !== 'unlocked') send({ type: 'load' });
};
window.addEventListener('focus', reloadWhileLocked);
setInterval(reloadWhileLocked, 2000);

function keyIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute(
    'd',
    'M11.5 9.5a4 4 0 1 0-3.9-3.1L2 12v3h3v-2h2v-2h1.6l.9-.9a4 4 0 0 0 2 .4 M12.5 5.5h.01',
  );
  svg.append(path);
  return svg;
}

send({ type: 'load' });
