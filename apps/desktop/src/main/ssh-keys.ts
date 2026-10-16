import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { UserError } from '@latch/shared/protocol';
import type { SshKeyFields } from '@latch/shared/types';

const run = promisify(execFile);
// The system's own OpenSSH writes and reads the keys; Bitlatch adds no key code.
const SSH_KEYGEN =
  process.platform === 'win32'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', 'ssh-keygen.exe')
    : '/usr/bin/ssh-keygen';
export const SSH_TEMP_PREFIX = 'sshkey-';

async function keygen(args: string[]) {
  try {
    return (await run(SSH_KEYGEN, args, { timeout: 30_000, windowsHide: true })).stdout;
  } catch (error) {
    const output = (error as { stderr?: unknown }).stderr;
    const stderr = typeof output === 'string' ? output : '';
    if (/passphrase/i.test(stderr))
      throw new UserError('Remove the passphrase from this key, then import it again.');
    if (/invalid format|not a key|error in libcrypto/i.test(stderr))
      throw new UserError(
        'Bitlatch can import OpenSSH keys and RSA or ECDSA PEM keys. Convert other keys to OpenSSH format first.',
      );
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new UserError('Bitlatch needs OpenSSH’s ssh-keygen to create SSH keys.');
    throw new UserError('Could not read the SSH key. Try again.');
  }
}

/**
 * Runs `work` in a private directory beside Bitlatch's data, which holds the
 * key only while ssh-keygen needs it.
 */
async function inTemporaryDirectory<T>(parent: string, work: (file: string) => Promise<T>) {
  const directory = await mkdtemp(join(parent, SSH_TEMP_PREFIX));
  try {
    return await work(join(directory, 'key'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fieldsOf(file: string): Promise<SshKeyFields> {
  const publicKey = (await keygen(['-y', '-P', '', '-f', file])).trim();
  await writeFile(`${file}.pub`, `${publicKey}\n`, { mode: 0o600 });
  const fingerprint = /SHA256:[A-Za-z0-9+/=]+/.exec(
    await keygen(['-l', '-E', 'sha256', '-f', `${file}.pub`]),
  )?.[0];
  if (!fingerprint) throw new UserError('Could not read the SSH key. Try again.');
  return { privateKey: await readFile(file, 'utf8'), publicKey, keyFingerprint: fingerprint };
}

/** A new Ed25519 key, as Bitwarden's apps create. */
export function generateSshKey(parent: string) {
  return inTemporaryDirectory(parent, async (file) => {
    await keygen(['-q', '-t', 'ed25519', '-N', '', '-C', '', '-f', file]);
    return fieldsOf(file);
  });
}

/** Reads a pasted private key and stores it in OpenSSH format, with its public key and fingerprint. */
export function importSshKey(parent: string, privateKey: string) {
  return inTemporaryDirectory(parent, async (file) => {
    await writeFile(file, `${privateKey.trim()}\n`, { mode: 0o600 });
    // Rewriting without a passphrase converts PEM keys to OpenSSH and fails on encrypted ones.
    await keygen(['-q', '-p', '-P', '', '-N', '', '-f', file]);
    return fieldsOf(file);
  });
}
