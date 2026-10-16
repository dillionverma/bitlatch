import { setValue } from './fields';

export type FormKind = 'card' | 'identity';
export type Slot =
  | 'ccName'
  | 'ccGivenName'
  | 'ccFamilyName'
  | 'ccNumber'
  | 'ccExp'
  | 'ccExpMonth'
  | 'ccExpYear'
  | 'ccCsc'
  | 'ccType'
  | 'title'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'fullName'
  | 'company'
  | 'email'
  | 'phone'
  | 'streetAddress'
  | 'address1'
  | 'address2'
  | 'address3'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country';
export type FormValues = Partial<Record<Slot, string>>;
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Standard autocomplete tokens, which a page sets to say exactly what a field holds. */
const tokens: Record<string, Slot> = {
  'cc-name': 'ccName',
  'cc-given-name': 'ccGivenName',
  'cc-family-name': 'ccFamilyName',
  'cc-number': 'ccNumber',
  'cc-exp': 'ccExp',
  'cc-exp-month': 'ccExpMonth',
  'cc-exp-year': 'ccExpYear',
  'cc-csc': 'ccCsc',
  'cc-type': 'ccType',
  'honorific-prefix': 'title',
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  organization: 'company',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'street-address': 'streetAddress',
  'address-line1': 'address1',
  'address-line2': 'address2',
  'address-line3': 'address3',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
  'country-name': 'country',
};
/** Name, id, placeholder, and label patterns for pages without autocomplete tokens, in priority order. */
const patterns: [Slot, RegExp][] = [
  ['ccCsc', /\b(?:cvc|cvv2?|csc|cvn|security ?code|card ?code|card ?verification)\b/],
  // A combined date first, so "MM / YY" is not read as a month field.
  ['ccExp', /(?:\bmm ?\/ ?yy(?:yy)?\b|\bexp\w* ?date\b|\bvalid ?(?:thru|through|until)\b)/],
  ['ccExpMonth', /\b(?:exp\w* ?month|card ?month|cc ?month|mm)\b/],
  ['ccExpYear', /\b(?:exp\w* ?year|card ?year|cc ?year|yy(?:yy)?)\b/],
  ['ccExp', /\bexpir\w*\b/],
  ['ccName', /\b(?:name ?on ?card|card ?holder|cardholder|cc ?name|card ?name)\b/],
  ['ccNumber', /\b(?:card ?number|card ?no|cc ?num\w*|credit ?card|debit ?card|card ?#)\b/],
  ['email', /\be ?mail\b/],
  ['phone', /\b(?:phone|mobile|telephone|tel)\b/],
  ['company', /\b(?:company|organi[sz]ation|business ?name)\b/],
  ['firstName', /\b(?:first ?name|given ?name|fname|forename)\b/],
  ['middleName', /\b(?:middle ?name|mname)\b/],
  ['lastName', /\b(?:last ?name|surname|family ?name|lname)\b/],
  ['fullName', /\b(?:full ?name|your ?name)\b/],
  ['address2', /\b(?:address ?(?:line)? ?2|addr ?2|apt|apartment|suite|unit)\b/],
  ['address3', /\b(?:address ?(?:line)? ?3|addr ?3)\b/],
  ['address1', /\b(?:address ?(?:line)? ?1|addr ?1|street|address)\b/],
  ['postalCode', /\b(?:zip|postal|post ?code|postcode)\b/],
  ['city', /\b(?:city|town|locality|suburb)\b/],
  ['state', /\b(?:state|province|region|county)\b/],
  ['country', /\bcountry\b/],
];
const cardSlots = new Set<Slot>([
  'ccName',
  'ccGivenName',
  'ccFamilyName',
  'ccNumber',
  'ccExp',
  'ccExpMonth',
  'ccExpYear',
  'ccCsc',
  'ccType',
]);

function describe(field: Field) {
  return [
    field.name,
    field.id,
    field.getAttribute('placeholder'),
    field.getAttribute('aria-label'),
    ...Array.from(field.labels ?? [], (label) => label.textContent),
    ...(field.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent),
  ]
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]]/g, ' ')
    .toLowerCase();
}

/**
 * A field a person can see: large enough, on the page, mostly opaque through
 * its ancestors, and, where it is in view, not covered by another element.
 * Decoys that a page hides, shrinks, or covers never receive values.
 */
