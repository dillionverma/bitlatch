import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { CodeRejectedError, type CliPort, type CliPrompt } from './cli';
import { fillableUrl, matchesUri, normalizeServer, webUrl, type CipherUri } from './matching';
import { UserError } from '../shared/protocol';
import type { SessionStore } from './biometrics';
import type {
  BrowserMatches,
  CaptureOffer,
  ChallengeAnswer,
  ItemDetail,
  ItemSummary,
  LoginChallenge,
  LoginDraft,
  LoginInput,
  TwoStepMethod,
  VaultState,
} from '../shared/types';

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
    fido2Credentials?: unknown[];
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

export class Vault extends EventEmitter {
  private session = '';
  private ciphers = new Map<string, Cipher>();
  private generation = 0;
  private pending?: PendingLogin;
  private captured?: Captured;
  private state: Omit<VaultState, 'biometrics' | 'biometricsOn'> = {
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
    return { ...this.state, ...this.biometrics() };
  }

  async initialize() {
    const status = JSON.parse(await this.cli.run(['status'])) as {
      status: string;
      userEmail?: string;
      serverUrl?: string;
      lastSync?: string;
    };
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
    if (this.sessions?.enabled()) await this.sessions.keep(session);
    return this.publish();
  }

  /** Reopens the vault with the session key Touch ID just released. */
  async unlockWithBiometrics() {
    if (this.state.status !== 'locked') throw new UserError('The vault is not locked.');
    if (!this.sessions?.enabled()) throw new UserError('Touch ID is not set up for this vault.');
    const session = await this.sessions.recall().catch(() => {
      throw new UserError('Touch ID did not confirm it was you.');
    });
    const generation = ++this.generation;
    this.session = session;
    try {
      await this.load(generation);
    } catch {
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
      await this.sessions.forget();
      // The CLI was left open for Touch ID, so close it now.
      await this.cli.run(['lock']).catch(() => undefined);
      return this.publish();
    }
    this.requireUnlocked();
    await this.sessions.keep(this.session);
    return this.publish();
  }

  async lock() {
    ++this.generation;
    this.cli.cancel();
    this.session = '';
    this.ciphers.clear();
    this.captured = undefined;
    if (this.state.status !== 'signed-out') this.state.status = 'locked';
    this.countItems();
    this.publish();
    // `bw lock` destroys the session key, so the CLI stays open while Touch ID
    // is the way back in. What guards the vault then is the stored key.
    if (!this.sessions?.enabled()) await this.cli.run(['lock']);
    return this.snapshot();
  }

  async logout() {
    await this.sessions?.forget();
    await this.lock();
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
  trash(): ItemSummary[] {
    this.requireUnlocked();
    return this.listing((cipher) => Boolean(cipher.deletedDate));
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

  private countItems() {
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
    const known = [...this.ciphers.values()].filter(
      (cipher) =>
        cipher.type === 1 &&
        !cipher.deletedDate &&
        !isRestricted(cipher) &&
        !cipher.login?.fido2Credentials?.length &&
        (cipher.login?.uris ?? []).some((uri) => matchesUri(uri, url)),
    );
    const match = known.find((cipher) => (cipher.login?.username ?? '') === username);
    if (match && (match.login?.password ?? '') === password) return { action: 'none' };
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
              ...(previousUris[0] ?? {}),
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
      // The trash is a separate listing; both are kept so it can be browsed.
      const trashed = JSON.parse(
        await this.cli.run(['list', 'items', '--trash'], { session: this.session }),
      ) as Cipher[];
      this.assertGeneration(generation);
      this.ciphers = new Map(
        [...items.filter((item) => !item.deletedDate), ...trashed].map((item) => [
          item.id,
          cacheFields(item),
        ]),
      );
      this.state.status = 'unlocked';
      this.countItems();
    } catch (error) {
      if (generation === this.generation) {
        this.session = '';
        this.ciphers.clear();
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
      fido2Credentials: cipher.login?.fido2Credentials?.length ? [{}] : [],
    },
  };
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

export function generatePassword(length = 24) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*-_=+';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}
