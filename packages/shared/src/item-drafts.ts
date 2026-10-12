import type { CardFields, ItemDetail, ItemDraft, UriDraft } from './types';
import { uriMatchSchema } from './protocol';
import { webUrl } from './urls';

export const uriMatchOptions = [
  { value: '', label: 'Default (base domain)' },
  { value: '0', label: 'Base domain' },
  { value: '1', label: 'Host' },
  { value: '2', label: 'Starts with' },
  { value: '3', label: 'Exact' },
  { value: '5', label: 'Never' },
];
/** Bitwarden's card brand values. */
export const cardBrands = [
  'Visa',
  'Mastercard',
  'Amex',
  'Discover',
  'Diners Club',
  'JCB',
  'Maestro',
  'UnionPay',
  'RuPay',
  'Other',
];
export const emptyCard: CardFields = {
  cardholderName: '',
  brand: '',
  number: '',
  expMonth: '',
  expYear: '',
  code: '',
};
export function cardLabel(brand: string, number: string) {
  return [brand, number && `•••• ${number.slice(-4)}`].filter(Boolean).join(' ');
}
export function editableUri(row: ItemDetail['uris'][number]) {
  return (
    row.uri !== null &&
    Boolean(webUrl(row.uri.includes('://') ? row.uri : `https://${row.uri}`)) &&
    uriMatchSchema.safeParse(row.match).success
  );
}
export function itemDraft(item: ItemDetail): ItemDraft {
  const base = {
    id: item.id,
    revisionDate: item.revisionDate,
    name: item.name,
    notes: item.notes,
    favorite: item.favorite,
  };
  if (item.type === 2) return { ...base, type: 2 };
  if (item.type === 3) return { ...base, type: 3, card: item.card ?? emptyCard };
  return {
    ...base,
    type: 1,
    username: item.username,
    password: item.password,
    uris: item.uris.map((row): UriDraft => {
      const match = uriMatchSchema.safeParse(row.match);
      return editableUri(row) && row.uri !== null && match.success
        ? { action: 'write', sourceIndex: row.sourceIndex, uri: row.uri, match: match.data }
        : { action: 'keep', sourceIndex: row.sourceIndex };
    }),
  };
}
