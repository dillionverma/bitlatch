// Test-only registration material for an isolated local Vaultwarden instance.
// Production authentication and encryption are exclusively handled by Bitwarden.
import {
  createCipheriv,
  createHmac,
  generateKeyPairSync,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
} from 'node:crypto';

export async function createFixtureAccount(server = 'http://127.0.0.1:8229') {
  if (new URL(server).hostname !== '127.0.0.1')
    throw new Error('Fixtures require a local disposable server.');
  const email = `latch-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const iterations = 600_000;
  const masterKey = pbkdf2Sync(password, email, iterations, 32, 'sha256');
  const hash = pbkdf2Sync(masterKey, password, 1, 32, 'sha256');
  const encKey = createHmac('sha256', masterKey)
    .update(Buffer.concat([Buffer.from('enc'), Buffer.from([1])]))
    .digest();
  const macKey = createHmac('sha256', masterKey)
    .update(Buffer.concat([Buffer.from('mac'), Buffer.from([1])]))
    .digest();
  const userKey = randomBytes(64);
  const key = encryptFixture(userKey, encKey, macKey);
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keys = {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    encryptedPrivateKey: encryptFixture(
      privateKey.export({ type: 'pkcs8', format: 'der' }),
      userKey.subarray(0, 32),
      userKey.subarray(32),
    ),
  };
  const response = await fetch(`${server}/identity/accounts/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      name: 'Latch Test',
      masterPasswordHash: hash.toString('base64'),
      key,
      keys,
      kdf: 0,
      kdfIterations: iterations,
    }),
  });
  if (!response.ok) throw new Error(`Fixture registration failed (${response.status}).`);
  return { email, password, server, masterPasswordHash: hash.toString('base64') };
}

export async function fixtureApiKey(account: Awaited<ReturnType<typeof createFixtureAccount>>) {
  const response = await fetch(`${account.server}/identity/connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      username: account.email,
      password: account.masterPasswordHash,
      scope: 'api offline_access',
      client_id: 'cli',
      deviceType: '8',
      deviceIdentifier: randomUUID(),
      deviceName: 'Latch disposable fixture',
    }),
  });
  if (!response.ok) throw new Error(`Fixture authentication failed (${response.status}).`);
  const token = (await response.json()) as { access_token: string };
  const subject = JSON.parse(
    Buffer.from(token.access_token.split('.')[1]!, 'base64url').toString(),
  ) as { sub: string };
  const keyResponse = await fetch(`${account.server}/api/accounts/api-key`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ masterPasswordHash: account.masterPasswordHash }),
  });
  if (!keyResponse.ok) throw new Error(`Fixture API key creation failed (${keyResponse.status}).`);
  const key = (await keyResponse.json()) as { apiKey: string };
  return { clientId: `user.${subject.sub}`, clientSecret: key.apiKey };
}

function encryptFixture(value: Buffer, encKey: Buffer, macKey: Buffer) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  const mac = createHmac('sha256', macKey)
    .update(Buffer.concat([iv, encrypted]))
    .digest();
  return `2.${iv.toString('base64')}|${encrypted.toString('base64')}|${mac.toString('base64')}`;
}
