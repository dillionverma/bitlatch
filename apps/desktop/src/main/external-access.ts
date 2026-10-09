import { app } from 'electron';
import { UserError } from '@latch/shared/protocol';
import type { VerifiedPeer } from './local-transport';
import type { MacAutoFill } from './macos-autofill';

type Client = 'browser' | 'raycast';
const GRANT_MS = 10 * 60_000;

export class ExternalAccess {
  private readonly grants = new Map<string, { epoch: number; until: number }>();
  private readonly pending = new Map<string, Promise<void>>();
  private sessionPrompts: number[] = [];
  private secretPrompts: number[] = [];
  private readonly enforced = process.platform === 'darwin' && app.isPackaged;

  constructor(
    private readonly presence: MacAutoFill,
    private readonly epoch: () => number,
  ) {}

  private key(client: Client, peer?: VerifiedPeer) {
    if (!peer) throw new UserError('Could not verify the local client.');
    return `${client}:${peer.auditToken}`;
  }

  private limit(prompts: number[], maximum: number) {
    const now = Date.now();
    const recent = prompts.filter((time) => now - time < 60_000);
    if (recent.length >= maximum)
      throw new UserError('Too many vault access requests. Wait a minute and try again.');
    recent.push(now);
    return recent;
  }

  async require(client: Client, peer?: VerifiedPeer) {
    if (!this.enforced) return;
    const key = this.key(client, peer);
    const currentEpoch = this.epoch();
    const grant = this.grants.get(key);
    if (grant?.epoch === currentEpoch && grant.until > Date.now()) return;
    let pending = this.pending.get(key);
    if (!pending) {
      this.sessionPrompts = this.limit(this.sessionPrompts, 6);
      pending = (async () => {
        await this.presence.requirePresence(
          client === 'browser'
            ? 'A local process requested browser access to Bitlatch. Approve only if you just used the extension.'
            : 'A local process requested Raycast access to Bitlatch. Approve only if you just used Raycast.',
        );
        if (this.epoch() !== currentEpoch)
          throw new UserError('Vault locked. Try again after unlocking.');
        this.grant(client, peer);
      })().finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    await pending;
  }

  grant(client: Client, peer?: VerifiedPeer) {
    if (!this.enforced) return;
    const key = this.key(client, peer);
    for (const [entry, grant] of this.grants) {
      if (grant.epoch !== this.epoch() || grant.until <= Date.now()) this.grants.delete(entry);
    }
    this.grants.set(key, { epoch: this.epoch(), until: Date.now() + GRANT_MS });
    if (this.grants.size > 100) this.grants.delete(this.grants.keys().next().value!);
  }

  async requireFresh(reason: string, peer?: VerifiedPeer) {
    if (!this.enforced) return;
    this.key('raycast', peer);
    this.secretPrompts = this.limit(this.secretPrompts, 30);
    const currentEpoch = this.epoch();
    await this.presence.requirePresence(reason);
    if (this.epoch() !== currentEpoch)
      throw new UserError('Vault locked. Try again after unlocking.');
  }
}
