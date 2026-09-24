import { readFile, rename, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { VaultState } from '@latch/shared/types';

const schema = z.object({ email: z.email().max(320), server: z.url().max(2_048) });
export type AccountHint = z.infer<typeof schema>;

/** Display metadata only. This can never authorize access to the vault. */
export class AccountHints {
  private queue: Promise<void> = Promise.resolve();
  private previous = '';

  constructor(private readonly file: string) {}

  async read(): Promise<AccountHint | undefined> {
    try {
      const text = await readFile(this.file, 'utf8');
      const value = schema.parse(JSON.parse(text));
      this.previous = JSON.stringify(value);
      return value;
    } catch {
      return undefined;
    }
  }

  remember(state: VaultState) {
    const value =
      state.status === 'signed-out' ? null : { email: state.email, server: state.server };
    const text = JSON.stringify(value);
    if (text === this.previous) return;
    this.previous = text;
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, this.file);
      });
    // The hint is optional. A failure must not break authentication.
    void this.queue.catch(() => undefined);
  }
}
