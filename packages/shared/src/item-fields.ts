import type { IdentityFields, IdentityRowKey } from './types';
import { identityRowKeys } from './types';

export const identityRowLabels: Record<IdentityRowKey, string> = {
  name: 'Name',
  username: 'Username',
  company: 'Company',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  ssn: 'Social Security number',
  passportNumber: 'Passport number',
  licenseNumber: 'License number',
};
const secretIdentityRows = new Set<IdentityRowKey>(['ssn', 'passportNumber', 'licenseNumber']);

export function identityRowValue(identity: IdentityFields, key: IdentityRowKey) {
  if (key === 'name')
    return [identity.title, identity.firstName, identity.middleName, identity.lastName]
      .filter(Boolean)
      .join(' ');
  if (key === 'address') {
    const region = [[identity.city, identity.state].filter(Boolean).join(', '), identity.postalCode]
      .filter(Boolean)
      .join(' ');
    return [identity.address1, identity.address2, identity.address3, region, identity.country]
      .filter(Boolean)
      .join('\n');
  }
  return identity[key];
}

/** The identity rows that have a value, in Bitwarden's order. */
export function identityRows(identity: IdentityFields) {
  return identityRowKeys
    .map((key) => ({
      key,
      label: identityRowLabels[key],
      value: identityRowValue(identity, key),
      secret: secretIdentityRows.has(key),
    }))
    .filter((row) => row.value);
}

export function identityLabel(identity: IdentityFields) {
  return identityRowValue(identity, 'name') || identity.company || identity.email;
}
