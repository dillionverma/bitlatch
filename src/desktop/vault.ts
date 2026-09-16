import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import type { CliPort } from './cli';
import { matchesUri, normalizeServer, webUrl, type CipherUri } from './matching';
import { UserError } from '../shared/protocol';
import type {
  BrowserMatches,
  ItemDetail,
  ItemSummary,
  LoginDraft,
  LoginInput,
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

export class Vault extends EventEmitter {
  private session = '';
  private ciphers = new Map<string, Cipher>();
  private generation = 0;
  private state: VaultState = {
    status: 'signed-out',
    email: '',
    server: 'https://vault.bitwarden.com',
    lastSync: null,
    itemCount: 0,
  };

  constructor(private readonly cli: CliPort) {
    super();
  }

  snapshot(): VaultState {
    return { ...this.state };
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
    await this.cli.run(['config', 'server', server]);
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
      session = await this.cli.run(
        [
          'login',
          input.email.trim().toLowerCase(),
          '--passwordenv',
          'LATCH_MASTER_PASSWORD',
          '--raw',
        ],
        { password: input.password },
      );
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
    return this.publish();
  }

  async lock() {
    ++this.generation;
    this.cli.cancel();
    this.session = '';
    this.ciphers.clear();
    if (this.state.status !== 'signed-out') this.state.status = 'locked';
    this.state.itemCount = 0;
    this.publish();
    await this.cli.run(['lock']);
    return this.snapshot();
  }

  async logout() {
    await this.lock();
    await this.cli.run(['logout']);
    this.state = {
      status: 'signed-out',
      email: '',
      server: this.state.server,
      lastSync: null,
      itemCount: 0,
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
    return [...this.ciphers.values()].map(summarize).sort((a, b) => a.name.localeCompare(b.name));
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
      editable: isEditable(cipher),
    };
  }

  matches(url: string): BrowserMatches {
    if (this.state.status !== 'unlocked') return { state: this.state.status, items: [] };
    if (!webUrl(url)) return { state: 'unlocked', items: [] };
    return {
      state: 'unlocked',
      items: [...this.ciphers.values()]
        .filter((cipher) => canFill(cipher, url))
        .map(summarize)
        .slice(0, 12),
    };
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
      throw new UserError('Enter a full HTTPS website address.');
    let cipher: Cipher;
    if (draft.id) {
      const existing = this.item(draft.id);
      if (!isEditable(existing))
        throw new UserError('Edit this item in the official Bitwarden client.');
      await this.cli.run(['sync'], { session: this.session });
      this.assertGeneration(generation);
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
    const previousUris = cipher.login?.uris ?? [];
    const nextUris = draft.website
      ? [
          { ...(previousUris[0] ?? {}), uri: draft.website, match: previousUris[0]?.match ?? null },
          ...previousUris.slice(1),
        ]
      : previousUris.slice(1);
    Object.assign(cipher, {
      name: draft.name,
      notes: draft.notes || null,
      favorite: draft.favorite,
    });
    cipher.login = {
      ...cipher.login,
      username: draft.username,
      password: draft.password,
      uris: nextUris,
    };
    const payload = Buffer.from(JSON.stringify(cipher)).toString('base64');
    const args = draft.id ? ['edit', 'item', draft.id] : ['create', 'item'];
    const saved = JSON.parse(
      await this.cli.run(args, { session: this.session, input: payload }),
    ) as Cipher;
    this.assertGeneration(generation);
    this.ciphers.set(saved.id, cacheFields(saved));
    this.state.itemCount = this.ciphers.size;
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
      this.ciphers = new Map(
        items.filter((item) => !item.deletedDate).map((item) => [item.id, cacheFields(item)]),
      );
      this.state.status = 'unlocked';
      this.state.itemCount = this.ciphers.size;
    } catch (error) {
      if (generation === this.generation) {
        this.session = '';
        this.ciphers.clear();
        this.state.status = 'locked';
        this.state.itemCount = 0;
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
    notes: isRestricted(cipher) ? null : cipher.notes,
    login: {
      username: isRestricted(cipher) ? null : cipher.login?.username,
      password: isRestricted(cipher) ? null : cipher.login?.password,
      uris: cipher.login?.uris,
      fido2Credentials: cipher.login?.fido2Credentials?.length ? [{}] : [],
    },
  };
}
function isEditable(cipher: Cipher) {
  return cipher.type === 1 && !isRestricted(cipher) && !cipher.login?.fido2Credentials?.length;
}
function canFill(cipher: Cipher, url: string) {
  return (
    cipher.type === 1 &&
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
