import type {
  CardFields,
  CustomFieldDraft,
  IdentityFields,
  ItemDetail,
  ItemDraft,
  UriDraft,
} from './types';
import { identityKeys } from './types';
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
export const emptyIdentity = Object.fromEntries(
  identityKeys.map((key) => [key, '']),
) as IdentityFields;
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
    folderId: item.folderId,
    fields: item.fields.map((field, sourceIndex): CustomFieldDraft =>
      field.kind === 'linked' || field.kind === 'unknown'
        ? { action: 'keep', sourceIndex }
        : { action: 'write', sourceIndex, name: field.name, value: field.value, kind: field.kind },
    ),
  };
  if (item.type === 2) return { ...base, type: 2 };
  if (item.type === 3) return { ...base, type: 3, card: item.card ?? emptyCard };
  if (item.type === 4) return { ...base, type: 4, identity: { ...emptyIdentity, ...item.details } };
  if (item.type === 5) return { ...base, type: 5 };
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
