export function visible(input: HTMLInputElement) {
  const rect = input.getBoundingClientRect();
  const styles = getComputedStyle(input);
  return (
    rect.width >= 50 &&
    rect.height >= 15 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth &&
    input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    styles.visibility !== 'hidden' &&
    styles.display !== 'none' &&
    Number(styles.opacity) !== 0 &&
    !input.disabled &&
    !input.readOnly &&
    !input.closest('[inert]')
  );
}

function isCodeInput(input: HTMLInputElement) {
  if (input.autocomplete.split(/\s+/).includes('one-time-code')) return true;
  const description = [
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute('aria-label'),
    ...Array.from(input.labels ?? [], (label) => label.textContent),
    ...(input.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent),
  ]
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ');
  return /\b(?:otp|totp|2fa|mfa|one time (?:code|password)|(?:security|verification|authentication|confirmation|sms|auth) code|(?:enter|type) (?:the |your )?code)\b/i.test(
    description,
  );
}

export function isLoginInput(target: unknown): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || !visible(target)) return false;
  if (target.autocomplete.split(/\s+/).includes('new-password') || isCodeInput(target))
    return false;
  if (target.type === 'password') return true;
  if (!['email', 'text', 'tel'].includes(target.type)) return false;
  if (target.autocomplete.split(/\s+/).includes('username')) return true;
  const scope = target.form ?? target.closest('[role="dialog"], dialog') ?? target.parentElement;
  if (!scope) return false;
  if (
    Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="password"]')).some(
      (input) => visible(input) && !input.autocomplete.split(/\s+/).includes('new-password'),
    )
  )
    return true;
  // Email also appears in invites, checkout, and search. Only offer an
  // email-first picker when this form explicitly says it is a sign-in.
  return Array.from(scope.querySelectorAll('h1,h2,h3,legend,button,[role="button"]')).some(
    (element) => /\b(?:sign\s*in|log\s*in)\b/i.test(element.textContent ?? ''),
  );
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/**
 * Account names the page already shows: a filled username field, a hidden
 * identifier the site carried over, or an email printed near the form, like
 * an account chooser chip. Read only, never sent anywhere.
 */
export function pageIdentities(active: HTMLInputElement | null): Set<string> {
  const found = new Set<string>();
  const add = (value: string | null | undefined) => {
    const text = value?.trim().toLowerCase();
    if (text && text.length <= 254) found.add(text);
  };
  for (const input of document.querySelectorAll<HTMLInputElement>('input')) {
    if (input === active || !['text', 'email', 'tel', 'hidden'].includes(input.type)) continue;
    const value = input.value.trim();
    if (!value || value.length > 254) continue;
    const field = `${input.name} ${input.id} ${input.autocomplete}`.toLowerCase();
    if (value.includes('@') || /user|email|login|identifier|account/.test(field)) add(value);
  }
  const region =
    active?.closest<HTMLElement>('form, main, [role="main"], section, article') ?? document.body;
  for (const match of (region?.innerText ?? '').slice(0, 20_000).matchAll(EMAIL)) add(match[0]);
  return found;
}

/** 0 when the page shows this login's account, 1 for a local-part match, else 2. */
function identityRank(username: string, identities: Set<string>) {
  const name = username.trim().toLowerCase();
  if (!name || !identities.size) return 2;
  if (identities.has(name)) return 0;
  const local = name.split('@')[0]!;
  for (const identity of identities)
    if (identity === local || identity.split('@')[0] === name) return 1;
  return 2;
}

/** Logins whose account the page shows first, keeping the app's order otherwise. */
export function rankItems<T extends { username: string }>(items: T[], identities: Set<string>) {
  return items
    .map((item, index) => ({ item, index, rank: identityRank(item.username, identities) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

export function setValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The credentials a submitted form is carrying, if it looks like a sign-in. */
export function readForm(form: ParentNode) {
  const passwords = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="password"]'))
    .filter((input) => visible(input) && input.value)
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

/** Refuse signup/change-password forms before selecting fill targets. */
export function fillTargets(field: HTMLInputElement) {
  const owner = field.form;
  let inputs = (
    owner
      ? Array.from(owner.elements).filter(
          (input): input is HTMLInputElement =>
            input instanceof HTMLInputElement && input.form === owner,
        )
      : Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
          (input) => input.form === null,
        )
  ).filter(visible);
  let passwords = inputs.filter((input) => input.type === 'password');
  if (passwords.some((input) => input.autocomplete.split(/\s+/).includes('new-password')))
    return undefined;
  if (passwords.length > 1) {
    const groups = new Set<HTMLElement>();
    for (const password of passwords) {
      if (owner && !owner.contains(password)) return undefined;
      let scope: HTMLElement | undefined;
      for (
        let group = password.parentElement;
        group && group !== owner;
        group = group.parentElement
      )
        if (group.matches('fieldset, [role="form"], dialog, [role="dialog"]')) scope = group;
      if (!scope || groups.has(scope)) return undefined;
      groups.add(scope);
    }
    for (const group of groups) {
      const actions = group.querySelectorAll<HTMLElement>(
        'button, [role="button"], input[type="submit"], input[type="button"], a[href]',
      );
      if (
        !Array.from(actions).some((action) => {
          const label = (
            action instanceof HTMLInputElement ? action.value : (action.textContent ?? '')
          )
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
          const rect = action.getBoundingClientRect();
          return (
            (label === 'sign in' || label === 'log in') &&
            rect.width > 0 &&
            rect.height > 0 &&
            action.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
            !action.closest('[inert]') &&
            !(
              (action instanceof HTMLInputElement || action instanceof HTMLButtonElement) &&
              action.disabled
            )
          );
        })
      )
        return undefined;
    }
    const selected = Array.from(groups).find((group) => group.contains(field));
    if (!selected) return undefined;
    inputs = inputs.filter((input) => selected.contains(input));
    passwords = inputs.filter((input) => input.type === 'password');
  }
  const candidates = inputs.filter(
    (input) => !isCodeInput(input) && ['text', 'email', 'tel'].includes(input.type),
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
  return { username, password: passwords[0] };
}
