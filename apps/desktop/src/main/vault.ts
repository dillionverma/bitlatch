import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { CodeRejectedError, type CliPort, type CliPrompt } from './cli';
import { fillableUrl, matchesUri, normalizeServer, webUrl, type CipherUri } from './matching';
import { UserError } from '@latch/shared/protocol';
import {
  ES256,
  attestationObject,
  authenticatorData,
  createCredentialKey,
  credentialIdBytes,
  fromBase64Url,
  isValidRpId,
  sameCredential,
  signAssertion,
  toBase64Url,
  usableCredential,
  type Fido2Credential,
} from './passkeys';
import type { SessionStore } from './biometrics';
import type { AccountHint } from './account-hint';
import type {
  BrowserMatches,
  CaptureOffer,
  ChallengeAnswer,
  ItemDetail,
  ItemSummary,
  LoginChallenge,
  LoginDraft,
  LoginInput,
  PasswordOptions,
  TwoStepMethod,
  VaultState,
} from '@latch/shared/types';

export interface Cipher {
  id: string;
  name: string;
  type: number;
  favorite?: boolean;
  organizationId?: string | null;
  deletedDate?: string | null;
  reprompt?: number;
  revisionDate?: string | null;
  creationDate?: string | null;
  notes?: string | null;
  login?: {
    username?: string | null;
    password?: string | null;
    uris?: CipherUri[];
    fido2Credentials?: Fido2Credential[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** The CLI's numeric identifiers for the two-step methods it can complete. */
const METHOD_FLAGS: Record<TwoStepMethod, string> = {
  authenticator: '0',
  email: '1',
  yubikey: '3',
};
const ALL_METHODS: TwoStepMethod[] = ['authenticator', 'yubikey', 'email'];
const MAX_CODE_ATTEMPTS = 3;
/** How long an unanswered save offer stays on the table. */
const CAPTURE_TIMEOUT_MS = 3 * 60_000;

/** A sign-in the browser saw, waiting for the user to accept or ignore it. */
interface Captured {
  action: 'save' | 'update';
  id?: string;
  name: string;
  origin: string;
  username: string;
  password: string;
  at: number;
}

/** A password sign-in that may still need a verification step from the user. */
interface PendingLogin {
  input: LoginInput;
  method?: TwoStepMethod;
  attempts: number;
  rejection?: string;
  restart: boolean;
  failure?: UserError;
  settle?: (answer: ChallengeAnswer) => void;
}

/** A passkey the picker can offer for a relying party. Nothing secret. */
export interface PasskeyMatch {
  id: string;
  name: string;
  userName: string;
  credentialId: string;
  userHandle: string;
  rpId: string;
}

export interface PasskeyIdentity {
  kind: 'passkey';
  id: string;
  rpId: string;
  userName: string;
  credentialId: string;
  userHandle: string;
}

export interface PasswordIdentity {
  kind: 'password';
  id: string;
  username: string;
  url: string;
}

export class Vault extends EventEmitter {
  private session = '';
  private ciphers = new Map<string, Cipher>();
  private generation = 0;
  private revision = 0;
  private itemsRevision = 0;
  private trashLoaded = false;
  private trashLoading?: Promise<void>;
  private pending?: PendingLogin;
  private captured?: Captured;
  private state: Omit<
    VaultState,
    'biometrics' | 'biometricsOn' | 'revision' | 'itemsRevision' | 'trashLoaded'
  > = {
    status: 'signed-out',
    email: '',
    server: 'https://vault.bitwarden.com',
    lastSync: null,
    itemCount: 0,
    trashCount: 0,
  };

  constructor(
    private readonly cli: CliPort,
    private readonly sessions?: SessionStore,
  ) {
    super();
  }

  /** Whether Touch ID could stand in for the master password, and whether it does. */
  private biometrics() {
    return {
      biometrics: this.sessions?.status() ?? ('unsupported' as const),
      biometricsOn: Boolean(this.sessions?.enabled()),
    };
  }

  snapshot(): VaultState {
    return {
      ...this.state,
      ...this.biometrics(),
      revision: this.revision,
      itemsRevision: this.itemsRevision,
      trashLoaded: this.trashLoaded,
    };
  }

  /** A remembered account can show a locked screen while the CLI starts. */
  showLockedAccount(hint: AccountHint) {
    this.state = { ...this.state, ...hint, status: 'locked' };
  }

  async initialize() {
    const generation = this.generation;
    const output = await this.cli.run(['status']).catch((error: unknown) => {
      if (generation !== this.generation) return undefined;
      throw error;
    });
    if (output === undefined) return this.snapshot();
    const status = JSON.parse(output) as {
      status: string;
      userEmail?: string;
      serverUrl?: string;
      lastSync?: string;
    };
    if (generation !== this.generation) return this.snapshot();
    this.state = {
      status: status.status === 'unauthenticated' ? 'signed-out' : 'locked',
      email: status.userEmail ?? '',
      server: status.serverUrl || 'https://vault.bitwarden.com',
      lastSync: status.lastSync ?? null,
      itemCount: 0,
      trashCount: 0,
    };
    return this.publish();
  }

  async login(input: LoginInput) {
    if (this.state.status !== 'signed-out')
      throw new UserError('Sign out before switching accounts.');
    const generation = ++this.generation;
    let server: string;
    try {
      server = normalizeServer(input.server);
    } catch {
      throw new UserError('Use a valid HTTPS Bitwarden server address.');
    }
    // Setting a server that is already set costs a whole CLI start.
    if (server !== this.state.server) await this.cli.run(['config', 'server', server]);
    this.assertGeneration(generation);
    let session: string;
    if (input.clientId && input.clientSecret) {
      await this.cli.run(['login', '--apikey'], {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      });
      this.assertGeneration(generation);
      this.state = {
        ...this.state,
        status: 'locked',
        email: input.email.trim().toLowerCase(),
        server,
      };
      try {
        session = await this.cli.run(
          ['unlock', '--passwordenv', 'LATCH_MASTER_PASSWORD', '--raw'],
          { password: input.password },
        );
      } catch (error) {
        if (generation === this.generation) this.publish();
        throw error;
      }
    } else {
      session = await this.passwordLogin(input, generation);
    }
    this.assertGeneration(generation);
    this.session = session;
    this.state = {
      ...this.state,
      status: 'locked',
      email: input.email.trim().toLowerCase(),
      server,
    };
    await this.load(generation);
    await this.rememberForTouchId(session, generation);
    this.assertGeneration(generation);
    return this.publish();
  }

  /** Delivers the user's response to the verification step a sign-in is waiting on. */
  answerChallenge(answer: ChallengeAnswer) {
    const challenge = this.state.challenge;
    const settle = this.pending?.settle;
    if (!challenge || !settle) throw new UserError('No sign-in is waiting for a code.');
    if ('method' in answer && challenge.kind !== 'method')
      throw new UserError('Enter the code Bitwarden asked for.');
    if ('code' in answer && challenge.kind === 'method')
      throw new UserError('Choose a two-step method first.');
    settle(answer);
  }

  /**
   * Signs in with the master password, letting the CLI ask for two-step or
   * new-device codes. Choosing a method restarts the CLI with that method;
   * a rejected code is retried a few times before the sign-in fails.
   */
  private async passwordLogin(input: LoginInput, generation: number) {
    const email = input.email.trim().toLowerCase();
    const pending: PendingLogin = { input, attempts: 0, restart: false };
    this.pending = pending;
    const finish = () => {
      pending.settle?.({ cancel: true });
      pending.settle = undefined;
      if (this.pending === pending) this.pending = undefined;
      delete this.state.challenge;
    };
    try {
      for (;;) {
        pending.restart = false;
        try {
          const session = await this.cli.run(
            [
              'login',
              email,
              '--passwordenv',
              'LATCH_MASTER_PASSWORD',
              '--raw',
              ...(pending.method ? ['--method', METHOD_FLAGS[pending.method]] : []),
            ],
            {
              password: input.password,
              prompt: (prompt) => this.answerPrompt(prompt, pending, email),
            },
          );
          finish();
          return session;
        } catch (error) {
          this.assertGeneration(generation);
          if (pending.failure) throw pending.failure;
          if (pending.restart) continue;
          if (error instanceof CodeRejectedError && pending.attempts < MAX_CODE_ATTEMPTS) {
            pending.rejection = error.message;
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      finish();
      if (generation === this.generation) this.publish();
      throw error;
    }
  }

  private async answerPrompt(prompt: CliPrompt, pending: PendingLogin, email: string) {
    if (this.pending !== pending) return undefined;
    if (prompt.kind === 'unknown') {
      pending.failure = new UserError(
        'Bitwarden asked a question Latch cannot answer. Use Personal API key sign-in.',
      );
      return undefined;
    }
    const challenge: LoginChallenge =
      prompt.kind === 'two-step-method'
        ? { kind: 'method', email, methods: prompt.methods.length ? prompt.methods : ALL_METHODS }
        : {
            kind: prompt.kind === 'new-device-code' ? 'new-device' : 'code',
            email,
            methods: [],
            ...(pending.method ? { method: pending.method } : {}),
          };
    if (pending.rejection) challenge.error = pending.rejection;
    pending.rejection = undefined;
    this.state.challenge = challenge;
    this.publish();
    const answer = await new Promise<ChallengeAnswer>((settle) => {
      pending.settle = settle;
    });
    pending.settle = undefined;
    if ('cancel' in answer) return undefined;
    if ('method' in answer) {
      pending.method = answer.method;
      pending.restart = true;
      return undefined;
    }
    pending.attempts += 1;
    return answer.code.replace(/\s+/g, '');
  }

  async unlock(password: string) {
    if (this.state.status !== 'locked') throw new UserError('The vault is not locked.');
    const generation = ++this.generation;
    const session = await this.cli.run(
      ['unlock', '--passwordenv', 'LATCH_MASTER_PASSWORD', '--raw'],
      { password },
    );
    this.assertGeneration(generation);
    this.session = session;
    await this.load(generation);
    // The old key died with the lock, so replace what Touch ID will hand back.
    await this.rememberForTouchId(session, generation);
    this.assertGeneration(generation);
    return this.publish();
  }

  /**
   * Touch ID is on by default: a password unlock keeps the session key while
   * macOS offers Touch ID, unless the user turned it off in Settings. Failing
   * to keep it only costs Touch ID, so it never fails the unlock.
   */
  private async rememberForTouchId(session: string, generation: number) {
    if (!this.sessions) return;
    this.assertGeneration(generation);
    if (
      this.sessions.enabled() ||
      (!this.sessions.declined() && this.sessions.status() === 'ready')
    ) {
      await this.sessions.keep(session).catch(() => undefined);
      if (generation !== this.generation) await this.sessions.forget();
      this.assertGeneration(generation);
    }
  }

  /** Reopens the vault with the session key Touch ID just released. */
  async unlockWithBiometrics() {
    if (this.state.status !== 'locked') throw new UserError('The vault is not locked.');
    if (!this.sessions?.enabled()) throw new UserError('Touch ID is not set up for this vault.');
    const generation = ++this.generation;
    const session = await this.sessions.recall().catch(() => {
      throw new UserError('Touch ID did not confirm it was you.');
    });
    this.assertGeneration(generation);
    this.session = session;
    try {
      await this.load(generation);
    } catch {
      this.assertGeneration(generation);
      // A key that no longer opens the vault is worse than keeping none.
      await this.sessions.forget();
      if (generation === this.generation) this.publish();
      throw new UserError('Touch ID could not open this vault. Use your master password.');
    }
    return this.publish();
  }

  /** Starts or stops keeping the session key for Touch ID. */
  async setBiometrics(enabled: boolean) {
    if (!this.sessions) throw new UserError('Touch ID is not available on this Mac.');
    if (enabled && this.sessions.status() !== 'ready')
      throw new UserError('macOS is not offering Touch ID right now.');
    if (!enabled) {
      await this.sessions.forget(true);
      // The stored session is no longer usable after bw lock. Keep the UI and
      // its cached credentials locked too, then prepare a password-only worker.
      return this.lock();
    }
    this.requireUnlocked();
    const generation = this.generation;
    await this.sessions.keep(this.session);
    if (generation !== this.generation) {
      await this.sessions.forget();
      this.assertGeneration(generation);
    }
    return this.publish();
  }

  async lock(prepare = true) {
    const generation = ++this.generation;
    const locking = !this.sessions?.enabled() && this.cli.lock ? this.cli.lock() : undefined;
    if (!locking) this.cli.cancel();
    this.session = '';
    this.ciphers.clear();
    this.trashLoaded = false;
    this.trashLoading = undefined;
    this.captured = undefined;
    this.pending?.settle?.({ cancel: true });
    delete this.state.challenge;
    if (this.state.status !== 'signed-out') this.state.status = 'locked';
    this.countItems();
    this.publish();
    // `bw lock` destroys the session key, so the CLI stays open while Touch ID
    // is the way back in. What guards the vault then is the stored key.
    if (locking) await locking;
    else if (!this.sessions?.enabled()) await this.cli.run(['lock']);
    if (
      prepare &&
      generation === this.generation &&
      this.state.status === 'locked' &&
      !this.sessions?.enabled()
    )
      void this.cli.prepare?.().catch(() => undefined);
    return this.snapshot();
  }

  async logout() {
    await this.sessions?.forget();
    await this.lock(false);
    await this.cli.run(['logout']);
    this.state = {
      status: 'signed-out',
      email: '',
      server: this.state.server,
      lastSync: null,
      itemCount: 0,
      trashCount: 0,
    };
    return this.publish();
  }

  async sync() {
    this.requireUnlocked();
    const generation = this.generation;
    await this.cli.run(['sync'], { session: this.session });
    this.assertGeneration(generation);
    await this.load(generation);
    this.state.lastSync = new Date().toISOString();
    return this.publish();
  }

  items(): ItemSummary[] {
    this.requireUnlocked();
    return this.listing((cipher) => !cipher.deletedDate);
  }

  /** Items sitting in Bitwarden's trash, which another client can restore. */
  async trash(): Promise<ItemSummary[]> {
    this.requireUnlocked();
    if (!this.trashLoaded) {
      const generation = this.generation;
      const version = this.itemsRevision;
      const loading = (this.trashLoading ??= this.loadTrash(generation, version));
      try {
        await loading;
      } finally {
        if (this.trashLoading === loading) this.trashLoading = undefined;
      }
      this.assertGeneration(generation);
      this.requireUnlocked();
      if (!this.trashLoaded) return this.trash();
    }
    return this.listing((cipher) => Boolean(cipher.deletedDate));
  }

  private async loadTrash(generation: number, version: number) {
    const trashed = JSON.parse(
      await this.cli.run(['list', 'items', '--trash'], { session: this.session }),
    ) as Cipher[];
    this.assertGeneration(generation);
    if (version !== this.itemsRevision) return;
    for (const [id, cipher] of this.ciphers) if (cipher.deletedDate) this.ciphers.delete(id);
    for (const cipher of trashed) this.ciphers.set(cipher.id, cacheFields(cipher));
    this.trashLoaded = true;
    this.countItems(false);
    this.publish();
  }

  private listing(include: (cipher: Cipher) => boolean) {
    return (
      [...this.ciphers.values()]
        .filter(include)
        .map(summarize)
        // Measured faster here than a shared Intl.Collator, which V8 beats with
        // its own fast path for these names.
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  detail(id: string): ItemDetail {
    const cipher = this.item(id);
    if (isRestricted(cipher))
      throw new UserError(
        'Use the official Bitwarden client for shared or password-protected items.',
      );
    return {
      ...summarize(cipher),
      password: cipher.login?.password ?? '',
      notes: cipher.notes ?? '',
      revisionDate: cipher.revisionDate ?? null,
      createdDate: cipher.creationDate ?? null,
      editable: isEditable(cipher) && !cipher.deletedDate,
      deletable: isRemovable(cipher) && !cipher.deletedDate,
      restorable: isRemovable(cipher) && Boolean(cipher.deletedDate),
    };
  }

  /** Moves an item to Bitwarden's trash, where it can still be restored. */
  async remove(id: string) {
    this.requireUnlocked();
    const generation = this.generation;
    const cipher = this.item(id);
    if (!isRemovable(cipher))
      throw new UserError('Delete this item in the official Bitwarden client.');
    if (cipher.deletedDate) throw new UserError('This item is already in the trash.');
    await this.cli.run(['delete', 'item', id], { session: this.session });
    this.assertGeneration(generation);
    this.mark(id, new Date().toISOString());
    return this.publish();
  }

  /** Brings an item back out of the trash. */
  async restore(id: string) {
    this.requireUnlocked();
    const generation = this.generation;
    const cipher = this.item(id);
    if (!cipher.deletedDate) throw new UserError('This item is not in the trash.');
    await this.cli.run(['restore', 'item', id], { session: this.session });
    this.assertGeneration(generation);
    this.mark(id, null);
    return this.publish();
  }

  private mark(id: string, deletedDate: string | null) {
    const cipher = this.ciphers.get(id);
    if (cipher) cipher.deletedDate = deletedDate;
    this.countItems();
  }

  private countItems(changed = true) {
    if (changed) ++this.itemsRevision;
    let active = 0;
    let trashed = 0;
    for (const cipher of this.ciphers.values()) {
      if (cipher.deletedDate) trashed++;
      else active++;
    }
    this.state.itemCount = active;
    this.state.trashCount = trashed;
  }

  matches(url: string): BrowserMatches {
    if (this.state.status !== 'unlocked') return { state: this.state.status, items: [] };
    if (!fillableUrl(url)) return { state: 'unlocked', items: [] };
    return {
      state: 'unlocked',
      items: [...this.ciphers.values()]
        .filter((cipher) => canFill(cipher, url))
        .map(summarize)
        .slice(0, 12),
    };
  }

  /** Only non-secret, fillable identities go to Apple's suggestion index. */
  autoFillIdentities(): (PasswordIdentity | PasskeyIdentity)[] {
    if (this.state.status !== 'unlocked') return [];
    const identities = new Map<string, PasswordIdentity | PasskeyIdentity>();
    for (const cipher of this.ciphers.values()) {
      for (const credential of passkeysOf(cipher)) {
        const raw = credentialIdBytes(credential.credentialId)!;
        identities.set(`passkey:${cipher.id}:${credential.credentialId}`, {
          kind: 'passkey',
          id: cipher.id,
          rpId: credential.rpId,
          userName: credential.userName || cipher.login?.username || '',
          credentialId: toBase64Url(raw),
          userHandle: credential.userHandle ?? '',
        });
      }
      for (const uri of cipher.login?.uris ?? []) {
        // Apple's suggestion identity is not the current page URL. Keep exact
        // and prefix rules in the picker, where macOS supplies the target URL.
        // Never publish saved URL paths, queries or fragments to the OS index.
        if (!uri.uri || uri.match === 2 || uri.match === 3) continue;
        const url = webUrl(uri.uri.includes('://') ? uri.uri : `https://${uri.uri}`)?.origin;
        if (!url || !matchesUri(uri, url) || !canFill(cipher, url)) continue;
        identities.set(`${cipher.id}:${url}`, {
          kind: 'password',
          id: cipher.id,
          username: cipher.login?.username ?? '',
          url,
        });
      }
    }
    return [...identities.values()];
  }

  /**
   * Notices a sign-in the browser just watched, and decides whether it is worth
   * offering to save. Nothing is held while the vault is locked, so a captured
   * password never outlives the lock that was supposed to clear it.
   */
  capture(url: string, username: string, password: string): CaptureOffer {
    this.captured = undefined;
    if (this.state.status !== 'unlocked' || !password) return { action: 'none' };
    const site = fillableUrl(url);
    if (!site) return { action: 'none' };
    // Items with passkeys still count as saved; Latch just never edits them.
    const known = [...this.ciphers.values()].filter(
      (cipher) =>
        cipher.type === 1 &&
        !cipher.deletedDate &&
        !isRestricted(cipher) &&
        (cipher.login?.uris ?? []).some((uri) => matchesUri(uri, url)),
    );
    // The same password on this site is already saved, even when the page took
    // an email for a saved username, or asked for the password alone.
    if (known.some((cipher) => (cipher.login?.password ?? '') === password))
      return { action: 'none' };
    const account = username.trim().toLocaleLowerCase();
    const match = known.find(
      (cipher) => (cipher.login?.username ?? '').trim().toLocaleLowerCase() === account,
    );
    // Without a username there is no telling which saved account changed.
    if ((match && !isEditable(match)) || (!account && known.length)) return { action: 'none' };
    const at = Date.now();
    if (match) {
      this.captured = {
        action: 'update',
        id: match.id,
        name: match.name,
        origin: site.origin,
        username,
        password,
        at,
      };
      return { action: 'update', name: match.name };
    }
    const name = site.hostname.replace(/^www\./, '');
    this.captured = { action: 'save', name, origin: site.origin, username, password, at };
    return { action: 'save', name };
  }

  /** The offer still standing for this page, if the user has not left it behind. */
  pendingCapture(url: string): CaptureOffer {
    const captured = this.freshCapture(url);
    return captured ? { action: captured.action, name: captured.name } : { action: 'none' };
  }

  dismissCapture() {
    this.captured = undefined;
    return { action: 'none' as const };
  }

  /** Writes the sign-in the user just agreed to keep. */
  async commitCapture(url: string) {
    const captured = this.freshCapture(url);
    if (!captured) throw new UserError('That sign-in is no longer waiting to be saved.');
    this.captured = undefined;
    if (captured.action === 'update') {
      const existing = this.item(captured.id!);
      await this.save({
        id: captured.id!,
        revisionDate: existing.revisionDate ?? null,
        name: existing.name,
        username: captured.username,
        password: captured.password,
        website: existing.login?.uris?.[0]?.uri ?? captured.origin,
        notes: existing.notes ?? '',
        favorite: Boolean(existing.favorite),
      });
      return { action: 'update' as const, name: existing.name };
    }
    await this.save({
      name: captured.name,
      username: captured.username,
      password: captured.password,
      website: captured.origin,
      notes: '',
      favorite: false,
    });
    return { action: 'save' as const, name: captured.name };
  }

  private freshCapture(url: string) {
    const captured = this.captured;
    if (!captured || this.state.status !== 'unlocked') return undefined;
    if (Date.now() - captured.at > CAPTURE_TIMEOUT_MS) {
      this.captured = undefined;
      return undefined;
    }
    return fillableUrl(url)?.origin === captured.origin ? captured : undefined;
  }

  fill(id: string, url: string) {
    const cipher = this.item(id);
    if (!canFill(cipher, url))
      throw new UserError('This login does not match the current website.');
    return { username: cipher.login?.username ?? '', password: cipher.login?.password ?? '' };
  }

  /** Passkeys for a relying party, limited to the identifiers it allows when it names any. */
  passkeys(rpId: string, allowed: Uint8Array[] = []): PasskeyMatch[] {
    if (this.state.status !== 'unlocked' || !isValidRpId(rpId)) return [];
    const matches: PasskeyMatch[] = [];
    for (const cipher of this.ciphers.values()) {
      for (const credential of passkeysOf(cipher)) {
        if (credential.rpId.toLowerCase() !== rpId.toLowerCase()) continue;
        const raw = credentialIdBytes(credential.credentialId)!;
        if (allowed.length && !allowed.some((id) => id.length === raw.length && raw.equals(id)))
          continue;
        matches.push({
          id: cipher.id,
          name: cipher.name || 'Untitled',
          userName: credential.userName || cipher.login?.username || '',
          credentialId: toBase64Url(raw),
          userHandle: credential.userHandle ?? '',
          rpId: credential.rpId,
        });
      }
    }
    return matches.slice(0, 16);
  }

  /**
   * Signs a WebAuthn assertion with a stored passkey. The signature counter is
   * written back first when the credential uses one, so a failed write fails
   * the sign-in instead of desynchronising the relying party.
   */
  async assertPasskey(input: {
    id: string;
    credentialId: string;
    rpId: string;
    clientDataHash: string;
    userVerified: boolean;
  }) {
    const cipher = this.item(input.id);
    const generation = this.generation;
    const raw = fromBase64Url(input.credentialId);
    const credential = passkeysOf(cipher).find((entry) => sameCredential(entry.credentialId, raw));
    if (!credential || credential.rpId.toLowerCase() !== input.rpId.toLowerCase())
      throw new UserError('This passkey does not belong to this website.');
    const clientDataHash = fromBase64Url(input.clientDataHash);
    if (clientDataHash.length !== 32) throw new UserError('The sign-in request is malformed.');
    const counter = Number(credential.counter) || 0;
    const next = counter > 0 ? counter + 1 : 0;
    if (next > 0) {
      await this.writeCounter(cipher.id, credential.credentialId, next);
      this.assertGeneration(generation);
    }
    const authData = authenticatorData({
      rpId: input.rpId,
      counter: next,
      userVerified: input.userVerified,
    });
    return {
      credentialId: input.credentialId,
      userHandle: credential.userHandle ?? '',
      authenticatorData: toBase64Url(authData),
      signature: toBase64Url(signAssertion(credential.keyValue, authData, clientDataHash)),
    };
  }

  private async writeCounter(id: string, credentialId: string, counter: number) {
    const latest = JSON.parse(
      await this.cli.run(['get', 'item', id], { session: this.session }),
    ) as Cipher;
    const credential = latest.login?.fido2Credentials?.find(
      (entry) => entry.credentialId === credentialId,
    );
    if (!credential) throw new UserError('This passkey is no longer in your vault. Sync Latch.');
    credential.counter = String(Math.max(counter, (Number(credential.counter) || 0) + 1));
    const payload = Buffer.from(JSON.stringify(latest)).toString('base64');
    const saved = JSON.parse(
      await this.cli.run(['edit', 'item', id], { session: this.session, input: payload }),
    ) as Cipher;
    this.ciphers.set(saved.id, cacheFields(saved));
    this.publish();
  }

  /** Creates a passkey for a relying party as a new login item, as Bitwarden's clients do. */
  async registerPasskey(input: {
    rpId: string;
    rpName: string;
    userName: string;
    userDisplayName: string;
    userHandle: string;
    clientDataHash: string;
    algorithms: number[];
    excluded: string[];
    userVerified: boolean;
  }) {
    this.requireUnlocked();
    const generation = this.generation;
    if (!isValidRpId(input.rpId))
      throw new UserError('This website did not provide a valid passkey identifier.');
    if (!input.algorithms.includes(ES256))
      throw new UserError('This website does not accept the key type Latch can create.');
    const clientDataHash = fromBase64Url(input.clientDataHash);
    if (clientDataHash.length !== 32) throw new UserError('The passkey request is malformed.');
    const userHandle = fromBase64Url(input.userHandle);
    if (!userHandle.length || userHandle.length > 64)
      throw new UserError('This website sent an unusable account identifier.');
    const excluded = input.excluded.map((value) => fromBase64Url(value));
    for (const cipher of this.ciphers.values())
      for (const credential of passkeysOf(cipher))
        if (excluded.some((raw) => sameCredential(credential.credentialId, raw)))
          throw new UserError('A passkey for this account is already saved in Latch.');
    const key = createCredentialKey();
    const credential: Fido2Credential = {
      credentialId: key.credentialId,
      keyType: 'public-key',
      keyAlgorithm: 'ECDSA',
      keyCurve: 'P-256',
      keyValue: key.keyValue,
      rpId: input.rpId,
      userHandle: toBase64Url(userHandle),
      userName: input.userName,
      counter: '0',
      rpName: input.rpName || input.rpId,
      userDisplayName: input.userDisplayName || input.userName,
      discoverable: 'true',
      creationDate: new Date().toISOString(),
    };
    const cipher: Cipher = {
      id: '',
      type: 1,
      name: input.rpName || input.rpId,
      organizationId: null,
      collectionIds: [],
      folderId: null,
      reprompt: 0,
      favorite: false,
      notes: null,
      login: {
        username: input.userName,
        password: null,
        uris: [{ uri: `https://${input.rpId}`, match: null }],
        fido2Credentials: [credential],
      },
    };
    const payload = Buffer.from(JSON.stringify(cipher)).toString('base64');
    const saved = JSON.parse(
      await this.cli.run(['create', 'item'], { session: this.session, input: payload }),
    ) as Cipher;
    this.assertGeneration(generation);
    this.ciphers.set(saved.id, cacheFields(saved));
    this.countItems();
    this.state.lastSync = new Date().toISOString();
    this.publish();
    const raw = credentialIdBytes(key.credentialId)!;
    const authData = authenticatorData({
      rpId: input.rpId,
      counter: 0,
      userVerified: input.userVerified,
      attested: { credentialId: raw, publicKeyDer: key.publicKeyDer },
    });
    return {
      credentialId: toBase64Url(raw),
      attestationObject: toBase64Url(attestationObject(authData)),
    };
  }

  async setFavorite(id: string, favorite: boolean) {
    const existing = this.item(id);
    if (existing.deletedDate || !isEditable(existing))
      throw new UserError('Update this item in the official Bitwarden client.');
    const generation = this.generation;
    // Read the complete, latest cipher so a metadata change preserves unknown fields.
    const latest = JSON.parse(
      await this.cli.run(['get', 'item', id], { session: this.session }),
    ) as Cipher;
    this.assertGeneration(generation);
    if (latest.deletedDate || !isEditable(latest))
      throw new UserError('Update this item in the official Bitwarden client.');
    const payload = Buffer.from(JSON.stringify({ ...latest, favorite })).toString('base64');
    const saved = JSON.parse(
      await this.cli.run(['edit', 'item', id], { session: this.session, input: payload }),
    ) as Cipher;
    this.assertGeneration(generation);
    this.ciphers.set(saved.id, cacheFields(saved));
    this.countItems();
    this.publish();
    return summarize(saved);
  }

  async save(draft: LoginDraft) {
    this.requireUnlocked();
    const generation = this.generation;
    if (draft.website && !webUrl(draft.website))
      throw new UserError('Enter a full website address, like https://example.com.');
    let cipher: Cipher;
    if (draft.id) {
      const existing = this.item(draft.id);
      if (!isEditable(existing))
        throw new UserError('Edit this item in the official Bitwarden client.');
      const latest = JSON.parse(
        await this.cli.run(['get', 'item', draft.id], { session: this.session }),
      ) as Cipher;
      if (latest.revisionDate !== draft.revisionDate)
        throw new UserError('This item changed elsewhere. Sync, reopen it, and try again.');
      if (!isEditable(latest))
        throw new UserError('Edit this item in the official Bitwarden client.');
      cipher = { ...latest, login: { ...latest.login } };
    } else {
      cipher = {
        id: '',
        type: 1,
        name: '',
        organizationId: null,
        collectionIds: [],
        folderId: null,
        reprompt: 0,
        login: { uris: [] },
      };
    }
    this.assertGeneration(generation);
    Object.assign(cipher, {
      name: draft.name,
      notes: draft.notes || null,
      favorite: draft.favorite,
    });
    if (cipher.type === 2) {
      // A secure note keeps its text in notes and has no login to write.
      delete cipher.login;
      cipher.secureNote ??= { type: 0 };
    } else {
      const previousUris = cipher.login?.uris ?? [];
      const nextUris = draft.website
        ? [
            {
              ...previousUris[0],
              uri: draft.website,
              match: previousUris[0]?.match ?? null,
            },
            ...previousUris.slice(1),
          ]
        : previousUris.slice(1);
      cipher.login = {
        ...cipher.login,
        username: draft.username,
        password: draft.password,
        uris: nextUris,
      };
    }
    const payload = Buffer.from(JSON.stringify(cipher)).toString('base64');
    const args = draft.id ? ['edit', 'item', draft.id] : ['create', 'item'];
    const saved = JSON.parse(
      await this.cli.run(args, { session: this.session, input: payload }),
    ) as Cipher;
    this.assertGeneration(generation);
    this.ciphers.set(saved.id, cacheFields(saved));
    this.countItems();
    this.state.lastSync = new Date().toISOString();
    this.publish();
    return this.detail(saved.id);
  }

  private async load(generation: number) {
    try {
      const items = JSON.parse(
        await this.cli.run(['list', 'items'], { session: this.session }),
      ) as Cipher[];
      this.assertGeneration(generation);
      this.trashLoaded = false;
      this.trashLoading = undefined;
      this.ciphers = new Map(
        items.filter((item) => !item.deletedDate).map((item) => [item.id, cacheFields(item)]),
      );
      this.state.status = 'unlocked';
      this.countItems();
    } catch (error) {
      if (generation === this.generation) {
        this.cli.cancel();
        this.session = '';
        this.ciphers.clear();
        this.trashLoaded = false;
        this.trashLoading = undefined;
        this.state.status = 'locked';
        this.countItems();
        this.publish();
      }
      throw error;
    }
  }

  private item(id: string) {
    this.requireUnlocked();
    const cipher = this.ciphers.get(id);
    if (!cipher) throw new UserError('This item is no longer available. Sync your vault.');
    return cipher;
  }

  private requireUnlocked() {
    if (this.state.status !== 'unlocked' || !this.session)
      throw new UserError('Unlock Latch to continue.');
  }

  private assertGeneration(generation: number) {
    if (generation !== this.generation)
      throw new UserError('The vault was locked. Please unlock it again.');
  }

  private publish() {
    ++this.revision;
    const state = this.snapshot();
    this.emit('state', state);
    return state;
  }
}

function isRestricted(cipher: Cipher) {
  return Boolean(cipher.organizationId || cipher.reprompt);
}
function cacheFields(cipher: Cipher): Cipher {
  return {
    id: cipher.id,
    name: cipher.name,
    type: cipher.type,
    favorite: cipher.favorite,
    organizationId: cipher.organizationId,
    reprompt: cipher.reprompt,
    revisionDate: cipher.revisionDate,
    creationDate: cipher.creationDate,
    deletedDate: cipher.deletedDate,
    notes: isRestricted(cipher) ? null : cipher.notes,
    login: {
      username: isRestricted(cipher) ? null : cipher.login?.username,
      password: isRestricted(cipher) ? null : cipher.login?.password,
      uris: cipher.login?.uris,
      fido2Credentials: isRestricted(cipher)
        ? cipher.login?.fido2Credentials?.length
          ? [{ credentialId: '' } as Fido2Credential]
          : []
        : (cipher.login?.fido2Credentials ?? []),
    },
  };
}
/** The passkeys on an item that this Mac can sign with. */
function passkeysOf(cipher: Cipher): Fido2Credential[] {
  if (cipher.type !== 1 || cipher.deletedDate || isRestricted(cipher)) return [];
  return (cipher.login?.fido2Credentials ?? []).filter(usableCredential);
}
/** Whether Latch will move an item to the trash. Type does not matter here. */
function isRemovable(cipher: Cipher) {
  return !isRestricted(cipher) && !cipher.login?.fido2Credentials?.length;
}
function isEditable(cipher: Cipher) {
  return (
    (cipher.type === 1 || cipher.type === 2) &&
    !isRestricted(cipher) &&
    !cipher.login?.fido2Credentials?.length
  );
}
function canFill(cipher: Cipher, url: string) {
  return (
    cipher.type === 1 &&
    !cipher.deletedDate &&
    !isRestricted(cipher) &&
    Boolean(cipher.login?.password) &&
    (cipher.login?.uris ?? []).some((uri) => matchesUri(uri, url))
  );
}
function summarize(cipher: Cipher): ItemSummary {
  return {
    id: cipher.id,
    name: cipher.name || 'Untitled',
    username: isRestricted(cipher) ? '' : (cipher.login?.username ?? ''),
    website: cipher.login?.uris?.[0]?.uri ?? '',
    type: cipher.type,
    favorite: Boolean(cipher.favorite),
    hasPasskey: Boolean(cipher.login?.fido2Credentials?.length),
    restricted: isRestricted(cipher),
  };
}

export function generatePassword(options: PasswordOptions) {
  const groups = [
    options.lowercase ? 'abcdefghijklmnopqrstuvwxyz' : '',
    options.uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '',
    options.numbers ? '0123456789' : '',
    options.symbols ? '!@#$%&*-_=+' : '',
  ]
    .map((group) => (options.excludeAmbiguous ? group.replace(/[Il1O0o]/g, '') : group))
    .filter(Boolean);
  const alphabet = groups.join('');
  // Rejection sampling keeps passwords uniform while including every selected type.
  while (true) {
    const characters = Array.from({ length: options.length }, () =>
      alphabet.charAt(randomInt(alphabet.length)),
    );
    if (groups.every((group) => characters.some((character) => group.includes(character))))
      return characters.join('');
  }
}
