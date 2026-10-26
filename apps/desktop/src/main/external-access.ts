import { app } from 'electron';
import { UserError } from '@latch/shared/protocol';
import type { VerifiedPeer } from './local-transport';
import type { MacAutoFill } from './macos-autofill';

type Client = 'browser' | 'raycast';

export class ExternalAccess {
  private readonly grantEpochs = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();
  private sessionPrompts: number[] = [];
  private readonly enforced = process.platform === 'darwin' && app.isPackaged;

  constructor(
    private readonly presence: MacAutoFill,
    private readonly epoch: () => number,
  ) {}

  private key(client: Client, peer?: VerifiedPeer) {
    if (!peer) throw new UserError('Could not verify the local client.');
    return `${client}:${peer.launcher?.key ?? peer.auditToken}`;
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
    if (this.grantEpochs.get(key) === currentEpoch) return;
    let pending = this.pending.get(key);
    if (!pending) {
      this.sessionPrompts = this.limit(this.sessionPrompts, 6);
      const name = peer?.launcher?.name ?? 'an unrecognized app';
      pending = (async () => {
        await this.presence.requirePresence(`give ${name} access to your vault`);
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
    const epoch = this.epoch();
    for (const [entry, granted] of this.grantEpochs)
      if (granted !== epoch) this.grantEpochs.delete(entry);
    this.grantEpochs.set(key, epoch);
    if (this.grantEpochs.size > 100) this.grantEpochs.delete(this.grantEpochs.keys().next().value!);
  }
}