function fillable(field: Field) {
  const rect = field.getBoundingClientRect();
  if (rect.width < 24 || rect.height < 14) return false;
  const { scrollWidth, scrollHeight } = document.documentElement;
  if (
    rect.right + scrollX <= 0 ||
    rect.bottom + scrollY <= 0 ||
    rect.left + scrollX >= Math.max(scrollWidth, innerWidth) ||
    rect.top + scrollY >= Math.max(scrollHeight, innerHeight)
  )
    return false;
  if (
    !field.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
    field.disabled ||
    (field instanceof HTMLInputElement && field.readOnly) ||
    (field instanceof HTMLTextAreaElement && field.readOnly) ||
    field.closest('[inert]')
  )
    return false;
  let opacity = 1;
  for (let element: Element | null = field; element; element = element.parentElement)
    opacity *= Number(getComputedStyle(element).opacity);
  if (opacity < 0.5) return false;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
  const hit = document.elementFromPoint(x, y);
  return (
    !!hit &&
    (hit === field ||
      field.contains(hit) ||
      (hit instanceof HTMLLabelElement && hit.control === field))
  );
}

export function classify(field: Field): Slot | undefined {
  if (
    field instanceof HTMLInputElement &&
    !['text', 'email', 'tel', 'number', 'search', 'month', ''].includes(field.type)
  )
    return undefined;
  // Drop section-*, shipping, and billing prefixes; the last token names the field.
  const token = field.autocomplete.trim().toLowerCase().split(/\s+/).at(-1) ?? '';
  if (token === 'off' || token === 'username' || token.includes('password')) return undefined;
  if (tokens[token]) return tokens[token];
  const text = describe(field);
  if (/\b(?:user ?name|login|password|search|coupon|promo|captcha)\b/.test(text)) return undefined;
  return patterns.find(([, pattern]) => pattern.test(text))?.[0];
}

/** The matching fields of the one form with the most of them, so unrelated forms stay empty. */
function fields(kind: FormKind) {
  const matched = Array.from(document.querySelectorAll<Field>('input, select, textarea'))
    .filter(fillable)
    .map((field) => ({ field, slot: classify(field) }))
    .filter(
      (entry): entry is { field: Field; slot: Slot } =>
        !!entry.slot && cardSlots.has(entry.slot) === (kind === 'card'),
    );
  const groups = new Map<HTMLFormElement | null, typeof matched>();
  for (const entry of matched)
    groups.set(entry.field.form, [...(groups.get(entry.field.form) ?? []), entry]);
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

/** The slots this document can fill, for the extension to decide which frames to ask. */
export function scanForm(kind: FormKind): Slot[] {
  return fields(kind).map(({ slot }) => slot);
}

const regions = new Intl.DisplayNames(['en'], { type: 'region' });
function regionName(code: string) {
  try {
    return /^[a-z]{2}$/i.test(code) ? (regions.of(code.toUpperCase()) ?? '') : '';
  } catch {
    return '';
  }
}

function choose(select: HTMLSelectElement, value: string, slot: Slot) {
  const wanted = value.trim().toLowerCase();
  const options = Array.from(select.options);
  // A country stored as a code matches a name, and a stored name matches a code.
  const country = (option: HTMLOptionElement) =>
    slot === 'country' &&
    (option.text.trim().toLowerCase() === regionName(wanted).toLowerCase() ||
      regionName(option.value).toLowerCase() === wanted);
  const match =
    options.find((option) => option.value.trim().toLowerCase() === wanted) ??
    options.find((option) => option.text.trim().toLowerCase() === wanted) ??
    // Months as 1 or 01, years as 30 or 2030.
    options.find(
      (option) => /^\d+$/.test(wanted) && Number(option.value) === Number(wanted) && option.value,
    ) ??
    options.find((option) => /^\d{4}$/.test(wanted) && option.value === wanted.slice(2)) ??
    options.find((option) => option.value && country(option)) ??
    options.find(
      (option) => wanted.length > 2 && option.text.trim().toLowerCase().startsWith(wanted),
    );
  if (!match) return false;
  select.value = match.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** A combined expiration in the format the field asks for: a month input, MM/YYYY, or MM/YY. */
function expiration(field: Field, values: FormValues) {
  const month = values.ccExpMonth;
  const year = values.ccExpYear;
  if (!month || !year) return '';
  if (field instanceof HTMLInputElement && field.type === 'month') return `${year}-${month}`;
  return /yyyy/.test(describe(field)) ? `${month}/${year}` : `${month}/${year.slice(-2)}`;
}

/** Fills every field this document has a value for; returns how many it filled. */
export function fillForm(kind: FormKind, values: FormValues) {
  let filled = 0;
  for (const { field, slot } of fields(kind)) {
    const value = slot === 'ccExp' ? expiration(field, values) : values[slot];
    if (!value) continue;
    if (field instanceof HTMLSelectElement) {
      if (choose(field, value, slot)) filled++;
    } else if (field instanceof HTMLInputElement) {
      setValue(field, value);
      filled++;
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      descriptor?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    }
  }
  return filled;
}
