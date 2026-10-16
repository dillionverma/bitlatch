/** An item type's own Bitwarden fields, with the CLI's nulls read as empty strings. */
export type DetailFields = Record<string, string>;

interface RowSpec {
  key: string;
  label: string;
  /** Masked until revealed. */
  secret?: true;
  /** For rows that combine several fields; others show the field named by `key`. */
  value?: (fields: DetailFields) => string;
}

interface DetailSection {
  /** The cipher property that holds the fields. */
  field: 'identity' | 'sshKey' | 'bankAccount' | 'driversLicense' | 'passport';
  keys: readonly string[];
  rows: RowSpec[];
  subtitle: (fields: DetailFields) => string;
}

const joined =
  (separator: string, ...keys: string[]) =>
  (fields: DetailFields) =>
    keys
      .map((key) => fields[key])
      .filter(Boolean)
      .join(separator);
const lastFour = (value: string) => (value ? `•••• ${value.slice(-4)}` : '');

function address(fields: DetailFields) {
  const region = [[fields.city, fields.state].filter(Boolean).join(', '), fields.postalCode]
    .filter(Boolean)
    .join(' ');
  return [fields.address1, fields.address2, fields.address3, region, fields.country]
    .filter(Boolean)
    .join('\n');
}

const identityName = joined(' ', 'title', 'firstName', 'middleName', 'lastName');
const licenseName = joined(' ', 'firstName', 'middleName', 'lastName');
const passportName = joined(' ', 'givenName', 'surname');

/** The item types shown as rows of fields, keyed by Bitwarden's item type. */
export const detailSections: Record<number, DetailSection> = {
  4: {
    field: 'identity',
    keys: [
      'title',
      'firstName',
      'middleName',
      'lastName',
      'address1',
      'address2',
      'address3',
      'city',
      'state',
      'postalCode',
      'country',
      'company',
      'email',
      'phone',
      'ssn',
      'username',
      'passportNumber',
      'licenseNumber',
    ],
    rows: [
      { key: 'name', label: 'Name', value: identityName },
      { key: 'username', label: 'Username' },
      { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address', value: address },
      { key: 'ssn', label: 'Social Security number', secret: true },
      { key: 'passportNumber', label: 'Passport number', secret: true },
      { key: 'licenseNumber', label: 'License number', secret: true },
    ],
    subtitle: (fields) => identityName(fields) || fields.company || fields.email || '',
  },
  5: {
    field: 'sshKey',
    keys: ['privateKey', 'publicKey', 'keyFingerprint'],
    rows: [
      { key: 'publicKey', label: 'Public key' },
      { key: 'keyFingerprint', label: 'Fingerprint' },
      { key: 'privateKey', label: 'Private key', secret: true },
    ],
    subtitle: (fields) => fields.keyFingerprint ?? '',
  },
  6: {
    field: 'bankAccount',
    keys: [
      'bankName',
      'nameOnAccount',
      'accountType',
      'accountNumber',
      'routingNumber',
      'branchNumber',
      'pin',
      'swiftCode',
      'iban',
      'bankContactPhone',
    ],
    rows: [
      { key: 'bankName', label: 'Bank' },
      { key: 'nameOnAccount', label: 'Name on account' },
      { key: 'accountType', label: 'Account type' },
      { key: 'accountNumber', label: 'Account number', secret: true },
      { key: 'routingNumber', label: 'Routing number' },
      { key: 'branchNumber', label: 'Branch number' },
      { key: 'pin', label: 'PIN', secret: true },
      { key: 'swiftCode', label: 'SWIFT code' },
      { key: 'iban', label: 'IBAN', secret: true },
      { key: 'bankContactPhone', label: 'Bank phone' },
    ],
    subtitle: (fields) =>
      [fields.bankName, lastFour(fields.accountNumber ?? '')].filter(Boolean).join(' '),
  },
  7: {
    field: 'driversLicense',
    keys: [
      'firstName',
      'middleName',
      'lastName',
      'licenseNumber',
      'licenseClass',
      'issuingCountry',
      'issuingState',
      'issuingAuthority',
      'issueDate',
      'expirationDate',
      'dateOfBirth',
    ],
    rows: [
      { key: 'name', label: 'Name', value: licenseName },
      { key: 'licenseNumber', label: 'License number', secret: true },
      { key: 'licenseClass', label: 'Class' },
      { key: 'issuingCountry', label: 'Issuing country' },
      { key: 'issuingState', label: 'Issuing state' },
      { key: 'issuingAuthority', label: 'Issuing authority' },
      { key: 'issueDate', label: 'Issue date' },
      { key: 'expirationDate', label: 'Expiration date' },
      { key: 'dateOfBirth', label: 'Date of birth' },
    ],
    subtitle: licenseName,
  },
  8: {
    field: 'passport',
    keys: [
      'givenName',
      'surname',
      'passportNumber',
      'passportType',
      'nationality',
      'nationalIdentificationNumber',
      'sex',
      'dateOfBirth',
      'birthPlace',
      'issuingCountry',
      'issuingAuthority',
      'issueDate',
      'expirationDate',
    ],
    rows: [
      { key: 'name', label: 'Name', value: passportName },
      { key: 'passportNumber', label: 'Passport number', secret: true },
      { key: 'passportType', label: 'Type' },
      { key: 'nationality', label: 'Nationality' },
      { key: 'nationalIdentificationNumber', label: 'National ID number', secret: true },
      { key: 'sex', label: 'Sex' },
      { key: 'dateOfBirth', label: 'Date of birth' },
      { key: 'birthPlace', label: 'Place of birth' },
      { key: 'issuingCountry', label: 'Issuing country' },
      { key: 'issuingAuthority', label: 'Issuing authority' },
      { key: 'issueDate', label: 'Issue date' },
      { key: 'expirationDate', label: 'Expiration date' },
    ],
    subtitle: passportName,
  },
};

export function detailRowValue(type: number, fields: DetailFields, key: string) {
  const row = detailSections[type]?.rows.find((entry) => entry.key === key);
  if (!row) return '';
  return row.value ? row.value(fields) : (fields[key] ?? '');
}

/** The rows that have a value, in Bitwarden's order. */
export function detailRows(type: number, fields: DetailFields) {
  return (detailSections[type]?.rows ?? [])
    .map((row) => ({
      key: row.key,
      label: row.label,
      value: detailRowValue(type, fields, row.key),
      secret: Boolean(row.secret),
    }))
    .filter((row) => row.value);
}

export function typeName(type: number) {
  return (
    (
      {
        1: 'Login',
        2: 'Secure note',
        3: 'Card',
        4: 'Identity',
        5: 'SSH key',
        6: 'Bank account',
        7: "Driver's license",
        8: 'Passport',
      } as Record<number, string>
    )[type] ?? 'Vault item'
  );
}
