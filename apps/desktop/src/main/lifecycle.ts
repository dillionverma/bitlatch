import { app, clipboard, globalShortcut, powerMonitor } from 'electron';
import { UserError, type DesktopRequest } from '@latch/shared/protocol';
import type { Vault } from './vault';
import type { CliPort } from './cli';
import type { createUpdates } from './updates';

type CopyField = Extract<DesktopRequest, { type: 'copy' }>['field'];

/** Owns desktop invalidation and shutdown; vault session state stays in Vault. */
export class DesktopLifecycle {
  epoch = 0;
  startup?: Promise<unknown>;
  cli?: CliPort;
  updates?: ReturnType<typeof createUpdates>;
  private phase: 'running' | 'stopping' | 'stopped' = 'running';
  private vault?: Vault;
  private resources: { stop(): Promise<void> }[] = [];
  private idleTimer?: NodeJS.Timeout;
  private lastUnlockAt = Date.now();
  private copiedValue = '';
  private clipboardTimer?: NodeJS.Timeout;
  private clipboardQueue: Promise<void> = Promise.resolve();

  constructor() {
    app.on('before-quit', (event) => {
      if (this.phase === 'stopped') return;
      event.preventDefault();
      if (this.quitting) return;
      this.phase = 'stopping';
      globalShortcut.unregisterAll();
      this.updates?.stop();
      if (this.idleTimer) clearInterval(this.idleTimer);
      powerMonitor.removeListener('suspend', this.lockInBackground);
      powerMonitor.removeListener('lock-screen', this.lockInBackground);
      // Invalidate reads immediately, even while startup is still in progress.
      const vault = this.vault;
      const locking = this.lock().catch(() => undefined);
      void this.shutdown(locking, vault);
    });
  }

  get quitting() {
    return this.phase !== 'running';
  }

  assertRunning() {
    if (this.quitting) throw new UserError('Latch is shutting down.');
  }

  track<T extends { stop(): Promise<void> }>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }

  attachVault(vault: Vault, onLocked: () => void) {
    this.vault = vault;
    let wasUnlocked = vault.snapshot().status === 'unlocked';
    vault.on('state', (state) => {
      if (state.status === 'unlocked') this.lastUnlockAt = Date.now();
      else {
        if (wasUnlocked) ++this.epoch;
        onLocked();
        void this.clearCopiedSecret().catch(() => undefined);
      }
      wasUnlocked = state.status === 'unlocked';
    });
    if (this.quitting) return;
    powerMonitor.on('suspend', this.lockInBackground);
    powerMonitor.on('lock-screen', this.lockInBackground);
    this.idleTimer = setInterval(() => {
      if (
        vault.snapshot().status === 'unlocked' &&
        Date.now() - this.lastUnlockAt >= 300_000 &&
        powerMonitor.getSystemIdleTime() >= 300
      )
        this.lockInBackground();
    }, 10_000);
    this.idleTimer.unref();
  }

  lock() {
    ++this.epoch;
    return this.vault?.lock(!this.quitting) ?? Promise.resolve();
  }

  readonly lockInBackground = () => {
    void this.lock().catch(() => undefined);
  };

  copy(id: string, field: CopyField) {
    const epoch = this.epoch;
    this.clipboardQueue = this.clipboardQueue
      .catch(() => undefined)
      .then(async () => {
        this.assertRunning();
        if (!this.vault || epoch !== this.epoch)
          throw new UserError('Vault locked. Try again after unlocking.');
        this.copiedValue = this.vault.detail(id)[field];
        await clipboard.writeText(this.copiedValue);
        if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
        this.clipboardTimer = setTimeout(
          () => void this.clearCopiedSecret().catch(() => undefined),
          30_000,
        );
      });
    return this.clipboardQueue;
  }

  private clearCopiedSecret() {
    if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
    this.clipboardQueue = this.clipboardQueue
      .catch(() => undefined)
      .then(async () => {
        const previous = this.copiedValue;
        this.copiedValue = '';
        if (previous && (await clipboard.readText()) === previous) clipboard.clear();
      });
    return this.clipboardQueue;
  }

  private async shutdown(locking: Promise<unknown>, lockedVault: Vault | undefined) {
    try {
      // Startup may still be acquiring resources. Dispose those too before exiting.
      await this.startup?.catch(() => undefined);
      this.updates?.stop();
      globalShortcut.unregisterAll();
      await Promise.allSettled([
        locking,
        this.vault !== lockedVault ? this.lock() : undefined,
        ...this.resources.map((resource) => resource.stop()),
        this.clearCopiedSecret(),
      ]);
    } finally {
      // The warm CLI can hold an unlocked session and must always stop last.
      try {
        await this.cli?.stop?.();
      } catch {
        // Never expose raw CLI failures during shutdown.
      } finally {
        this.phase = 'stopped';
        if (this.updates) this.updates.quit();
        else app.quit();
      }
    }
  }
}
