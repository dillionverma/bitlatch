import { safeStorage, systemPreferences } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Remembers the CLI session key so Touch ID can stand in for the master
 * password.
 *
 * Two things worth being plain about. The key is kept because `bw lock`
 * destroys a session key outright, so a locked CLI can only be reopened with
 * the master password; Bitlatch therefore leaves the CLI unlocked while this is
 * on and relies on the stored key being unreachable instead. And the Touch ID
 * prompt is a gate this app chooses to honour, not one macOS enforces on the
 * stored bytes: Electron cannot ask the Keychain for a biometry-guarded entry,
 * so `safeStorage` is what protects the file at rest.
 */
export interface SessionStore {
  /**
   * `unsupported` where this could never work, `unavailable` where macOS is not
   * offering Touch ID right now, such as a MacBook with the lid shut.
   */
  status(): 'unsupported' | 'unavailable' | 'ready';
  /** Reads what a previous run kept, so `enabled()` can answer. */
  load(): Promise<void>;
  /** Whether a session key is currently being kept. */
  enabled(): boolean;
  /** Whether the user turned Touch ID off, which stops it being kept by default. */
  declined(): boolean;
  keep(session: string): Promise<void>;
  /** Asks for Touch ID, then returns the stored session key. */
  recall(): Promise<string>;
  /** Removes the stored key; `decline` also remembers that the user turned it off. */
  forget(decline?: boolean): Promise<void>;
}

export function touchIdSessionStore(dataDir: string): SessionStore {
  const file = join(dataDir, 'touch-id-session');
  const declinedFile = join(dataDir, 'touch-id-off');
  let stored: Buffer | undefined;
  let off = false;
  let loaded = false;

  async function read() {
    if (!loaded) {
      [stored, off] = await Promise.all([
        readFile(file).catch(() => undefined),
        readFile(declinedFile).then(
          () => true,
          () => false,
        ),
      ]);
      loaded = true;
    }
    return stored;
  }

  return {
    status() {
      try {
        if (process.platform !== 'darwin' || !safeStorage.isEncryptionAvailable())
          return 'unsupported';
        return systemPreferences.canPromptTouchID() ? 'ready' : 'unavailable';
      } catch {
        return 'unsupported';
      }
    },
    async load() {
      await read();
    },
    enabled() {
      return Boolean(stored);
    },
    declined() {
      return off;
    },
    async keep(session: string) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const encrypted = safeStorage.encryptString(session);
      await writeFile(file, encrypted, { mode: 0o600 });
      await rm(declinedFile, { force: true });
      stored = encrypted;
      off = false;
      loaded = true;
    },
    async recall() {
      const encrypted = await read();
      if (!encrypted) throw new Error('No session key is being kept.');
      await systemPreferences.promptTouchID('unlock your Bitlatch vault');
      return safeStorage.decryptString(encrypted);
    },
    async forget(decline = false) {
      stored = undefined;
      loaded = true;
      await rm(file, { force: true });
      if (decline) {
        await mkdir(dirname(declinedFile), { recursive: true, mode: 0o700 });
        await writeFile(declinedFile, '', { mode: 0o600 });
        off = true;
      }
    },
  };
}
