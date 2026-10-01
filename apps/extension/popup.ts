import { browser } from 'wxt/browser';
import '@latch/shared/theme.css';
import './content/appearance.css';
import './popup.css';
import { element, mark } from './content/render';
import type { BrowserVaultQuery } from '@latch/shared/protocol';
import type {
  BrowserUnlockState,
  BrowserVaultPage,
  ItemSummary,
  Result,
  VaultStatus,
} from '@latch/shared/types';

const status = document.querySelector<HTMLElement>('#status')!;
const vaultBrowser = document.querySelector<HTMLElement>('#browser')!;
const detail = document.querySelector<HTMLElement>('#detail')!;
const empty = document.querySelector<HTMLElement>('#empty')!;
const results = document.querySelector<HTMLElement>('#results')!;
const count = document.querySelector<HTMLElement>('#count')!;
const search = document.querySelector<HTMLInputElement>('#search')!;
const itemType = document.querySelector<HTMLSelectElement>('#item-type')!;
const scopes = document.querySelector<HTMLElement>('#scopes')!;
const lock = document.querySelector<HTMLButtonElement>('#lock')!;
const open = document.querySelector<HTMLButtonElement>('#open')!;
const connect = document.querySelector<HTMLButtonElement>('#connect')!;
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
const checkbox = document.querySelector<HTMLInputElement>('#autofill')!;
const domain = document.querySelector<HTMLElement>('#domain')!;
const message = document.querySelector<HTMLElement>('#message')!;
const unlockForm = document.querySelector<HTMLFormElement>('#unlock-form')!;
const masterPassword = document.querySelector<HTMLInputElement>('#master-password')!;
const passwordUnlock = document.querySelector<HTMLButtonElement>('#password-unlock')!;
const biometricUnlock = document.querySelector<HTMLButtonElement>('#biometric-unlock')!;

