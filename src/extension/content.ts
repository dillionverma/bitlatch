import sharedTheme from '../shared/theme.css';
import type {
  BrowserMatches,
  CaptureOffer,
  FillCredential,
  Result,
  VaultStatus,
} from '../shared/types';

(() => {
  if (!['https:', 'http:'].includes(location.protocol)) return;
  // Mirrors the Mac app's rule for plain HTTP: loopback and the local network,
  // where a certificate is not possible. The app re-checks before releasing
  // anything, so this only decides whether to put UI on the page.
  if (location.protocol === 'http:' && !isLocalHost(location.hostname)) return;

  function isLocalHost(hostname: string) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
    if (host.endsWith('.local')) return true;
    const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!parts || parts.slice(1).some((part) => Number(part) > 255)) return false;
    const [first, second] = [Number(parts[1]), Number(parts[2])];
    return (
      first === 127 ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
  if (window !== window.top) {
    try {
      if (window.top?.location.origin !== location.origin) return;
    } catch {
      return;
    }
  }

  const host = document.createElement('div');
  host.setAttribute('data-latch', '');
  host.style.cssText =
    'all:initial!important;position:fixed!important;top:0!important;left:0!important;z-index:2147483647!important;width:0!important;height:0!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent =
    sharedTheme +
    `
    *{box-sizing:border-box}
    :host{font:13px/18px var(--font-ui);color:var(--foreground);text-align:left}
    button{font:inherit;cursor:pointer;color:inherit}
    button:disabled,button[aria-disabled="true"]{cursor:default;opacity:.6}
    button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
    .trigger{position:fixed;display:none;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--input);background:var(--popover);color:var(--primary);border-radius:var(--radius-control);pointer-events:auto;padding:0}
    .trigger:hover,.action:hover,.save-actions button:hover{background:var(--accent)}
    svg{width:20px;height:20px;flex:none}
    .panel,.save{position:fixed;display:none;width:300px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-overlay);box-shadow:0 8px 28px #0003;pointer-events:auto;font:13px/18px var(--font-ui)}
    .panel{padding:4px;flex-direction:column;max-height:400px;overflow:auto;overscroll-behavior:contain}
    .brand{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;color:var(--muted-foreground);font-size:12px;line-height:16px;flex:none}
    .brand-name{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--foreground)}
    .brand svg{color:var(--primary)}
    .results{min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px;flex:1 1 auto}
    .row{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:var(--radius-control);text-align:left;padding:6px 8px;background:transparent;min-height:48px}
    .row:hover{background:var(--accent)}.row:active{background:var(--selection)}
    .row:focus-visible{background:var(--accent);outline-offset:-2px}
    .initial{display:grid;place-items:center;flex:none;background:var(--muted);width:28px;height:28px;border-radius:var(--radius-control);color:var(--primary);font-weight:600}
    .text{flex:1;min-width:0}.name,.sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-size:13px;font-weight:500;line-height:18px}.sub{font-size:12px;line-height:16px;color:var(--muted-foreground)}
    .hint{font-size:12px;line-height:16px;color:var(--muted-foreground);padding:12px;overflow-wrap:anywhere}
    .foot{border-top:1px solid var(--border);padding:4px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;color:var(--muted-foreground);font-size:12px;line-height:16px}
    .origin{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .action{font-size:12px;background:transparent;border:0;border-radius:var(--radius-control);padding:4px 8px;min-height:28px;flex:none}
    .error{color:var(--destructive);background:var(--destructive-surface);border-radius:var(--radius-control);font-size:12px;line-height:16px;white-space:normal;overflow-wrap:anywhere;padding:8px;margin:4px;flex:none}
    .save{padding:12px;overflow:auto;overscroll-behavior:contain}
    .save .brand{padding:0 0 8px}.save-title{font-size:13px;line-height:18px;font-weight:600;margin:0 0 4px}.save-sub{font-size:12px;line-height:16px;color:var(--muted-foreground);overflow-wrap:anywhere}
    .save-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}
    .save-actions button{border-radius:var(--radius-control);padding:6px 12px;min-height:32px;border:1px solid var(--input);background:var(--secondary)}
    .save-actions .go{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}.save-actions .go:hover{background:var(--primary-hover)}
    @media(prefers-contrast:more){.panel,.save{border-color:var(--input)}}
    @media(forced-colors:active){.row:focus-visible,button:focus-visible{outline-color:Highlight}}
  `;
  const trigger = document.createElement('button');
  trigger.className = 'trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Fill with Latch');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'latch-logins');
  trigger.append(mark());
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = 'latch-logins';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Latch logins');
  const savePanel = document.createElement('div');
  savePanel.className = 'save';
  savePanel.tabIndex = -1;
  savePanel.setAttribute('role', 'dialog');
  savePanel.setAttribute('aria-label', 'Save this login to Latch');
  shadow.append(style, trigger, panel, savePanel);
  document.documentElement.append(host);

  let active: HTMLInputElement | null = null;
  let open = false;
  let requestVersion = 0;
  let scanScheduled = false;
  let autoFilled = false;
  let suppressNextFocus = false;
  let saveVersion = 0;
  let lifecycleVersion = 0;
  let filling = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let statusPending = false;
  let displayedOffer: CaptureOffer | undefined;

  function mark() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ['M6 10V7a6 6 0 0 1 12 0v2M5 10h14v11H5z', 'M12 14v3']) {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.65');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }
    return svg;
  }

  function brand(label: string) {
    const header = element('div', 'brand');
    const name = element('span', 'brand-name');
    name.append(mark(), element('span', '', 'Latch'));
    header.append(name, element('span', 'origin', label));
    return header;
  }

  // The native host is request/response only. Watch status only while UI is
  // visible; never poll for geometry or read secrets to determine lock state.
  function watchStatus() {
    if (
      statusTimer ||
      statusPending ||
      document.hidden ||
      (panel.dataset.state !== 'unlocked' && !savePanel.childElementCount)
    )
      return;
    statusTimer = setTimeout(() => {
      statusTimer = undefined;
      void checkStatus();
    }, 1000);
  }

  async function checkStatus() {
    if (statusPending) return;
    statusPending = true;
    const version = lifecycleVersion;
    const state = await send<VaultStatus>({ type: 'status' });
    statusPending = false;
    if (version !== lifecycleVersion) return watchStatus();
    if (!state.ok || state.value !== 'unlocked') return invalidateUI();
    // Also drop expired/consumed offers, including a lock/unlock between polls.
    if (savePanel.dataset.offer === 'pending') {
      const save = saveVersion;
      const offer = await send<CaptureOffer>({ type: 'pendingCapture' });
      if (
        save === saveVersion &&
        savePanel.dataset.offer === 'pending' &&
        (!offer.ok ||
          offer.value.action === 'none' ||
          offer.value.action !== displayedOffer?.action ||
          offer.value.name !== displayedOffer?.name)
      ) {
        const restoreFocus = savePanel.contains(shadow.activeElement);
        hideSave();
        if (restoreFocus) focusField();
      }
    }
    watchStatus();
  }

  function invalidateUI() {
    lifecycleVersion++;
    const returnToField =
      panel.contains(shadow.activeElement) || savePanel.contains(shadow.activeElement);
    close();
    hideSave();
    if (returnToField) focusField();
  }

  function focusField() {
    if (!active?.isConnected) return;
    suppressNextFocus = document.activeElement !== active;
    active.focus({ preventScroll: true });
  }

  function visible(input: HTMLInputElement) {
    const rect = input.getBoundingClientRect();
    const styles = getComputedStyle(input);
    return (
      rect.width >= 50 &&
      rect.height >= 15 &&
      styles.visibility !== 'hidden' &&
      styles.display !== 'none' &&
      Number(styles.opacity) !== 0 &&
      !input.disabled &&
      !input.readOnly
    );
  }

  function isLoginInput(target: unknown): target is HTMLInputElement {
    if (!(target instanceof HTMLInputElement) || !visible(target)) return false;
    if (target.autocomplete === 'new-password') return false;
    if (target.type === 'password') return true;
    if (target.autocomplete.includes('username') || target.autocomplete.includes('email'))
      return true;
    return (
      ['email', 'text', 'tel'].includes(target.type) &&
      Boolean(target.form?.querySelector('input[type="password"]'))
    );
  }

  function viewport() {
    const view = window.visualViewport;
    return {
      left: view?.offsetLeft ?? 0,
      top: view?.offsetTop ?? 0,
      width: view?.width ?? innerWidth,
      height: view?.height ?? innerHeight,
    };
  }

  function position() {
    const previousWidth = panel.offsetWidth;
    const previousHeight = panel.offsetHeight;
    const view = viewport();
    const left = view.left + 8;
    const top = view.top + 8;
    const right = view.left + view.width - 8;
    const bottom = view.top + view.height - 8;
    const width = Math.max(0, Math.min(300, view.width - 16));
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    savePanel.style.width = `${width}px`;
    savePanel.style.maxHeight = `${Math.max(0, view.height - 16)}px`;
    savePanel.style.left = `${Math.max(left, right - width)}px`;
    savePanel.style.top = `${Math.max(top, bottom - savePanel.offsetHeight)}px`;
    if (!active?.isConnected || !visible(active)) {
      trigger.style.display = 'none';
      close();
      return;
    }
    const box = active.getBoundingClientRect();
    if (box.bottom < top || box.top > bottom || box.right < left || box.left > right) {
      trigger.style.display = 'none';
      close();
      return;
    }
    const triggerSize = Math.min(28, box.height);
    trigger.style.width = trigger.style.height = `${triggerSize}px`;
    trigger.style.display = 'flex';
    trigger.style.left = `${clamp(box.right - triggerSize - 4, left, right - triggerSize)}px`;
    trigger.style.top = `${clamp(box.top + (box.height - triggerSize) / 2, top, bottom - triggerSize)}px`;
    panel.style.width = `${width}px`;
    panel.style.left = `${clamp(box.left, left, right - width)}px`;
    panel.style.maxHeight = `${Math.max(0, Math.min(400, view.height - 16))}px`;
    const desired = panel.offsetHeight;
    const below = Math.max(0, bottom - box.bottom - 6);
    const above = Math.max(0, box.top - top - 6);
    const flip = below < desired && above > below;
    const available = flip ? above : below;
    panel.style.maxHeight = `${Math.min(400, available)}px`;
    panel.style.top = `${clamp(flip ? box.top - panel.offsetHeight - 6 : box.bottom + 6, top, bottom - panel.offsetHeight)}px`;
    // Resizing or zooming can shrink the scroll area around the focused row.
    // Scroll only our results, never the surrounding page.
    const focused = shadow.activeElement;
    const results = panel.querySelector<HTMLElement>('.results');
    if (
      (panel.offsetWidth !== previousWidth || panel.offsetHeight !== previousHeight) &&
      focused instanceof HTMLElement &&
      focused.matches('.row') &&
      results?.clientHeight
    ) {
      const row = focused.getBoundingClientRect();
      const region = results.getBoundingClientRect();
      if (row.top < region.top) results.scrollTop -= region.top - row.top;
      else if (row.bottom > region.bottom) results.scrollTop += row.bottom - region.bottom;
    }
  }

  function close() {
    open = false;
    requestVersion++;
    filling = false;
    panel.removeAttribute('aria-busy');
    delete panel.dataset.state;
    panel.style.display = 'none';
    panel.replaceChildren();
    trigger.setAttribute('aria-expanded', 'false');
  }

  async function send<T>(message: unknown): Promise<Result<T>> {
    try {
      return (await chrome.runtime.sendMessage(message)) as Result<T>;
    } catch {
      return { ok: false, error: 'Reload this page to reconnect Latch.' };
    }
  }

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function show() {
    if (!active || filling) return;
    const restoreFocus = panel.contains(shadow.activeElement);
    const version = ++requestVersion;
    open = true;
    trigger.setAttribute('aria-expanded', 'true');
    panel.replaceChildren(element('div', 'hint', 'Connecting to Latch…'));
    panel.style.display = 'flex';
    watchStatus();
    position();
    const response = await send<BrowserMatches>({ type: 'matches' });
    if (version !== requestVersion || !open) return;
    // A failed or locked match response is also a verified invalidation signal.
    // Do not leave an earlier save offer actionable until the next status poll.
    if (!response.ok || response.value.state !== 'unlocked') {
      invalidateUI();
      open = true;
      trigger.setAttribute('aria-expanded', 'true');
      panel.style.display = 'flex';
    }
    panel.replaceChildren();
    panel.dataset.state = response.ok ? response.value.state : 'disconnected';
    watchStatus();
    panel.append(brand('Your logins'));
    const results = element('div', 'results');
    panel.append(results);
    if (!response.ok || response.value.state !== 'unlocked') {
      const row = element('button', 'row');
      row.type = 'button';
      row.append(
        mark(),
        element(
          'span',
          'text',
          !response.ok
            ? 'Open Latch on your Mac'
            : response.value.state === 'signed-out'
              ? 'Sign in to Latch to fill'
              : 'Unlock Latch to fill',
        ),
      );
      row.addEventListener('click', (event) => {
        if (event.isTrusted) void send({ type: 'open' });
      });
      results.append(row, element('div', 'hint', 'Opens the Mac app'));
      if (!response.ok) panel.append(element('div', 'hint', response.error));
    } else if (!response.value.items.length) {
      results.append(element('div', 'hint', 'No logins for this website.'));
    } else {
      for (const item of response.value.items) {
        const row = element('button', 'row');
        row.type = 'button';
        row.dataset.loginId = item.id;
        row.setAttribute('aria-label', `Fill ${item.name}, ${item.username}`);
        const text = element('span', 'text');
        text.append(
          element('span', 'name', item.name),
          element('span', 'sub', item.username || 'No username'),
        );
        row.append(
          element('span', 'initial', item.name.slice(0, 1).toUpperCase()),
          text,
          element('span', 'sub', '↵'),
        );
        row.addEventListener('click', (event) => {
          if (event.isTrusted) void fill(item.id);
        });
        results.append(row);
      }
    }
    const foot = element('div', 'foot');
    const origin = element('span', 'origin', location.host);
    origin.title = location.origin;
    foot.append(origin);
    const refresh = element('button', 'action', 'Refresh');
    refresh.type = 'button';
    refresh.addEventListener('click', (event) => {
      if (event.isTrusted) void show();
    });
    foot.append(refresh);
    panel.append(foot);
    position();
    if (restoreFocus && open) {
      (panel.querySelector<HTMLButtonElement>('.row') ?? refresh).focus({ preventScroll: true });
    }
  }

  function setValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fill(id: string) {
    const field = active;
    if (!field?.isConnected) return;
    if (filling) return;
    filling = true;
    const version = requestVersion;
    const lifetime = lifecycleVersion;
    panel.setAttribute('aria-busy', 'true');
    panel.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.setAttribute('aria-disabled', 'true');
    });
    const progress = element('div', 'hint', 'Filling…');
    progress.setAttribute('role', 'status');
    panel.append(progress);
    const page = location.href;
    const response = await send<FillCredential>({ type: 'fill', id });
    if (version !== requestVersion || lifetime !== lifecycleVersion) {
      if (response.ok) response.value.password = '';
      return;
    }
    filling = false;
    panel.removeAttribute('aria-busy');
    progress.remove();
    panel.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.removeAttribute('aria-disabled');
    });
    if (!response.ok) {
      showFillError(response.error);
      position();
      return;
    }
    if (!field.isConnected || !visible(field) || location.href !== page) {
      response.value.password = '';
      return;
    }
    const scope: ParentNode = field.form ?? document;
    const passwords = Array.from(
      scope.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ).filter(visible);
    if (passwords.some((input) => input.autocomplete === 'new-password') || passwords.length > 1) {
      response.value.password = '';
      showFillError('This looks like a signup or password-change form. Copy from Latch instead.');
      return;
    }
    const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).filter(
      (input) => visible(input) && ['text', 'email', 'tel'].includes(input.type),
    );
    const username =
      field.type !== 'password'
        ? field
        : (candidates.find((input) => /username|email/.test(input.autocomplete)) ??
          candidates
            .filter(
              (input) =>
                passwords[0] &&
                Boolean(
                  input.compareDocumentPosition(passwords[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
                ),
            )
            .at(-1));
    if (username && response.value.username) setValue(username, response.value.username);
    if (passwords[0]) setValue(passwords[0], response.value.password);
    response.value.password = '';
    close();
    suppressNextFocus = document.activeElement !== (passwords[0] ?? username ?? field);
    (passwords[0] ?? username ?? field).focus();
  }

  function showFillError(message: string) {
    panel.querySelector('.error')?.remove();
    const error = element('div', 'error', message);
    error.setAttribute('role', 'alert');
    panel.append(error);
    position();
  }

  async function maybeAutoFill() {
    if (autoFilled || !active || window !== window.top || document.visibilityState !== 'visible')
      return;
    const lifetime = lifecycleVersion;
    const settings = await chrome.storage.local.get('autoFillOrigins');
    if (
      !Array.isArray(settings.autoFillOrigins) ||
      !settings.autoFillOrigins.includes(location.origin)
    )
      return;
    const matches = await send<BrowserMatches>({ type: 'matches' });
    if (
      lifetime !== lifecycleVersion ||
      !matches.ok ||
      matches.value.state !== 'unlocked' ||
      matches.value.items.length !== 1
    )
      return;
    if (
      active.value ||
      active.form?.querySelector<HTMLInputElement>('input[type="password"]')?.value
    )
      return;
    autoFilled = true;
    await fill(matches.value.items[0]!.id);
  }

  /** The credentials a submitted form is carrying, if it looks like a sign-in. */
  function readForm(form: HTMLFormElement) {
    const passwords = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="password"]'))
      .filter((input) => input.value)
      // A change-password form ends with the new one, which is what to keep.
      .slice(-1);
    const password = passwords[0]?.value ?? '';
    if (!password) return undefined;
    const texts = Array.from(form.querySelectorAll<HTMLInputElement>('input')).filter(
      (input) => ['text', 'email', 'tel'].includes(input.type) && input.value,
    );
    const username =
      texts.find((input) => /username|email/.test(input.autocomplete))?.value ??
      texts
        .filter(
          (input) =>
            passwords[0] &&
            Boolean(input.compareDocumentPosition(passwords[0]) & Node.DOCUMENT_POSITION_FOLLOWING),
        )
        .at(-1)?.value ??
      texts.at(-1)?.value ??
      '';
    return { username, password };
  }

  function hideSave() {
    saveVersion++;
    displayedOffer = undefined;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    savePanel.style.display = 'none';
    savePanel.replaceChildren();
    savePanel.removeAttribute('aria-busy');
    delete savePanel.dataset.offer;
  }

  function showSave(offer: CaptureOffer) {
    hideSave();
    if (offer.action === 'none' || document.hidden) return;
    displayedOffer = offer;
    const version = saveVersion;
    savePanel.dataset.offer = 'pending';
    const update = offer.action === 'update';
    savePanel.setAttribute(
      'aria-label',
      update ? 'Update this password in Latch' : 'Save this login to Latch',
    );
    const title = element(
      'div',
      'save-title',
      update ? 'Update this password in Latch?' : 'Save this login to Latch?',
    );
    const sub = element(
      'div',
      'save-sub',
      update ? `Update ${offer.name ?? location.hostname}` : (offer.name ?? location.hostname),
    );
    const feedback = element('div', 'save-sub');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const actions = element('div', 'save-actions');
    const no = element('button', '', 'Not now');
    no.type = 'button';
    no.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      hideSave();
      focusField();
      void send({ type: 'dismissCapture' });
    });
    const yes = element('button', 'go', update ? 'Update' : 'Save');
    yes.type = 'button';
    yes.addEventListener('click', (event) => {
      if (!event.isTrusted || yes.disabled) return;
      savePanel.dataset.offer = 'committing';
      // Keep focus in this task while its buttons are disabled. If the user
      // moves elsewhere during the write, completion must not take it back.
      savePanel.focus({ preventScroll: true });
      yes.disabled = true;
      no.disabled = true;
      savePanel.setAttribute('aria-busy', 'true');
      feedback.className = 'save-sub';
      feedback.setAttribute('role', 'status');
      feedback.textContent = update ? 'Updating…' : 'Saving…';
      void (async () => {
        const result = await send<CaptureOffer>({ type: 'commitCapture' });
        if (version !== saveVersion) return;
        // Do not restore pre-lock success/error UI after a pending write settles.
        const state = await send<VaultStatus>({ type: 'status' });
        if (version !== saveVersion) return;
        if (!state.ok || state.value !== 'unlocked') return invalidateUI();
        const restoreFocus = savePanel.contains(shadow.activeElement);
        savePanel.removeAttribute('aria-busy');
        if (!result.ok) {
          savePanel.dataset.offer = 'error';
          no.disabled = false;
          no.textContent = 'Dismiss';
          // Commit consumes the pending capture before the write. Do not offer
          // a retry that could save a newer capture from another submission.
          yes.remove();
          feedback.className = 'error';
          feedback.setAttribute('role', 'alert');
          feedback.textContent = result.error;
          position();
          if (restoreFocus) no.focus({ preventScroll: true });
          return;
        }
        title.textContent = update ? 'Password updated.' : 'Saved to Latch.';
        savePanel.dataset.offer = 'success';
        sub.remove();
        feedback.textContent = 'Done.';
        actions.remove();
        if (restoreFocus) focusField();
        position();
        saveTimer = setTimeout(() => {
          if (version === saveVersion) hideSave();
        }, 1800);
      })();
    });
    actions.append(no, yes);
    savePanel.replaceChildren(brand(location.host), title, sub, feedback, actions);
    savePanel.style.display = 'block';
    position();
    watchStatus();
  }

  async function displayOffer(response: Result<CaptureOffer>, version: number, lifetime: number) {
    if (version !== saveVersion || lifetime !== lifecycleVersion || document.hidden) return;
    if (!response.ok || response.value.action === 'none') return hideSave();
    const state = await send<VaultStatus>({ type: 'status' });
    if (version !== saveVersion || lifetime !== lifecycleVersion || document.hidden) return;
    if (!state.ok || state.value !== 'unlocked') return invalidateUI();
    showSave(response.value);
  }

  async function captureSubmit(form: HTMLFormElement) {
    const credentials = readForm(form);
    if (!credentials) return;
    hideSave();
    const version = saveVersion;
    const lifetime = lifecycleVersion;
    const response = send<CaptureOffer>({ type: 'capture', ...credentials });
    credentials.password = '';
    await displayOffer(await response, version, lifetime);
  }

  async function resumeSave() {
    const version = saveVersion;
    const lifetime = lifecycleVersion;
    await displayOffer(await send<CaptureOffer>({ type: 'pendingCapture' }), version, lifetime);
  }

  function scan() {
    scanScheduled = false;
    if (!host.isConnected) document.documentElement.append(host);
    if (active?.isConnected && visible(active)) {
      position();
      return;
    }
    active =
      Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
        (input) => isLoginInput(input) && input.type === 'password',
      ) ??
      Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(isLoginInput) ??
      null;
    if (active) {
      position();
      void maybeAutoFill();
    }
  }

  document.addEventListener(
    'submit',
    (event) => {
      if (event.isTrusted && event.target instanceof HTMLFormElement)
        void captureSubmit(event.target);
    },
    true,
  );
  document.addEventListener('focusin', (event) => {
    if (suppressNextFocus) {
      suppressNextFocus = false;
      return;
    }
    if (isLoginInput(event.target)) {
      if (active !== event.target) close();
      active = event.target;
      position();
      if (event.isTrusted) void show();
    }
  });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.composedPath().includes(host) && event.target !== active) close();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!open || !event.isTrusted) return;
      if (event.key === 'Escape') {
        if (event.composedPath().includes(host)) return;
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'ArrowDown' && event.target === active && !filling) {
        event.preventDefault();
        panel.querySelector<HTMLButtonElement>('.row')?.focus();
      }
      if (event.key === 'Enter' && event.target === active) {
        const first = panel.querySelector<HTMLButtonElement>('.row');
        if (!active?.value && first?.dataset.loginId) {
          event.preventDefault();
          void fill(first.dataset.loginId);
        } else close();
      }
    },
    true,
  );
  shadow.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || !event.isTrusted) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (savePanel.contains(shadow.activeElement)) {
        hideSave();
        void send({ type: 'dismissCapture' });
      } else close();
      focusField();
      return;
    }
    if (filling || (!panel.contains(shadow.activeElement) && shadow.activeElement !== trigger))
      return;
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('.row:not(:disabled)')];
    if (!rows.length) return;
    const index = rows.indexOf(shadow.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rows.length - 1
            : index < 0
              ? event.key === 'ArrowDown'
                ? 0
                : rows.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows[next]?.focus({ preventScroll: true });
      rows[next]?.scrollIntoView({ block: 'nearest' });
    }
  });
  shadow.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (!shadow.activeElement && document.activeElement !== active) close();
    });
  });
  trigger.addEventListener('click', (event) => {
    if (event.isTrusted) {
      if (open) close();
      else void show();
    }
  });
  addEventListener('resize', position, { passive: true });
  addEventListener('scroll', position, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', position, { passive: true });
  window.visualViewport?.addEventListener('scroll', position, { passive: true });
  addEventListener('focus', () => {
    if (open) void show();
    void resumeSave();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) invalidateUI();
    else void resumeSave();
  });
  new MutationObserver((mutations) => {
    if (
      scanScheduled ||
      !mutations.some((mutation) => !host.contains(mutation.target) && mutation.target !== host)
    )
      return;
    scanScheduled = true;
    setTimeout(scan, 160);
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
  // A sign-in that navigated away leaves its offer waiting on the Mac app.
  void resumeSave();
})();
