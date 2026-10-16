import { detailRows } from '@latch/shared/item-fields';
import type { CopyTarget, ItemDetail } from '@latch/shared/types';

/** A row Raycast shows. Secret rows carry a mask, never the value; copying goes through Bitlatch. */
export interface LauncherRow {
  id: string;
  label: string;
  value: string;
  secret: boolean;
  copy: 'cardNumber' | 'cardCode' | CopyTarget | null;
}

const MASK = '••••••••';
const HIDDEN = 'Hidden by your organization';

export function launcherRows(item: ItemDetail): LauncherRow[] {
  const rows: LauncherRow[] = [];
  const add = (row: LauncherRow) => {
    if (row.value) rows.push(row);
  };
  if (item.card) {
    const { cardholderName, brand, number, expMonth, expYear, code } = item.card;
    add({
      id: 'cardholder',
      label: 'Cardholder name',
      value: cardholderName,
      secret: false,
      copy: null,
    });
    add({ id: 'brand', label: 'Brand', value: brand, secret: false, copy: null });
    add({
      id: 'cardNumber',
      label: 'Number',
      value: number && `•••• ${number.slice(-4)}`,
      secret: true,
      copy: 'cardNumber',
    });
    add({
      id: 'expiration',
      label: 'Expiration',
      value: expMonth || expYear ? `${expMonth.padStart(2, '0') || '—'} / ${expYear || '—'}` : '',
      secret: false,
      copy: null,
    });
    add({
      id: 'cardCode',
      label: 'Security code',
      value: code && '•••',
      secret: true,
      copy: 'cardCode',
    });
  }
  for (const row of detailRows(item.type, item.details ?? {}))
    add({
      id: `detail-${row.key}`,
      label: row.label,
      value: row.secret ? MASK : row.value,
      secret: row.secret,
      copy: { detail: row.key },
    });
  item.fields.forEach((field, index) => {
    const label = field.name || 'Custom field';
    const id = `custom-${index}`;
    const copy = { custom: index, revisionDate: item.revisionDate };
    if (field.kind === 'boolean')
      add({ id, label, value: field.value === 'true' ? 'Yes' : 'No', secret: false, copy: null });
    else if (field.kind === 'linked')
      add({
        id,
        label,
        value: field.value ? `Linked to ${field.value}` : 'Linked field',
        secret: false,
        copy: null,
      });
    else if (!field.value)
      add({ id, label, value: item.passwordsHidden ? HIDDEN : '', secret: false, copy: null });
    else if (field.kind === 'text') add({ id, label, value: field.value, secret: false, copy });
    else add({ id, label, value: MASK, secret: true, copy });
  });
  return rows;
}
