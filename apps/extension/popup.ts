import { browser } from 'wxt/browser';
import '@latch/shared/theme.css';
import './popup.css';
import { element, mark } from './content/render';
import { itemDraft, uriMatchOptions } from '@latch/shared/item-drafts';
import { uriMatchSchema } from '@latch/shared/protocol';
import { defaultPasswordOptions } from '@latch/shared/types';
import type { BrowserVaultQuery } from '@latch/shared/protocol';
import type {
  BrowserSuggestions,
  BrowserSaveResult,
  BrowserUnlockState,
  BrowserVaultPage,
  ItemSummary,
  ItemDetail,
  ItemDraft,
  PasswordOptions,
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
type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string; item: ItemDetail | null }
  | { kind: 'editor'; draft: ItemDraft; initial: string; item: ItemDetail | null };
let view: View = { kind: 'list' };
let viewVersion = 0;
let working = false;
function clearView() {
  if (view.kind === 'editor') {
    view.draft.notes = '';
    view.initial = '';
    if (view.draft.type === 1) {
      view.draft.password = '';
      view.draft.username = '';
      view.draft.uris = [];
    }
  }
  if (view.kind !== 'list' && view.item) {
    view.item.password = '';
    view.item.notes = '';
  }
  detail.querySelectorAll('input, textarea').forEach((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = '';
  });
  view = { kind: 'list' };
  viewVersion++;
  working = false;
  detail.replaceChildren();
}
let items: ItemSummary[] = [];
let suggestions: BrowserSuggestions | undefined;
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
  open.hidden = state === 'locked';
  empty.hidden = state === 'unlocked';
  vaultBrowser.hidden = state !== 'unlocked' || view.kind !== 'list';
  detail.hidden = state !== 'unlocked' || view.kind === 'list';
  unlockForm.hidden = state !== 'locked';
  document.querySelector('footer')!.hidden = state !== 'unlocked';
  if (changed) {
    generation++;
    requestVersion++;
    masterPassword.value = '';
    feedback('');
  }
  if (state === 'unlocked') return changed;
  clearTimeout(searchTimer);
  results.removeAttribute('aria-busy');
  clearView();
  items = [];
  suggestions = undefined;
  iconCache.clear();
  resetIcons();
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
  const description = document.querySelector<HTMLElement>('#empty-description')!;
  description.hidden = state === 'locked';
  description.textContent =
    error ||
    (state === 'signed-out'
      ? 'Sign in on your computer to access your vault.'
      : 'Your vault stays on your computer.');
  connect.hidden = state === 'connecting' || state === 'locked';
  connect.textContent = 'Open Bitlatch';
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

