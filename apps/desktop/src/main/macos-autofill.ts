import { app } from 'electron';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { mkdir, rm, writeFile, rename } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { UserError } from '@latch/shared/protocol';
import type { MacAutoFillState } from '@latch/shared/types';
import type { Vault } from './vault';

const base64url = z
  .string()
  .max(2048)
  .regex(/^[\w-]*$/);
const rpId = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+$/i);
const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('matches'), urls: z.array(z.string().max(4096)).max(16) }).strict(),
  z.object({ type: z.literal('fill'), url: z.string().max(4096), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('passkeys'), rpId, allowed: z.array(base64url).max(64) }).strict(),
  z
    .object({
      type: z.literal('assert'),
      id: z.string().uuid(),
      rpId,
      credentialId: base64url,
      clientDataHash: base64url,
    })
    .strict(),
  z
    .object({
      type: z.literal('register'),
      rpId,
      userName: z.string().max(512),
      userHandle: base64url,
      clientDataHash: base64url,
      algorithms: z.array(z.number().int()).max(32),
      excluded: z.array(base64url).max(64),
    })
    .strict(),
]);
type Request = z.infer<typeof requestSchema>;
type NativeReply = { ok: boolean; available?: boolean; enabled?: boolean; container?: string };
type Native = {
  invoke(operation: string, input: string, callback: (json: string) => void): void;
  startVerifiedSocket(
    path: string,
    identifier: string,
    accept: (fd: number, pid: number, auditToken: string) => boolean,
  ): object;
  stopVerifiedSocket(handle: object): void;
};

export class MacAutoFill {
  private native?: Native;
  private listener?: object;
  private starting?: Promise<void>;
  private sockets = new Set<Socket>();
  private container?: string;
  private token = randomBytes(32).toString('hex');
  private enabled = false;
  private stopped = false;
  private requesting = false;
  private lastRequest = 0;
  private syncQueue = Promise.resolve();
  private syncRevision = 0;

  constructor(
    private readonly vault: Vault,
    private readonly epoch: () => number,
  ) {
    if (process.platform !== 'darwin' || !app.isPackaged) return;
    try {
      this.native = createRequire(__filename)(
        join(process.resourcesPath, 'app.asar.unpacked/dist/native/latch-autofill.node'),
      ) as Native;
    } catch {}
  }

  private call(operation: string, input: unknown = []): Promise<NativeReply> {
    if (!this.native) return Promise.resolve({ ok: true, available: false, enabled: false });
    return new Promise((resolve, reject) => {
      this.native!.invoke(operation, JSON.stringify(input), (json) => {
        try {
          const result = JSON.parse(json) as NativeReply;
          if (!result.ok) throw new Error();
          resolve(result);
        } catch {
          reject(new UserError('macOS AutoFill could not finish. Try again.'));
        }
      });
    });
  }

  async requirePresence(reason: string) {
    if (!this.native) throw new UserError('User verification is unavailable.');
    try {
      await this.call('presence', { reason });
    } catch {
      throw new UserError('User verification was canceled or unavailable.');
    }
  }

  async status(): Promise<MacAutoFillState> {
    if (process.env.LATCH_DATA_DIR)
      return {
        available: false,
        enabled: false,
        reason: 'macOS AutoFill is disabled in isolated data.',
      };
    const state = await this.call('status');
    if (state.available && state.container && !this.stopped) {
      if (!this.listener && !this.starting) {
        this.starting = this.start(state.container).finally(() => {
          this.starting = undefined;
        });
      }
      await this.starting;
    }
    const changed = this.enabled !== !!state.enabled;
    this.enabled = !!state.enabled;
    if (changed) this.update();
    return {
      available: !!state.available && !!this.listener && !this.stopped,
      enabled: this.enabled,
      ...(!state.available
        ? { reason: 'macOS AutoFill requires a signed Bitlatch app with its AutoFill extension.' }
        : {}),
    };
  }

  async sharedContainer(): Promise<string | undefined> {
    await this.status();
    return this.container;
  }

  async enable(): Promise<MacAutoFillState> {
    if (!(await this.status()).available)
      throw new UserError('Install a signed Bitlatch build with macOS AutoFill support first.');
    if (this.enabled) return this.status();
    if (this.requesting || Date.now() - this.lastRequest < 10_000)
      throw new UserError('Wait 10 seconds before asking macOS again.');
    this.requesting = true;
    this.lastRequest = Date.now();
    try {
      await this.call('enable');
      return await this.status();
    } finally {
      this.requesting = false;
    }
  }

  async settings() {
    if (!this.native) throw new UserError('Open System Settings → General → AutoFill & Passwords.');
    await this.call('settings');
  }

  async safariStatus() {
    if (process.env.LATCH_DATA_DIR) return { available: false, enabled: false };
    const state = await this.call('safariStatus');
    return { available: !!state.available, enabled: !!state.enabled };
  }

  async safariSettings() {
    if (!(await this.safariStatus()).available)
      throw new UserError('Install a signed Bitlatch app with the Safari extension first.');
    try {
      await this.call('safariSettings');
    } catch {
      throw new UserError('Could not open Safari settings. Open Safari → Settings → Extensions.');
    }
  }

