import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto';
import { UserError } from '../shared/protocol';

/**
 * A passkey as Bitwarden stores it on a login item. Field names, string
 * encodings and the counter rule match the official clients so an item Latch
 * writes is usable everywhere else, and vice versa.
 */
export interface Fido2Credential {
  credentialId: string;
  keyType: string;
  keyAlgorithm: string;
  keyCurve: string;
  keyValue: string;
  rpId: string;
  userHandle?: string | null;
  userName?: string | null;
  counter: number | string;
  rpName?: string | null;
  userDisplayName?: string | null;
  discoverable: boolean | string;
  creationDate?: string | null;
  [key: string]: unknown;
}

/** COSE algorithm identifier for ECDSA with P-256 and SHA-256. */
export const ES256 = -7;

/** Latch's authenticator identifier. Relying parties may show it in their key list. */
const AAGUID = Buffer.from('7c4b2f7ad3a546c2b8e1a2a6f0c1e3d9', 'hex');

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value: string): Buffer {
  if (!/^[\w-]*={0,2}$/.test(value) || value.length % 4 === 1)
    throw new UserError('The passkey data is malformed.');
  return Buffer.from(value, 'base64url');
}

/** Raw credential bytes for a stored identifier: a UUID or a `b64.` string. */
export function credentialIdBytes(stored: string): Buffer | null {
  try {
    if (stored.startsWith('b64.')) return fromBase64Url(stored.slice(4));
    return UUID.test(stored) ? Buffer.from(stored.replaceAll('-', ''), 'hex') : null;
  } catch {
    return null;
  }
}

/** The stored form for raw credential bytes, preferring the UUID shape. */
export function credentialIdString(bytes: Uint8Array): string {
  if (bytes.length === 16) {
    const hex = Buffer.from(bytes).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `b64.${toBase64Url(bytes)}`;
}

export function sameCredential(stored: string, raw: Uint8Array): boolean {
  const bytes = credentialIdBytes(stored);
  return Boolean(bytes && bytes.length === raw.length && bytes.equals(raw));
}

/** Whether a stored credential can sign here: a P-256 ECDSA key we can load. */
export function usableCredential(credential: Fido2Credential): boolean {
  return (
    credential.keyType === 'public-key' &&
    credential.keyAlgorithm === 'ECDSA' &&
    credential.keyCurve === 'P-256' &&
    typeof credential.keyValue === 'string' &&
    typeof credential.rpId === 'string' &&
    credential.rpId.length > 0 &&
    credentialIdBytes(credential.credentialId) !== null
  );
}

function flagsByte(options: { userVerified: boolean; attested: boolean }) {
  // UP, UV, BE + BS (synced through the vault), AT when a key is attached.
  return (
    0b0000_0001 |
    (options.userVerified ? 0b0000_0100 : 0) |
    0b0000_1000 |
    0b0001_0000 |
    (options.attested ? 0b0100_0000 : 0)
  );
}

function counterBytes(counter: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(counter >>> 0);
  return bytes;
}

/** CTAP2 canonical COSE_Key for a P-256 public key: 77 bytes, fixed layout. */
function coseKey(publicKeyDer: Buffer) {
  const jwk = createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }).export({
    format: 'jwk',
  });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y)
    throw new UserError('The passkey key is not a P-256 key.');
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y, 'base64url'),
  ]);
}

export function authenticatorData(options: {
  rpId: string;
  counter: number;
  userVerified: boolean;
  attested?: { credentialId: Uint8Array; publicKeyDer: Buffer };
}) {
  const parts = [
    createHash('sha256').update(options.rpId, 'utf8').digest(),
    Buffer.from([flagsByte({ userVerified: options.userVerified, attested: !!options.attested })]),
    counterBytes(options.counter),
  ];
  if (options.attested) {
    const id = Buffer.from(options.attested.credentialId);
    if (id.length > 1023) throw new UserError('The credential identifier is too long.');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(id.length);
    parts.push(AAGUID, length, id, coseKey(options.attested.publicKeyDer));
  }
  return Buffer.concat(parts);
}

/** CBOR byte string header for a length that fits in 16 bits. */
function cborBytes(data: Buffer) {
  if (data.length < 24) return Buffer.concat([Buffer.from([0x40 | data.length]), data]);
  if (data.length < 256) return Buffer.concat([Buffer.from([0x58, data.length]), data]);
  const header = Buffer.alloc(3);
  header[0] = 0x59;
  header.writeUInt16BE(data.length, 1);
  return Buffer.concat([header, data]);
}

/** `{ fmt: "none", attStmt: {}, authData }` in CTAP2 canonical CBOR. */
export function attestationObject(authData: Buffer) {
  return Buffer.concat([
    Buffer.from([0xa3]),
    Buffer.from([0x63]),
    Buffer.from('fmt', 'ascii'),
    Buffer.from([0x64]),
    Buffer.from('none', 'ascii'),
    Buffer.from([0x67]),
    Buffer.from('attStmt', 'ascii'),
    Buffer.from([0xa0]),
    Buffer.from([0x68]),
    Buffer.from('authData', 'ascii'),
    cborBytes(authData),
  ]);
}

/** DER ECDSA signature over `authData || clientDataHash`, as WebAuthn requires. */
export function signAssertion(keyValue: string, authData: Buffer, clientDataHash: Buffer) {
  let key;
  try {
    key = createPrivateKey({ key: fromBase64Url(keyValue), format: 'der', type: 'pkcs8' });
  } catch {
    throw new UserError('This passkey cannot be used here. Sign in with Bitwarden instead.');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
    throw new UserError('This passkey cannot be used here. Sign in with Bitwarden instead.');
  return sign('sha256', Buffer.concat([authData, clientDataHash]), { key, dsaEncoding: 'der' });
}

/** A fresh P-256 key pair in the shape Bitwarden stores. */
export function createCredentialKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    credentialId: randomUUID(),
    keyValue: toBase64Url(privateKey.export({ format: 'der', type: 'pkcs8' })),
    publicKeyDer: publicKey.export({ format: 'der', type: 'spki' }) as Buffer,
  };
}

export function isValidRpId(rpId: string): boolean {
  return (
    rpId.length > 0 &&
    rpId.length <= 253 &&
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i.test(rpId)
  );
}
