import type { ItemDetail } from '@latch/shared/types';
import type { FormKind, FormValues } from './content/forms';

/** The values a card or identity fills into a page's form fields. */
export function formValues(item: ItemDetail): { kind: FormKind; values: FormValues } | null {
  if (item.type === 3 && item.card) {
    const { cardholderName, brand, number, expMonth, expYear, code } = item.card;
    const month = expMonth ? expMonth.padStart(2, '0') : '';
    const year = /^\d{2}$/.test(expYear) ? `20${expYear}` : expYear;
    const [given = '', ...family] = cardholderName.trim().split(/\s+/);
    return {
      kind: 'card',
      values: {
        ccName: cardholderName,
        ccGivenName: given,
        ccFamilyName: family.join(' '),
        ccNumber: number.replace(/\s+/g, ''),
        ccExpMonth: month,
        ccExpYear: year,
        ccCsc: code,
        ccType: brand,
      },
    };
  }
  if (item.type === 4 && item.details) {
    const d = item.details;
    const lines = [d.address1, d.address2, d.address3].filter(Boolean);
    return {
      kind: 'identity',
      values: {
        title: d.title,
        firstName: d.firstName,
        middleName: d.middleName,
        lastName: d.lastName,
        fullName: [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' '),
        company: d.company,
        email: d.email,
        phone: d.phone,
        streetAddress: lines.join('\n'),
        address1: d.address1,
        address2: d.address2,
        address3: d.address3,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        country: d.country,
      },
    };
  }
  return null;
}