const paths = {
  open: 'M9 3H3v12h12V9 M9 1h8v8 M17 1 7 11',
  lock: 'M5 8V5a4 4 0 0 1 8 0v3 M3 8h12v9H3z M9 11v3',
  search: 'M12 12 17 17 M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  refresh: 'M15 7a6 6 0 1 0 0 5 M15 2v5h-5',
  back: 'M11 3 5 9l6 6 M5 9h11',
  note: 'M4 2h8l3 3v11H4z M7 7h5 M7 10h5 M7 13h3',
  copy: 'M6 6h10v11H6z M12 6V2H2v11h4',
} satisfies Record<string, string>;
function icon(name: keyof typeof paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
document.querySelector('.mark')!.append(mark());
open.append(icon('open'));
lock.append(icon('lock'));
refresh.append(icon('refresh'));
document.querySelector('#search-icon')!.append(icon('search'));
document.querySelector('#empty-icon')!.append(icon('lock'));

let state: VaultStatus | 'disconnected' | 'connecting' = 'connecting';
let selected: ItemSummary | undefined;
let items: ItemSummary[] = [];
let total = 0;
let revision = -1;
let generation = 0;
let requestVersion = 0;
let disposed = false;
let unlocking = false;
let query: BrowserVaultQuery = { query: '', scope: 'all', itemType: 'all', offset: 0 };
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

async function send<T>(request: object): Promise<Result<T>> {
  try {
    return (await browser.runtime.sendMessage(request)) as Result<T>;
  } catch {
    return { ok: false, error: 'Open Bitlatch on your computer to reconnect.' };
  }
}
function feedback(text: string, error = false) {
  clearTimeout(feedbackTimer);
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle('error', error);
  message.setAttribute('role', error ? 'alert' : 'status');
  if (text && !error) feedbackTimer = setTimeout(() => feedback(''), 3000);
}
function setState(next: typeof state, error = '') {
  const changed = state !== next;
  state = next;
  status.textContent = {
    unlocked: 'Unlocked',
    locked: 'Locked',
    'signed-out': 'Signed out',
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
  }[state];
  lock.hidden = state !== 'unlocked';
  empty.hidden = state === 'unlocked';
  vaultBrowser.hidden = state !== 'unlocked' || Boolean(selected);
  detail.hidden = state !== 'unlocked' || !selected;
  unlockForm.hidden = state !== 'locked';
  if (changed) {
    generation++;
    requestVersion++;
    masterPassword.value = '';
    feedback('');
  }
  if (state === 'unlocked') return changed;
  clearTimeout(searchTimer);
  results.removeAttribute('aria-busy');
  selected = undefined;
  items = [];
  total = 0;
  revision = -1;
  results.replaceChildren();
  detail.replaceChildren();
  search.value = '';
  query.query = '';
  count.textContent = '';
  document.querySelector('#empty-title')!.textContent =
    state === 'locked'
      ? 'Your vault is locked'
      : state === 'signed-out'
        ? 'Sign in to Bitlatch'
        : state === 'disconnected'
          ? 'Connect to Bitlatch'
          : 'Connecting to Bitlatch';
  document.querySelector('#empty-description')!.textContent =
    error ||
    (state === 'locked'
      ? 'Unlock to search and fill from your browser.'
      : state === 'signed-out'
        ? 'Sign in on your computer to access your vault.'
        : 'Your vault stays on your computer.');
  connect.hidden = state === 'connecting';
  connect.textContent = state === 'locked' ? 'Open desktop app' : 'Open Bitlatch';
  return changed;
}
async function openDesktop() {
  const response = await send<unknown>({ type: 'open' });
  if (disposed) return;
  if (response.ok) window.close();
  else feedback(response.error, true);
}
open.addEventListener('click', () => void openDesktop());
connect.addEventListener('click', () => void openDesktop());
async function unlockVault(biometric: boolean) {
  if (unlocking || state !== 'locked') return;
  const request = biometric
    ? { type: 'biometricUnlock' as const }
    : { type: 'unlock' as const, password: masterPassword.value };
  masterPassword.value = '';
  unlocking = true;
  passwordUnlock.disabled = biometricUnlock.disabled = masterPassword.disabled = true;
  passwordUnlock.textContent = biometric ? 'Waiting for Touch ID…' : 'Unlocking…';
  feedback('');
  const lifetime = generation;
  const pendingUnlock = send<VaultStatus>(request);
  if (request.type === 'unlock') request.password = '';
  const response = await pendingUnlock;
  unlocking = false;
  passwordUnlock.disabled = biometricUnlock.disabled = masterPassword.disabled = false;
  passwordUnlock.textContent = 'Unlock vault';
  if (disposed || lifetime !== generation) return;
  if (!response.ok) {
    feedback(response.error, true);
    masterPassword.focus();
  }
  void refreshStatus();
}
unlockForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.isTrusted) void unlockVault(false);
});
biometricUnlock.addEventListener('click', (event) => {
  if (event.isTrusted) void unlockVault(true);
});
lock.addEventListener('click', async () => {
  setState('locked');
  const lifetime = generation;
  const response = await send<VaultStatus>({ type: 'lock' });
  if (disposed || lifetime !== generation) return;
  if (!response.ok) setState('disconnected', response.error);
});

