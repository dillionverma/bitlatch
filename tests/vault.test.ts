import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Vault, type Cipher } from '../src/desktop/vault';
import type { CliPort, RunOptions } from '../src/desktop/cli';

class FakeCli implements CliPort {
  commands: { args: string[]; options: RunOptions }[] = [];
  items: Cipher[] = [];
  canceled = 0;
  cancel() {
    this.canceled++;
  }
  async run(args: string[], options: RunOptions = {}) {
    this.commands.push({ args, options });
    if (args[0] === 'status')
      return JSON.stringify({ status: 'locked', userEmail: 'test@example.test' });
    if (args[0] === 'unlock' || args[0] === 'login') return 'test-session';
    if (args[0] === 'list') return JSON.stringify(this.items);
    if (args[0] === 'get') return JSON.stringify(this.items.find((item) => item.id === args[2]));
    if (args[0] === 'create' || args[0] === 'edit') {
      const item = JSON.parse(Buffer.from(options.input!, 'base64').toString()) as Cipher;
      return JSON.stringify({
        ...item,
        id: item.id || randomUUID(),
        revisionDate: '2026-09-16T00:00:01Z',
      });
    }
    return '';
  }
}

function login(overrides: Partial<Cipher> = {}): Cipher {
  return {
    id: randomUUID(),
    name: 'Example',
    type: 1,
    revisionDate: '2026-09-16T00:00:00Z',
    login: {
      username: 'test',
      password: 'synthetic-password',
      uris: [{ uri: 'https://example.com', match: null }],
    },
    ...overrides,
  };
}

describe('vault boundaries', () => {
  let cli: FakeCli;
  let vault: Vault;
  beforeEach(async () => {
    cli = new FakeCli();
    vault = new Vault(cli);
    await vault.initialize();
  });
  it('never returns passwords in summaries and rejects secret reads after locking', async () => {
    const item = login();
    cli.items = [item];
    await vault.unlock('fixture-password');
    expect(JSON.stringify(vault.items())).not.toContain('synthetic-password');
    expect(vault.fill(item.id, 'https://example.com').password).toBe('synthetic-password');
    await vault.lock();
    expect(() => vault.detail(item.id)).toThrow('Unlock Latch');
    expect(() => vault.fill(item.id, 'https://example.com')).toThrow('Unlock Latch');
    expect(vault.matches('https://example.com')).toEqual({ state: 'locked', items: [] });
  });
  it('fails closed for organization, reprompt, deleted, and mismatched logins', async () => {
    const own = login();
    cli.items = [
      own,
      login({ organizationId: 'org' }),
      login({ reprompt: 1 }),
      login({ deletedDate: '2026-01-01' }),
    ];
    await vault.unlock('fixture-password');
    expect(vault.items()).toHaveLength(3);
    expect(vault.matches('https://example.com').items.map((item) => item.id)).toEqual([own.id]);
    expect(() => vault.fill(own.id, 'https://evil.test')).toThrow('does not match');
    expect(() => vault.detail(cli.items[1]!.id)).toThrow('official Bitwarden');
  });
  it('preserves unknown fields, extra URIs, custom fields and login fields when editing', async () => {
    const item = login({
      futureField: { important: true },
      fields: [{ name: 'secret custom field', value: 'fixture' }],
    });
    item.login!.totp = 'fixture-totp';
    item.login!.uris!.push({ uri: 'https://second.test', match: 1 });
    cli.items = [item];
    await vault.unlock('fixture-password');
    await vault.save({
      id: item.id,
      revisionDate: item.revisionDate,
      name: 'Renamed',
      username: 'new',
      password: 'changed',
      website: 'https://example.com',
      notes: '',
      favorite: true,
    });
    const write = cli.commands.find((command) => command.args[0] === 'edit')!;
    expect(write.args.join(' ')).not.toContain('changed');
    const payload = JSON.parse(Buffer.from(write.options.input!, 'base64').toString());
    expect(payload.futureField).toEqual({ important: true });
    expect(payload.fields).toEqual(item.fields);
    expect(payload.login.totp).toBe('fixture-totp');
    expect(payload.login.uris[1]).toEqual({ uri: 'https://second.test', match: 1 });
  });
  it('rejects stale writes and keeps passkey-bearing items read-only', async () => {
    const item = login();
    cli.items = [item];
    await vault.unlock('fixture-password');
    await expect(
      vault.save({
        id: item.id,
        revisionDate: 'older',
        name: 'Changed',
        username: '',
        password: '',
        website: '',
        notes: '',
        favorite: false,
      }),
    ).rejects.toThrow('changed elsewhere');
    cli.items = [login({ login: { fido2Credentials: [{ credentialId: 'fixture' }] } })];
    await vault.sync();
    expect(vault.detail(cli.items[0]!.id).editable).toBe(false);
  });
  it('does not revive an unlocked session when an in-flight unlock completes after a lock', async () => {
    let finishUnlock!: (session: string) => void;
    const original = cli.run.bind(cli);
    cli.run = (args, options) =>
      args[0] === 'unlock'
        ? new Promise<string>((resolve) => {
            finishUnlock = resolve;
          })
        : original(args, options);
    const pending = vault.unlock('fixture-password');
    await vault.lock();
    finishUnlock('late-session');
    await expect(pending).rejects.toThrow('vault was locked');
    expect(vault.snapshot().status).toBe('locked');
    expect(() => vault.items()).toThrow('Unlock Latch');
  });
});