  update() {
    // Cancel reads already in progress as soon as the vault locks.
    if (this.vault.snapshot().status !== 'unlocked')
      for (const socket of this.sockets) socket.destroy();
    const revision = ++this.syncRevision;
    this.syncQueue = this.syncQueue
      .catch(() => undefined)
      .then(async () => {
        if (revision !== this.syncRevision || !this.enabled) return;
        // Read only when our turn starts. A lock queued behind an index write clears it.
        await this.call('identities', this.vault.autoFillIdentities());
      });
    // An index failure must not interrupt locking or vault operations.
    void this.syncQueue.catch(() => undefined);
  }

  private async start(container: string) {
    const socketPath = join(container, 'autofill.sock');
    if (Buffer.byteLength(socketPath) >= 104)
      throw new UserError('The macOS AutoFill storage path is too long.');
    this.container = container;
    await mkdir(container, { recursive: true, mode: 0o700 });
    await rm(socketPath, { force: true });
    if (!this.native) throw new UserError('macOS AutoFill is unavailable.');
    try {
      this.listener = this.native.startVerifiedSocket(
        socketPath,
        'app.latch.vault.autofill',
        (fd) => {
          try {
            this.accept(new Socket({ fd, readable: true, writable: true }));
            return true;
          } catch {
            return false;
          }
        },
      );
      const config = join(container, 'autofill.json');
      await writeFile(`${config}.tmp`, JSON.stringify({ token: this.token }), { mode: 0o600 });
      await rename(`${config}.tmp`, config);
    } catch {
      if (this.listener) this.native.stopVerifiedSocket(this.listener);
      this.listener = undefined;
      throw new UserError('Could not connect the macOS AutoFill extension.');
    }
  }

  private accept(socket: Socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setTimeout(5000, () => socket.destroy());
    let bytes = Buffer.alloc(0);
    let handled = false;
    socket.on('data', (chunk: Buffer) => {
      if (handled) return;
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 70_000) {
        socket.destroy();
        return;
      }
      const newline = bytes.indexOf(10);
      if (newline < 0) return;
      handled = true;
      try {
        const message = JSON.parse(bytes.subarray(0, newline).toString('utf8'));
        bytes = Buffer.alloc(0);
        const token = Buffer.from(typeof message.token === 'string' ? message.token : '');
        const expected = Buffer.from(this.token);
        if (token.length !== expected.length || !timingSafeEqual(token, expected))
          throw new Error();
        const request = requestSchema.parse(message.request);
        if (!this.enabled || this.stopped || this.vault.snapshot().status !== 'unlocked') {
          socket.end(JSON.stringify({ ok: false, locked: true }) + '\n');
          return;
        }
        void this.answer(socket, request);
      } catch {
        socket.end('{"ok":false}\n');
      }
    });
  }

  /**
   * Password lookup, matching and release are synchronous: no pending fill can
   * resume after a lock. Passkey writes go through the CLI; the vault rejects
   * them once its generation changes, and the lock closes this socket.
   */
  private async answer(socket: Socket, request: Request) {
    const startedAt = this.epoch();
    try {
      if (request.type === 'assert' || request.type === 'register') socket.setTimeout(120_000);
      let value: unknown;
      if (request.type === 'fill') value = this.vault.fill(request.id, request.url);
      else if (request.type === 'matches')
        value = request.urls.flatMap((url) =>
          this.vault.matches(url).items.map((item) => ({
            id: item.id,
            name: item.name,
            username: item.username,
            url,
          })),
        );
      else if (request.type === 'passkeys')
        value = this.vault.passkeys(
          request.rpId,
          request.allowed.map((id) => Buffer.from(id, 'base64url')),
        );
      else if (request.type === 'assert' || request.type === 'register') {
        await this.requirePresence(`Use a Bitlatch passkey for ${request.rpId}`);
        if (this.epoch() !== startedAt || socket.destroyed || this.stopped)
          throw new UserError('Vault locked. Try again after unlocking.');
        if (request.type === 'assert') value = await this.vault.assertPasskey(request);
        else
          value = await this.vault.registerPasskey({
            ...request,
            rpName: request.rpId,
            userDisplayName: request.userName,
          });
      }
      if (
        this.stopped ||
        socket.destroyed ||
        this.epoch() !== startedAt ||
        this.vault.snapshot().status !== 'unlocked'
      )
        throw new Error();
      socket.end(JSON.stringify({ ok: true, value }) + '\n');
    } catch (error) {
      socket.end(
        JSON.stringify({ ok: false, error: error instanceof UserError ? error.message : '' }) +
          '\n',
      );
    }
  }

  async stop() {
    this.stopped = true;
    await this.starting?.catch(() => undefined);
    for (const socket of this.sockets) socket.destroy();
    if (this.listener) this.native?.stopVerifiedSocket(this.listener);
    this.listener = undefined;
    if (this.container) {
      await rm(join(this.container, 'autofill.json'), { force: true });
      await rm(join(this.container, 'autofill.sock'), { force: true });
    }
    await this.syncQueue.catch(() => undefined);
  }
}
