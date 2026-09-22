import type { BrowserMatches, CaptureOffer, FillCredential, Result } from '../shared/types';

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
  style.textContent = `
    *{box-sizing:border-box} :host{color-scheme:light dark} button{font:13px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}
    .trigger{position:fixed;display:none;align-items:center;justify-content:center;width:25px;height:25px;border:1px solid #7773;background:#faf9f6;color:#373b34;border-radius:7px;pointer-events:auto;box-shadow:0 1px 4px #0001;padding:0}
    .trigger:hover{background:#e9efdf}.trigger svg{width:15px;height:15px}
    .panel{position:fixed;display:none;width:288px;padding:5px;background:#fcfbf9;color:#272a24;border:1px solid #0002;border-radius:11px;box-shadow:0 8px 32px #0002;pointer-events:auto;font:12px -apple-system,BlinkMacSystemFont,sans-serif}
    .brand{display:flex;align-items:center;justify-content:space-between;padding:7px 8px 8px;color:#767a70;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .row{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:6px;text-align:left;padding:10px 8px;background:transparent;color:inherit;min-height:44px}
    .row:hover,.row:focus-visible{background:#e9efdf;outline:none}.initial{display:grid;place-items:center;background:#7c905b18;border:1px solid #7c905b28;width:28px;height:28px;border-radius:7px;color:#61713e;font-weight:600}.text{flex:1;min-width:0}.name,.sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-size:12px;font-weight:550}.sub{font-size:11px;color:#7d8078;margin-top:3px}.hint{font-size:11px;color:#8b9083;padding:8px}.foot{border-top:1px solid #0001;margin:4px -5px -5px;padding:7px 13px;color:#868b7d;font-size:10px;display:flex;justify-content:space-between}.action{font-size:11px;color:inherit;background:none;border:0;padding:0}.error{color:#a75340;white-space:normal;padding:9px;line-height:1.4}
    .save{position:fixed;right:16px;bottom:16px;display:none;width:300px;padding:13px 14px;background:#fcfbf9;color:#272a24;border:1px solid #0002;border-radius:11px;box-shadow:0 10px 34px #0003;pointer-events:auto;font:12px -apple-system,BlinkMacSystemFont,sans-serif}
    .save-title{font-size:12.5px;font-weight:600;margin:7px 0 3px}.save-sub{font-size:11px;color:#7d8078;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .save-actions{display:flex;gap:7px;justify-content:flex-end;margin-top:12px}
    .save-actions button{border-radius:7px;padding:7px 13px;font-size:11.5px;font-weight:550;border:1px solid #0002;background:#f2f1ec;color:#272a24}
    .save-actions .go{background:#7c905b;border-color:transparent;color:#fff}
    @media(prefers-color-scheme:dark){.save{background:#252622;color:#e7e8e1;border-color:#ffffff20}.save-sub{color:#92988a}.save-actions button{background:#33352f;border-color:#ffffff20;color:#e7e8e1}.save-actions .go{background:#8ea468;color:#1b1c19;border-color:transparent}}
    @media(prefers-color-scheme:dark){.trigger{background:#292b27;color:#d2dac7;border-color:#ffffff25}.trigger:hover{background:#3c4234}.panel{background:#252622;color:#e7e8e1;border-color:#ffffff20;box-shadow:0 8px 32px #0005}.row:hover,.row:focus-visible{background:#343a2c}.sub,.hint{color:#92988a}.initial{color:#b5c894}.foot{border-color:#ffffff15}}
  `;
  const trigger = document.createElement('button');
  trigger.className = 'trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Fill with Latch');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML =
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 9V6a5 5 0 0 1 10 0v2M4 9h12v8H4z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Latch logins');
  const savePanel = document.createElement('div');
  savePanel.className = 'save';
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

  function position() {
    if (!active?.isConnected || !visible(active)) {
      trigger.style.display = 'none';
      close();
      return;
    }
    const box = active.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) {
      trigger.style.display = 'none';
      close();
      return;
    }
    trigger.style.display = 'flex';
    trigger.style.left = `${Math.min(innerWidth - 32, box.right - 32)}px`;
    trigger.style.top = `${box.top + (box.height - 25) / 2}px`;
    panel.style.left = `${Math.max(8, Math.min(box.left, innerWidth - 304))}px`;
    const panelHeight = panel.offsetHeight || 160;
    panel.style.top = `${box.bottom + panelHeight + 10 < innerHeight ? box.bottom + 6 : Math.max(8, box.top - panelHeight - 6)}px`;
  }

  function close() {
    open = false;
    requestVersion++;
    panel.style.display = 'none';
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
    if (!active) return;
    const version = ++requestVersion;
    open = true;
    trigger.setAttribute('aria-expanded', 'true');
    panel.replaceChildren(element('div', 'hint', 'Connecting to Latch…'));
    panel.style.display = 'block';
    position();
    const response = await send<BrowserMatches>({ type: 'matches' });
    if (version !== requestVersion || !open) return;
    panel.replaceChildren();
    const brand = element('div', 'brand');
    brand.append(element('span', '', 'Latch'), element('span', '', 'Your logins'));
    panel.append(brand);
    if (!response.ok || response.value.state !== 'unlocked') {
      const row = element('button', 'row');
      row.type = 'button';
      row.append(
        element('span', 'initial', '↗'),
        element('span', 'text', response.ok ? 'Unlock Latch to fill' : 'Open Latch on your Mac'),
      );
      row.addEventListener('click', (event) => {
        if (event.isTrusted) void send({ type: 'open' });
      });
      panel.append(row);
      if (!response.ok) panel.append(element('div', 'hint', response.error));
    } else if (!response.value.items.length) {
      panel.append(element('div', 'hint', 'No logins for this website.'));
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
        panel.append(row);
      }
    }
    const foot = element('div', 'foot');
    foot.append(element('span', '', location.hostname));
    const refresh = element('button', 'action', 'Refresh');
    refresh.type = 'button';
    refresh.addEventListener('click', (event) => {
      if (event.isTrusted) void show();
    });
    foot.append(refresh);
    panel.append(foot);
    position();
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
    const page = location.href;
    const response = await send<FillCredential>({ type: 'fill', id });
    if (!response.ok) {
      panel.append(element('div', 'error', response.error));
      position();
      return;
    }
    if (!field.isConnected || !visible(field) || location.href !== page) return;
    const scope: ParentNode = field.form ?? document;
    const passwords = Array.from(
      scope.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ).filter(visible);
    if (passwords.some((input) => input.autocomplete === 'new-password') || passwords.length > 1) {
      panel.append(
        element(
          'div',
          'error',
          'This looks like a signup or password-change form. Copy from Latch instead.',
        ),
      );
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

  async function maybeAutoFill() {
    if (autoFilled || !active || window !== window.top || document.visibilityState !== 'visible')
      return;
    const settings = await chrome.storage.local.get('autoFillOrigins');
    if (
      !Array.isArray(settings.autoFillOrigins) ||
      !settings.autoFillOrigins.includes(location.origin)
    )
      return;
    const matches = await send<BrowserMatches>({ type: 'matches' });
    if (!matches.ok || matches.value.state !== 'unlocked' || matches.value.items.length !== 1)
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
    savePanel.style.display = 'none';
    savePanel.replaceChildren();
  }

  function showSave(offer: CaptureOffer) {
    if (offer.action === 'none') return hideSave();
    const update = offer.action === 'update';
    const title = element(
      'div',
      'save-title',
      update ? 'Update this password in Latch?' : 'Save this login to Latch?',
    );
    const sub = element(
      'div',
      'save-sub',
      update
        ? `${offer.name ?? location.hostname} already exists`
        : (offer.name ?? location.hostname),
    );
    const brand = element('div', 'brand');
    brand.append(element('span', '', 'Latch'), element('span', '', location.hostname));
    const actions = element('div', 'save-actions');
    const no = element('button', '', 'Not now');
    no.type = 'button';
    no.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      hideSave();
      void send({ type: 'dismissCapture' });
    });
    const yes = element('button', 'go', update ? 'Update' : 'Save');
    yes.type = 'button';
    yes.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      yes.disabled = true;
      yes.textContent = 'Saving…';
      void (async () => {
        const result = await send<CaptureOffer>({ type: 'commitCapture' });
        if (!result.ok) {
          yes.disabled = false;
          yes.textContent = update ? 'Update' : 'Save';
          sub.textContent = result.error;
          return;
        }
        title.textContent = update ? 'Password updated.' : 'Saved to Latch.';
        sub.textContent = offer.name ?? location.hostname;
        actions.remove();
        setTimeout(hideSave, 1_800);
      })();
    });
    actions.append(no, yes);
    savePanel.replaceChildren(brand, title, sub, actions);
    savePanel.style.display = 'block';
  }

  async function captureSubmit(form: HTMLFormElement) {
    const credentials = readForm(form);
    if (!credentials) return;
    const offer = await send<CaptureOffer>({ type: 'capture', ...credentials });
    // The page usually navigates away here; the prompt is picked up on load.
    if (offer.ok) showSave(offer.value);
  }

  async function resumeSave() {
    const offer = await send<CaptureOffer>({ type: 'pendingCapture' });
    if (offer.ok) showSave(offer.value);
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
        close();
        return;
      }
      if (event.key === 'ArrowDown' && event.target === active) {
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
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      close();
      active?.focus();
    }
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('.row')];
    const index = rows.indexOf(shadow.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
    }
  });
  trigger.addEventListener('click', (event) => {
    if (event.isTrusted) {
      if (open) close();
      else void show();
    }
  });
  addEventListener('resize', position, { passive: true });
  addEventListener('scroll', position, { passive: true, capture: true });
  addEventListener('focus', () => {
    if (open) void show();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) close();
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