const iconCache = new Map<string, string | null>();
const iconItems = new WeakMap<Element, ItemSummary>();
let iconQueue: { node: HTMLElement; item: ItemSummary; lifetime: number }[] = [];
let loadingIcons = 0;
const iconObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    iconObserver.unobserve(entry.target);
    const item = iconItems.get(entry.target);
    if (item && entry.target instanceof HTMLElement)
      iconQueue.push({ node: entry.target, item, lifetime: generation });
  }
  drainIcons();
});
function resetIcons() {
  iconObserver.disconnect();
  iconQueue = [];
}
function showIcon(node: HTMLElement, value: string | null, lifetime: number) {
  if (!value || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) return;
  const image = document.createElement('img');
  image.className = 'website-logo';
  image.alt = '';
  image.draggable = false;
  image.addEventListener('load', () => {
    if (!disposed && lifetime === generation && node.isConnected) node.replaceChildren(image);
  });
  image.src = value;
}
function drainIcons() {
  while (loadingIcons < 3 && iconQueue.length) {
    const next = iconQueue.shift()!;
    if (disposed || next.lifetime !== generation || !next.node.isConnected) continue;
    if (iconCache.has(next.item.id)) {
      showIcon(next.node, iconCache.get(next.item.id) ?? null, next.lifetime);
      continue;
    }
    loadingIcons++;
    void send<string | null>({ type: 'websiteIcon', id: next.item.id })
      .then((response) => {
        if (disposed || next.lifetime !== generation || !response.ok) return;
        if (iconCache.size >= 256) iconCache.delete(iconCache.keys().next().value!);
        iconCache.set(next.item.id, response.value);
        showIcon(next.node, response.value, next.lifetime);
      })
      .finally(() => {
        loadingIcons--;
        drainIcons();
      });
  }
}
function tile(item: ItemSummary) {
  const node = element('span', 'tile');
  node.setAttribute('aria-hidden', 'true');
  if (item.type === 2) node.append(icon('note'));
  else {
    node.textContent = (Array.from(item.name.trim())[0] ?? '?').toUpperCase();
    if (item.website) {
      iconItems.set(node, item);
      iconObserver.observe(node);
    }
  }
  return node;
}
function fillButton(item: ItemSummary) {
  const button = element('button', 'fill-button', 'Fill');
  button.setAttribute('aria-label', `Fill ${item.name}`);
  button.addEventListener('click', async () => {
    const context = suggestions;
    if (!context || context.tabId === null) return;
    const lifetime = generation;
    button.disabled = true;
    button.textContent = 'Filling…';
    feedback('');
    const response = await send<null>({
      type: 'fillActiveTab',
      id: item.id,
      tabId: context.tabId,
      url: context.url,
    });
    if (disposed || lifetime !== generation) return;
    button.disabled = false;
    button.textContent = 'Fill';
    if (response.ok) window.close();
    else {
      feedback(response.error, true);
      void refreshStatus();
    }
  });
  return button;
}
function showList(focusId?: string) {
  clearView();
  detail.hidden = true;
  vaultBrowser.hidden = false;
  renderItems();
  const row = [...results.querySelectorAll<HTMLButtonElement>('.item')].find(
    (entry) => entry.dataset.id === focusId,
  );
  (row ?? search).focus();
}
function button(text: string, action: () => void) {
  const node = element('button', '', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function current(version: number, lifetime: number) {
  return !disposed && state === 'unlocked' && lifetime === generation && version === viewVersion;
}
async function operation<T>(request: object, onDone: (value: T) => void, pending = 'Saving…') {
  if (working || state !== 'unlocked') return;
  working = true;
  const version = viewVersion;
  const lifetime = generation;
  const controls = [...detail.querySelectorAll('button, input, textarea, select')];
  controls.forEach((node) => {
    if ('disabled' in node) node.disabled = true;
  });
  feedback(pending);
  const response = await send<T>(request);
  if (!current(version, lifetime)) return;
  working = false;
  controls.forEach((node) => {
    if ('disabled' in node) node.disabled = false;
  });
  if (response.ok) {
    feedback('');
    onDone(response.value);
  } else {
    feedback(response.error, true);
    void refreshStatus();
  }
}
async function showDetail(summary: Pick<ItemSummary, 'id'>, saved = false) {
  clearView();
  resetIcons();
  view = { kind: 'detail', id: summary.id, item: null };
  vaultBrowser.hidden = true;
  detail.hidden = false;
  detail.append(
    button('All results', () => showList(summary.id)),
    element('p', '', saved ? 'Saved to Bitwarden. Loading item…' : 'Loading item…'),
  );
  feedback('');
  const version = viewVersion;
  const lifetime = generation;
  const response = await send<ItemDetail>({ type: 'detail', id: summary.id });
  if (!current(version, lifetime)) return;
  if (!response.ok) {
    feedback(saved ? `Saved to Bitwarden. ${response.error}` : response.error, true);
    if (saved) {
      detail.querySelector('p')!.textContent =
        'Saved to Bitwarden. Open the desktop app to view this item.';
      detail.append(button('Open desktop app', () => void openDesktop()));
    }
    void refreshStatus();
    return;
  }
  if (saved) feedback('Saved to Bitwarden');
  view = { kind: 'detail', id: summary.id, item: response.value };
  renderDetail(response.value);
}
function renderDetail(item: ItemDetail) {
  detail.replaceChildren();
  const back = button('All results', () => {
    if (!working) showList(item.id);
  });
  back.className = 'back';
  back.prepend(icon('back'));
  const heading = element('div', 'detail-heading');
  const title = element('div', '');
  title.append(
    element('h1', '', item.name),
    element(
      'p',
      '',
      item.restorable
        ? 'In Trash'
        : item.type === 2
          ? 'Secure note'
          : item.hasPasskey
            ? 'Login · Passkey'
            : 'Login',
    ),
  );
  heading.append(tile(item), title);
  detail.append(back, heading);
  const actions = element('div', 'detail-actions');
  if (item.editable) {
    actions.append(
      button('Edit', () => showEditor(itemDraft(item), item)),
      button(item.favorite ? 'Unfavorite' : 'Favorite', () => {
        void operation<ItemSummary>(
          { type: 'setFavorite', id: item.id, favorite: !item.favorite },
          (updated) => {
            void showDetail(updated);
            void loadItems();
          },
        );
      }),
    );
  }
  if (item.deletable)
    actions.append(
      button('Move to Trash', () => {
        if (!confirm(`Move "${item.name}" to Trash? You can restore it later.`)) return;
        void operation(
          { type: 'delete', id: item.id },
          () => {
            showList();
            void loadItems();
            feedback('Moved to Trash');
          },
          'Moving to Trash…',
        );
      }),
    );
  if (item.restorable)
    actions.append(
      button('Restore', () => {
        void operation(
          { type: 'restore', id: item.id },
          () => {
            showList();
            void loadItems();
            feedback('Restored to your vault');
          },
          'Restoring…',
        );
      }),
    );
  if (!item.editable && !item.restorable)
    actions.append(element('p', 'muted', 'Edit this item in Bitwarden.'));
  detail.append(actions);
  if (
    !item.restorable &&
    query.scope !== 'trash' &&
    suggestions?.items.some((entry) => entry.id === item.id)
  )
    detail.append(fillButton(item));
  if (item.type === 1) {
    addField(item, 'Username', item.username || 'No username', 'username');
    const row = addField(
      item,
      'Password',
      item.password ? '••••••••••••' : 'No password',
      'password',
    );
    const value = row.querySelector('.field-value')!;
    let revealed = false;
    if (item.password)
      row.append(
        button('Reveal', () => {
          revealed = !revealed;
          value.textContent = revealed ? item.password : '••••••••••••';
          const reveal = row.lastElementChild;
          if (reveal) reveal.textContent = revealed ? 'Hide' : 'Reveal';
        }),
      );
    for (const uri of item.uris) {
      const match =
        uriMatchOptions.find(
          (option) => option.value === (uri.match === null ? '' : String(uri.match)),
        )?.label ?? 'Imported rule';
      addField(
        item,
        `Website · ${match}`,
        uri.uri ?? 'Empty URI',
        uri.sourceIndex === 0 ? 'website' : undefined,
      );
    }
  }
  addField(item, 'Notes', item.notes || 'No notes', 'notes');
  back.focus();
}
function addField(
  item: ItemSummary,
  label: string,
  value: string,
  field?: 'username' | 'password' | 'notes' | 'website',
) {
  const row = element('div', 'field');
  const text = element('div', 'field-text');
  text.append(element('span', 'field-label', label), element('span', 'field-value', value));
  row.append(text);
  if (field) {
    const copy = button('Copy', () => {
      void operation(
        { type: 'copy', id: item.id, field },
        () => feedback(`${label} copied`),
        'Copying…',
      );
    });
    copy.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
    row.append(copy);
  }
  detail.append(row);
  return row;
}
function showEditor(draft: ItemDraft, item: ItemDetail | null = null) {
  viewVersion++;
  view = { kind: 'editor', draft, initial: JSON.stringify(draft), item };
  resetIcons();
  vaultBrowser.hidden = true;
  detail.hidden = false;
  feedback('');
  renderEditor();
}
function leaveEditor() {
  if (working || view.kind !== 'editor') return;
  if (JSON.stringify(view.draft) !== view.initial && !confirm('Discard unsaved changes?')) return;
  const item = view.item;
  if (item) void showDetail(item);
  else showList();
}
function renderEditor() {
  if (view.kind !== 'editor') return;
  const editing = view;
  const draft = editing.draft;
  detail.replaceChildren();
  detail.append(
    button('Cancel', leaveEditor),
    element('h1', '', `${draft.id ? 'Edit' : 'New'} ${draft.type === 1 ? 'login' : 'secure note'}`),
  );
  const form = document.createElement('form');
  form.className = 'editor-form';
  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    type = 'text',
    limit = 16384,
  ) => {
    const wrapper = element('label', 'editor-field');
    wrapper.append(element('span', '', label));
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.maxLength = limit;
    input.autocomplete = 'off';
    input.addEventListener('input', () => update(input.value));
    wrapper.append(input);
    form.append(wrapper);
    return input;
  };
  const name = field(
    'Name',
    draft.name,
    (value) => {
      draft.name = value;
    },
    'text',
    500,
  );
  name.required = true;
  if (draft.type === 1) {
    field('Username', draft.username, (value) => {
      draft.username = value;
    });
    const password = field(
      'Password',
      draft.password,
      (value) => {
        draft.password = value;
      },
      'password',
    );
    form.append(
      button('Reveal password', () => {
        password.type = password.type === 'password' ? 'text' : 'password';
      }),
    );
    const generator = element('details', 'generator');
    generator.append(element('summary', '', 'Generate password'));
    const options: PasswordOptions = { ...defaultPasswordOptions };
    const lengthLabel = element('label', '', 'Length');
    const length = document.createElement('input');
    length.type = 'number';
    length.min = '8';
    length.max = '128';
    length.value = String(options.length);
    length.setAttribute('aria-label', 'Password length');
    lengthLabel.append(length);
    generator.append(lengthLabel);
    for (const key of [
      'lowercase',
      'uppercase',
      'numbers',
      'symbols',
      'excludeAmbiguous',
    ] as const) {
      const label = element(
        'label',
        '',
        key === 'excludeAmbiguous' ? 'Avoid ambiguous characters' : key,
      );
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = options[key];
      check.addEventListener('change', () => {
        options[key] = check.checked;
      });
      label.prepend(check);
      generator.append(label);
    }
    generator.append(
      button('Use generated password', () => {
        if (!length.reportValidity()) return;
        options.length = Number(length.value);
        void operation<string>(
          { type: 'generate', options },
          (value) => {
            draft.password = value;
            password.value = value;
            feedback('Generated password added');
          },
          'Generating…',
        );
      }),
    );
    form.append(generator);
    const websites = element('div', 'websites');
    form.append(websites);
    const renderWebsites = () => {
      websites.replaceChildren(element('h2', '', 'Websites'));
      draft.uris.forEach((row, index) => {
        const container = element('div', 'website-row');
        if (row.action === 'keep') {
          container.append(
            element(
              'p',
              'muted',
              `${editing.item?.uris[row.sourceIndex]?.uri ?? 'Empty imported URI'}. Imported rule preserved. Edit it in Bitwarden or remove this row.`,
            ),
          );
        } else {
          const uri = document.createElement('input');
          uri.value = row.uri;
          uri.placeholder = 'https://example.com';
          uri.maxLength = 2048;
          uri.required = true;
          uri.setAttribute('aria-label', `Website ${index + 1}`);
          uri.addEventListener('input', () => {
            row.uri = uri.value;
          });
          const match = document.createElement('select');
          match.setAttribute('aria-label', `Match rule ${index + 1}`);
          for (const option of uriMatchOptions) {
            const node = element('option', '', option.label);
            node.value = option.value;
            match.append(node);
          }
          match.value = row.match === null ? '' : String(row.match);
          match.addEventListener('change', () => {
            row.match = uriMatchSchema.parse(match.value === '' ? null : Number(match.value));
          });
          container.append(uri, match);
        }
        container.append(
          button('Remove website', () => {
            draft.uris.splice(index, 1);
            renderWebsites();
          }),
        );
        websites.append(container);
      });
      websites.append(
        button('Add website', () => {
          draft.uris.push({ action: 'write', uri: '', match: null });
          renderWebsites();
          websites
            .querySelectorAll('input')
            [draft.uris.filter((row) => row.action === 'write').length - 1]?.focus();
        }),
      );
    };
    renderWebsites();
  }
  const noteLabel = element('label', 'editor-field');
  noteLabel.append(element('span', '', 'Notes'));
  const notes = document.createElement('textarea');
  notes.value = draft.notes;
  notes.maxLength = 100000;
  notes.rows = draft.type === 2 ? 8 : 4;
  notes.addEventListener('input', () => {
    draft.notes = notes.value;
  });
  noteLabel.append(notes);
  form.append(noteLabel);
  const favorite = element('label', '', 'Favorite');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = draft.favorite;
  check.addEventListener('change', () => {
    draft.favorite = check.checked;
  });
  favorite.prepend(check);
  form.append(favorite);
  const save = element('button', 'primary', 'Save');
  save.type = 'submit';
  form.append(save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void operation<BrowserSaveResult>({ type: 'save', draft }, (saved) => {
      clearView();
      void showDetail(saved, true);
      void loadItems();
    });
  });
  detail.append(form);
  name.focus();
}
function newItem(type: 1 | 2) {
  const base = { name: '', notes: '', favorite: false };
  showEditor(
    type === 2 ? { ...base, type } : { ...base, type, username: '', password: '', uris: [] },
  );
}
document.querySelector('#new-login')!.addEventListener('click', () => newItem(1));
document.querySelector('#new-note')!.addEventListener('click', () => newItem(2));
function itemRow(item: ItemSummary, canFill: boolean) {
  const container = element('div', 'item-row');
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
    star.setAttribute('aria-hidden', 'true');
    row.setAttribute('aria-label', `${item.name}, ${item.username || 'Login'}, favorite`);
    row.append(star);
  }
  row.addEventListener('click', () => showDetail(item));
  container.append(row);
  if (canFill) container.append(fillButton(item));
  return container;
}
function renderItems() {
  resetIcons();
  count.textContent = String(total);
  document.querySelector('#list-title')!.textContent = query.query
    ? 'Search results'
    : query.scope === 'favorites'
      ? 'Favorites'
      : query.scope === 'site'
        ? 'This site'
        : query.scope === 'trash'
          ? 'Trash'
          : 'Your vault';
  results.replaceChildren();
  const suggested =
    query.scope === 'all' && !query.query.trim() && query.itemType !== 'note'
      ? (suggestions?.items ?? [])
      : [];
  const suggestedIds = new Set(suggested.map((item) => item.id));
  if (suggested.length) {
    const heading = element('h2', 'group-heading', 'This site');
    heading.append(element('span', '', new URL(suggestions!.url).host));
    results.append(heading, ...suggested.map((item) => itemRow(item, true)));
    if (items.some((item) => !suggestedIds.has(item.id)))
      results.append(element('h2', 'group-heading', 'All items'));
  }
  for (const item of items) {
    if (suggestedIds.has(item.id)) continue;
    results.append(
      itemRow(
        item,
        Boolean(
          suggestions?.url &&
          (query.scope === 'site' || suggestions.items.some((entry) => entry.id === item.id)),
        ),
      ),
    );
  }
  if (!items.length && !suggested.length)
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
  const [response, matches] = await Promise.all([
    send<BrowserVaultPage>({
      type: 'browse',
      query: { ...query, offset: append ? items.length : 0 },
    }),
    append ? Promise.resolve(null) : send<BrowserSuggestions>({ type: 'suggestions' }),
  ]);
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
  if (matches?.ok && matches.value.state !== 'unlocked') {
    setState(matches.value.state);
    return;
  }
  setState('unlocked');
  if (!append) suggestions = matches?.ok ? matches.value : undefined;
  revision = response.value.revision;
  total = response.value.total;
  const firstAddedId = response.value.items[0]?.id;
  items = append ? [...items, ...response.value.items] : response.value.items;
  renderItems();
  if (append)
    [...results.querySelectorAll<HTMLButtonElement>('.item')]
      .find((row) => row.dataset.id === firstAddedId)
      ?.focus();
}
function changeQuery() {
  clearTimeout(searchTimer);
  requestVersion++;
  clearView();
  detail.replaceChildren();
  detail.hidden = true;
  vaultBrowser.hidden = false;
  items = [];
  resetIcons();
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
  if (scope !== 'all' && scope !== 'favorites' && scope !== 'site' && scope !== 'trash') return;
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
refresh.addEventListener('click', async () => {
  if (working) return;
  working = true;
  refresh.disabled = true;
  const lifetime = generation;
  feedback('Syncing…');
  const response = await send<unknown>({ type: 'sync' });
  refresh.disabled = false;
  if (disposed || lifetime !== generation) return;
  working = false;
  if (!response.ok) {
    feedback(response.error, true);
    void refreshStatus();
    return;
  }
  iconCache.clear();
  await loadItems();
  feedback('Vault synced');
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
  if (event.key === 'Escape' && view.kind !== 'list') {
    event.preventDefault();
    if (view.kind === 'editor') leaveEditor();
    else if (!working) showList(view.id);
  }
  if (working) return;
  if ((event.metaKey || event.ctrlKey) && event.key === 'f' && state === 'unlocked') {
    event.preventDefault();
    if (view.kind === 'editor') {
      leaveEditor();
      if (view.kind === 'editor') return;
    }
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
  suggestions = undefined;
  iconCache.clear();
  resetIcons();
  clearView();
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
