import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BitwardenCli } from '../src/desktop/cli';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(actual.mkdir) };
});
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

let directory: string;
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'latch-cli-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('CLI process boundary', () => {
  it('preserves Unicode when child output splits a character between chunks', async () => {
    const script = join(directory, 'unicode.mjs');
    await writeFile(
      script,
      `import { setTimeout } from 'node:timers/promises';
       for (const byte of Buffer.from('ログイン 🔐 café')) {
         process.stdout.write(Buffer.from([byte]));
         await setTimeout(4);
       }`,
    );
    const cli = new BitwardenCli({ dataDir: directory, executable: process.execPath, script });
    expect(await cli.run(['list', 'items'])).toBe('ログイン 🔐 café');
  });

  it('does not start a queued process if the vault locks during directory setup', async () => {
    let finishSetup!: () => void;
    vi.mocked(mkdir).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSetup = () => resolve(undefined);
        }),
    );
    const cli = new BitwardenCli({ dataDir: directory, executable: process.execPath });
    const pending = cli.run(['not-executed']);
    await vi.waitFor(() => expect(finishSetup).toBeTypeOf('function'));
    cli.cancel();
    finishSetup();
    await expect(pending).rejects.toThrow('Vault locked');
    expect(spawn).not.toHaveBeenCalled();
  });
});
