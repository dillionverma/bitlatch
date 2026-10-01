import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function notarizeRelease({ root, app, identity, notarizationProfile, env }) {
  const run = (command, args) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });
  const notarize = (file) =>
    run('xcrun', [
      'notarytool',
      'submit',
      file,
      '--keychain-profile',
      notarizationProfile,
      '--wait',
      '--timeout',
      '30m',
    ]);
  const staple = (file) => {
    run('xcrun', ['stapler', 'staple', file]);
    run('xcrun', ['stapler', 'validate', file]);
  };
  const temporary = await mkdtemp(join(tmpdir(), 'latch-notarize-'));
  try {
    const submission = join(temporary, 'Bitlatch.zip');
    run('ditto', ['-c', '-k', '--keepParent', app, submission]);
    notarize(submission);
    staple(app);
    run('codesign', ['--verify', '--deep', '--strict', app]);
    run('spctl', ['--assess', '--type', 'execute', '--verbose', app]);

    // Archive the stapled app without rebuilding or signing it again. The ZIP's
    // checksum and blockmap must describe these final bytes.
    const output = join(root, 'release/distribution');
    await rm(output, { recursive: true, force: true });
    run('pnpm', [
      'exec',
      'electron-builder',
      '--mac',
      'dmg',
      'zip',
      '--arm64',
      '--prepackaged',
      app,
      '--config.directories.output',
      output,
      '--publish',
      'never',
    ]);
    for (const name of (await readdir(output)).filter((name) => name.endsWith('.dmg'))) {
      const dmg = join(output, name);
      // The compression hook has finished; no subsequent step may recompress it.
      run('codesign', ['--force', '--sign', identity, '--timestamp', dmg]);
      notarize(dmg);
      staple(dmg);
      run('codesign', ['--verify', '--strict', dmg]);
      run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', dmg]);
    }
    console.log('Notarized macOS release: release/distribution. Not published.');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
