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

function fillable(field: Field) {
  const rect = field.getBoundingClientRect();
  return (
    rect.width >= 20 &&
    rect.height >= 10 &&
    field.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    !field.disabled &&
    !(field instanceof HTMLInputElement && field.readOnly) &&
    !(field instanceof HTMLTextAreaElement && field.readOnly) &&
    !field.closest('[inert]')
  );
}

export function classify(field: Field): Slot | undefined {
  if (
    field instanceof HTMLInputElement &&
    !['text', 'email', 'tel', 'number', 'search', ''].includes(field.type)
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

function fields(kind: FormKind) {
  return Array.from(document.querySelectorAll<Field>('input, select, textarea'))
    .filter(fillable)
    .map((field) => ({ field, slot: classify(field) }))
    .filter(
      (entry): entry is { field: Field; slot: Slot } =>
        !!entry.slot && cardSlots.has(entry.slot) === (kind === 'card'),
    );
}

/** The slots this document can fill, for the extension to decide which frames to ask. */
export function scanForm(kind: FormKind): Slot[] {
  return fields(kind).map(({ slot }) => slot);
}

function choose(select: HTMLSelectElement, value: string) {
  const wanted = value.trim().toLowerCase();
  const options = Array.from(select.options);
  const match =
    options.find((option) => option.value.trim().toLowerCase() === wanted) ??
    options.find((option) => option.text.trim().toLowerCase() === wanted) ??
    // Months as 1 or 01, years as 30 or 2030.
    options.find(
      (option) => /^\d+$/.test(wanted) && Number(option.value) === Number(wanted) && option.value,
    ) ??
    options.find((option) => /^\d{4}$/.test(wanted) && option.value === wanted.slice(2)) ??
    options.find(
      (option) => wanted.length > 2 && option.text.trim().toLowerCase().startsWith(wanted),
    );
  if (!match) return false;
  select.value = match.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Fills every field this document has a value for; returns how many it filled. */
export function fillForm(kind: FormKind, values: FormValues) {
  let filled = 0;
  for (const { field, slot } of fields(kind)) {
    const value = values[slot];
    if (!value) continue;
    if (field instanceof HTMLSelectElement) {
      if (choose(field, value)) filled++;
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