function tile(item: ItemSummary) {
  const node = element('span', 'tile');
  node.setAttribute('aria-hidden', 'true');
  if (item.type === 2) node.append(icon('note'));
  else node.textContent = item.name.slice(0, 1).toUpperCase();
  return node;
}
function showList(focusId?: string) {
  selected = undefined;
  detail.hidden = true;
  detail.replaceChildren();
  vaultBrowser.hidden = false;
  renderItems();
  const row = [...results.querySelectorAll<HTMLButtonElement>('.item')].find(
    (entry) => entry.dataset.id === focusId,
  );
  (row ?? search).focus();
}
function showDetail(item: ItemSummary) {
  selected = item;
  vaultBrowser.hidden = true;
  detail.hidden = false;
  detail.replaceChildren();
  feedback('');
  const back = element('button', 'back', 'All results');
  back.prepend(icon('back'));
  back.addEventListener('click', () => showList(item.id));
  const heading = element('div', 'detail-heading');
  const title = element('div', '');
  title.append(
    element('h1', '', item.name),
    element(
      'p',
      '',
      item.type === 2 ? 'Secure note' : item.hasPasskey ? 'Login · Passkey' : 'Login',
    ),
  );
  heading.append(tile(item), title);
  detail.append(back, heading);
  if (item.type === 1) {
    addField(item, 'Username', item.username || 'No username', 'username');
    addField(item, 'Password', '••••••••••••', 'password');
    addField(item, 'Website', item.website || 'No website', 'website');
  }
  addField(item, 'Notes', item.type === 2 ? 'Secure note' : 'Saved with this login', 'notes');
  detail.append(
    element(
      'p',
      'detail-hint',
      item.type === 1
        ? 'Fill from the Bitlatch button in a login field. Copied values clear after 30 seconds.'
        : 'Copy the note to read it, or open it in Bitlatch. Copied values clear after 30 seconds.',
    ),
  );
  back.focus();
}
function addField(
  item: ItemSummary,
  label: string,
  value: string,
  field: 'username' | 'password' | 'website' | 'notes',
) {
  const row = element('div', 'field');
  const text = element('div', 'field-text');
  text.append(element('span', 'field-label', label), element('span', 'field-value', value));
  const copy = element('button', '', 'Copy');
  copy.prepend(icon('copy'));
  copy.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
  copy.addEventListener('click', async () => {
    const lifetime = generation;
    copy.disabled = true;
    const response = await send<null>({ type: 'copy', id: item.id, field });
    if (disposed || lifetime !== generation || selected?.id !== item.id) return;
    copy.disabled = false;
    if (response.ok) feedback(`${label} copied`);
    else {
      feedback(response.error, true);
      void refreshStatus();
    }
  });
  row.append(text, copy);
  detail.append(row);
}
function renderItems() {
  count.textContent = `${total} ${total === 1 ? 'item' : 'items'}`;
  results.replaceChildren();
  for (const item of items) {
    const row = element('button', 'item');
    row.dataset.id = item.id;
    const text = element('span', 'item-text');
    text.append(
      element('span', 'item-name', item.name),
      element(
        'span',
        'item-sub',
        item.type === 2 ? 'Secure note' : item.username || item.website || 'Login',
      ),
    );
    row.append(tile(item), text);
    if (item.favorite) {
      const star = element('span', 'favorite', '☆');
      star.setAttribute('aria-label', 'Favorite');
      row.append(star);
    }
    row.addEventListener('click', () => showDetail(item));
    results.append(row);
  }
  if (!items.length)
    results.append(
      element(
        'p',
        'no-results',
        query.query
          ? 'No items match your search.'
          : query.scope === 'site'
            ? 'No matching logins for this website.'
            : query.scope === 'favorites'
              ? 'No favorite items yet.'
              : 'No items to show.',
      ),
    );
  if (items.length < total) {
    const more = element('button', 'more', 'Load more');
    more.addEventListener('click', () => {
      more.disabled = true;
      void loadItems(true);
    });
    results.append(more);
  }
}
async function loadItems(append = false) {
  const version = ++requestVersion;
  const lifetime = generation;
  results.setAttribute('aria-busy', 'true');
  const response = await send<BrowserVaultPage>({
    type: 'browse',
    query: { ...query, offset: append ? items.length : 0 },
  });
  if (disposed || lifetime !== generation || version !== requestVersion) return;
  results.removeAttribute('aria-busy');
  if (!response.ok) {
    setState('disconnected', response.error);
    return;
  }
  if (response.value.state !== 'unlocked') {
    setState(response.value.state);
    return;
  }
  if (append && response.value.revision !== revision) {
    await loadItems();
    return;
  }
  setState('unlocked');
  revision = response.value.revision;
  total = response.value.total;
  const previousCount = items.length;
  items = append ? [...items, ...response.value.items] : response.value.items;
  renderItems();
  if (append) results.querySelectorAll<HTMLButtonElement>('.item')[previousCount]?.focus();
}
function changeQuery() {
  clearTimeout(searchTimer);
  requestVersion++;
  selected = undefined;
  detail.replaceChildren();
  detail.hidden = true;
  vaultBrowser.hidden = false;
  items = [];
  results.replaceChildren();
  count.textContent = 'Searching…';
  feedback('');
  searchTimer = setTimeout(() => void loadItems(), 120);
}
search.addEventListener('input', () => {
  query.query = search.value;
  changeQuery();
});
scopes.addEventListener('click', (event) => {
  if (!(event.target instanceof HTMLButtonElement)) return;
  const scope = event.target.dataset.scope;
  if (scope !== 'all' && scope !== 'favorites' && scope !== 'site') return;
  query.scope = scope;
  scopes
    .querySelectorAll('button')
    .forEach((button) => button.setAttribute('aria-pressed', String(button === event.target)));
  changeQuery();
});
itemType.addEventListener('change', () => {
  const type = itemType.value;
  if (type !== 'all' && type !== 'login' && type !== 'note') return;
  query.itemType = type;
  changeQuery();
});
refresh.addEventListener('click', () => {
  feedback('');
  void loadItems();
});
results.addEventListener('keydown', (event) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const rows = [...results.querySelectorAll<HTMLButtonElement>('.item')];
  if (!rows.length) return;
  event.preventDefault();
  const index = rows.findIndex((row) => row === document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
  rows[next]?.focus();
});
search.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    results.querySelector<HTMLButtonElement>('.item')?.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selected) {
    event.preventDefault();
    showList(selected.id);
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'f' && state === 'unlocked') {
    event.preventDefault();
    showList();
    search.select();
  }
});
async function refreshStatus() {
  clearTimeout(statusTimer);
  const lifetime = generation;
  const response = await send<BrowserUnlockState>({ type: 'unlockState' });
  if (disposed) return;
  if (lifetime === generation) {
    const changed = setState(
      response.ok ? response.value.state : 'disconnected',
      response.ok ? '' : response.error,
    );
    biometricUnlock.hidden = !response.ok || !response.value.canUseBiometrics;
    if (changed && state === 'locked') masterPassword.focus();
    if (changed && state === 'unlocked') {
      void loadItems();
      search.focus();
    }
  }
  statusTimer = setTimeout(() => void refreshStatus(), 1000);
}
window.addEventListener('pagehide', () => {
  disposed = true;
  generation++;
  search.value = '';
  masterPassword.value = '';
  query.query = '';
  clearTimeout(statusTimer);
  clearTimeout(searchTimer);
  clearTimeout(feedbackTimer);
  items = [];
  selected = undefined;
  results.replaceChildren();
  detail.replaceChildren();
});
void refreshStatus();

void (async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const url = new URL(tab.url);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  domain.textContent = url.host;
  domain.title = url.origin;
  checkbox.setAttribute('aria-describedby', 'domain');
  const settings = await browser.storage.local.get('autoFillOrigins');
  checkbox.checked =
    Array.isArray(settings.autoFillOrigins) && settings.autoFillOrigins.includes(url.origin);
  checkbox.disabled = false;
  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    try {
      const current = await browser.storage.local.get('autoFillOrigins');
      const origins: string[] = Array.isArray(current.autoFillOrigins)
        ? current.autoFillOrigins.filter(
            (value: unknown): value is string => typeof value === 'string',
          )
        : [];
      const next = enabled
        ? [...new Set([...origins, url.origin])]
        : origins.filter((origin) => origin !== url.origin);
      await browser.storage.local.set({ autoFillOrigins: next });
      feedback(
        enabled
          ? 'One matching login will fill on the next page load. The page can read filled passwords.'
          : 'Automatic fill disabled for this site.',
      );
    } catch {
      checkbox.checked = !enabled;
      feedback('Could not save this site setting. Try again.', true);
    } finally {
      checkbox.disabled = false;
    }
  });
})().catch(() => feedback('Could not read this site setting.', true));
