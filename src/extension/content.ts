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
    'all:initial!important;position:fixed!important;top:0!important;left:0!important;z-index:2147483647!important;width:0!important;height:0!important;pointer-events:none!important;color-scheme:light dark!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent =
    sharedTheme +
    `
    *{box-sizing:border-box}
    :host{font:13px/18px var(--font-ui);color:var(--foreground);text-align:left;-webkit-font-smoothing:antialiased}
    button{font:inherit;cursor:default;color:inherit;-webkit-appearance:none;appearance:none;margin:0}
    button:disabled,button[aria-disabled="true"]{cursor:default;opacity:.5}
    button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
    svg{flex:none}
    .trigger{position:fixed;display:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:var(--card);color:var(--primary);box-shadow:0 0 0 1px var(--border),0 1px 2px light-dark(rgb(0 0 0/6%),rgb(0 0 0/30%));pointer-events:auto}
    .trigger svg{width:18px;height:18px}
    .trigger:hover{background:var(--accent)}.trigger:active{background:var(--selection)}
    .panel,.save{position:fixed;display:none;width:300px;color:var(--popover-foreground);background:color-mix(in srgb,var(--popover) 94%,transparent);-webkit-backdrop-filter:blur(24px) saturate(1.4);backdrop-filter:blur(24px) saturate(1.4);border:1px solid var(--border);border-radius:var(--radius-overlay);box-shadow:0 0 0 .5px light-dark(rgb(0 0 0/10%),rgb(0 0 0/70%)),0 12px 32px light-dark(rgb(0 0 0/16%),rgb(0 0 0/55%)),0 2px 6px light-dark(rgb(0 0 0/6%),rgb(0 0 0/30%)),inset 0 0 0 1px light-dark(transparent,rgb(255 255 255/4%));pointer-events:auto;font:13px/18px var(--font-ui)}
    .panel{flex-direction:column;max-height:400px;overflow:auto;overscroll-behavior:contain}
    .brand{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px 3px;flex:none;color:var(--muted-foreground);font-size:11px;line-height:15px;font-weight:500}
    .brand-name{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;font-weight:600;color:var(--foreground)}
    .brand svg{width:14px;height:14px;color:var(--primary)}
    .results{min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px;flex:1 1 auto}
    .row{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:6px;text-align:left;padding:5px 8px;background:transparent;min-height:44px;color:var(--foreground)}
    .row:hover{background:var(--accent)}.row:active{background:var(--selection)}
    .row:focus-visible{background:var(--selection);outline:0;box-shadow:inset 0 0 0 1px var(--ring)}
    .row>svg{width:18px;height:18px;color:var(--muted-foreground)}
    .initial{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:7px;background:var(--card);color:var(--foreground);font-size:14px;font-weight:500;box-shadow:inset 0 0 0 1px var(--border);overflow:hidden}
    .initial img{width:24px;height:24px;object-fit:contain;border-radius:4px;display:block}
    .text{flex:1;min-width:0}.name,.sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-size:13px;font-weight:500;line-height:18px}.sub{font-size:12px;line-height:16px;color:var(--muted-foreground)}
    .key{flex:none;min-width:20px;padding:0 5px;border-radius:4px;background:var(--secondary);box-shadow:inset 0 0 0 1px var(--border);color:var(--muted-foreground);font-size:11px;line-height:17px;text-align:center}
    .hint{font-size:12px;line-height:16px;color:var(--muted-foreground);padding:10px 12px;overflow-wrap:anywhere}
    .foot{border-top:1px solid var(--border);padding:5px 6px 5px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;color:var(--muted-foreground);font-size:12px;line-height:16px}
    .origin{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .action{font-size:12px;font-weight:500;color:var(--foreground);background:transparent;border:0;border-radius:6px;padding:4px 8px;min-height:26px;flex:none}
    .action:hover{background:var(--accent)}.action:active{background:var(--selection)}
    .error{color:var(--destructive);background:var(--destructive-surface);border-radius:6px;font-size:12px;line-height:16px;white-space:normal;overflow-wrap:anywhere;padding:8px 10px;margin:4px 8px 8px;flex:none}
    .save{padding:12px;overflow:auto;overscroll-behavior:contain}
    .save .brand{padding:0 0 10px}.save-title{font-size:13px;line-height:18px;font-weight:600;margin:0 0 2px}.save-sub{font-size:12px;line-height:16px;color:var(--muted-foreground);overflow-wrap:anywhere}
    .save .error{margin:8px 0 0}
    .save-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}
    .save-actions button{border-radius:6px;padding:4px 12px;min-height:28px;font-weight:500;border:1px solid var(--border);background:var(--card);box-shadow:0 1px 1px light-dark(rgb(0 0 0/4%),rgb(0 0 0/20%))}
    .save-actions button:hover{background:var(--accent)}
    .save-actions .go{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}.save-actions .go:hover{background:var(--primary-hover)}
    @media(prefers-reduced-transparency:reduce),(prefers-contrast:more){.panel,.save{background:var(--popover);-webkit-backdrop-filter:none;backdrop-filter:none}}
    @media(prefers-contrast:more){.panel,.save{border-color:var(--input)}}
    @media(forced-colors:active){.row:focus-visible,button:focus-visible{outline:2px solid Highlight}}
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
  let statusFailures = 0;
  let displayedOffer: CaptureOffer | undefined;
  let schemeFor: Element | null | undefined;
  let colorContext: OffscreenCanvasRenderingContext2D | null | undefined;

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

  /** sRGB channels and alpha, or undefined when the value cannot be read. */
  function parseColor(value: string): [number, number, number, number] | undefined {
    if (value === 'transparent') return [0, 0, 0, 0];
    const rgb =
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
    if (rgb) {
      const alpha =
        rgb[4] === undefined ? 1 : parseFloat(rgb[4]) / (rgb[4].endsWith('%') ? 100 : 1);
      return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
    }
    // Any other computed syntax (oklch, color()) goes through the canvas parser.
    if (colorContext === undefined) {
      try {
        colorContext = new OffscreenCanvas(1, 1).getContext('2d');
      } catch {
        colorContext = null;
      }
    }
    if (!colorContext) return undefined;
    colorContext.fillStyle = value;
    const serialized = colorContext.fillStyle;
    if (typeof serialized !== 'string') return undefined;
    const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(serialized);
    if (hex) return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16), 1];
    return serialized.startsWith('rgb') ? parseColor(serialized) : undefined;
  }

  /**
   * Whether the page paints light or dark behind the field, so the picker
   * matches the form it sits on rather than the system appearance.
   */
  function pageScheme(anchor: Element | null): 'light' | 'dark' {
    const declared = getComputedStyle(document.documentElement).colorScheme;
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const canvasDark = declared.includes('dark') && (!declared.includes('light') || systemDark);
    const layers: [number, number, number, number][] = [];
    let node: Element | null = anchor?.parentElement ?? document.body;
    for (; node; node = node.parentElement) {
      const styles = getComputedStyle(node);
      // A gradient or image is unknown; treat it as see-through.
      if (styles.backgroundImage !== 'none') continue;
      const color = parseColor(styles.backgroundColor);
      if (color && color[3] > 0) layers.push(color);
    }
    let [r, g, b] = canvasDark ? [18, 18, 18] : [255, 255, 255];
    for (const [lr, lg, lb, a] of layers.reverse()) {
      r = lr * a + r * (1 - a);
      g = lg * a + g * (1 - a);
      b = lb * a + b * (1 - a);
    }
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return luminance < 0.3 ? 'dark' : 'light';
  }

  function applyScheme() {
    schemeFor = active;
    host.style.setProperty('color-scheme', pageScheme(active), 'important');
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
    // A verified lock or sign-out hides everything now. A failed round trip
    // is retried once before the UI is dropped, so a slow bridge does not
    // make the picker flicker. Fills still fail closed at the Mac app.
    if (state.ok) statusFailures = 0;
    else statusFailures++;
    if ((state.ok && state.value !== 'unlocked') || statusFailures >= 2) return invalidateUI();
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
    statusFailures = 0;
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
    if (schemeFor !== active) applyScheme();
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
    applyScheme();
    panel.style.display = 'flex';
    watchStatus();
    position();
    const response = await send<BrowserMatches>({ type: 'matches' });
    if (version !== requestVersion || !open) return;
    statusFailures = 0;
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
      for (const [index, item] of response.value.items.entries()) {
        const row = element('button', 'row');
        row.type = 'button';
        row.dataset.loginId = item.id;
        row.setAttribute('aria-label', `Fill ${item.name}, ${item.username}`);
        const text = element('span', 'text');
        text.append(
          element('span', 'name', item.name),
          element('span', 'sub', item.username || 'No username'),
        );
        const tile = element('span', 'initial', item.name.slice(0, 1).toUpperCase());
        row.append(tile, text);
        if (item.website) void loadIcon(item.id, tile, version);
        if (index === 0) row.append(element('span', 'key', '↵'));
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

  /** Swap the initial for the Mac app's cached website icon once it arrives. */
  async function loadIcon(id: string, tile: HTMLElement, version: number) {
    const icon = await send<string | null>({ type: 'icon', id });
    if (version !== requestVersion || !icon.ok || !icon.value) return;
    // The app returns its own resized PNG. Accept nothing else for the page to load.
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(icon.value)) return;
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.addEventListener('load', () => {
      if (version === requestVersion && tile.isConnected) tile.replaceChildren(image);
    });
    image.src = icon.value;
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
    applyScheme();
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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (trigger.style.display !== 'none' || open || savePanel.childElementCount) applyScheme();
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
