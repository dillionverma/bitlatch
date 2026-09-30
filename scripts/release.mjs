import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const [command, tag, directory = 'release'] = process.argv.slice(2);
if (!['validate', 'verify', 'publish'].includes(command) || !/^v\d+\.\d+\.\d+$/.test(tag ?? ''))
  throw new Error('Usage: node scripts/release.mjs <validate|verify|publish> vX.Y.Z [directory]');
const root = resolve(import.meta.dirname, '..');
const run = (program, args) => execFileSync(program, args, { cwd: root, encoding: 'utf8' }).trim();

function validateVersion() {
  for (const directory of ['apps/desktop', 'apps/extension']) {
    const { version } = JSON.parse(readFileSync(resolve(root, directory, 'package.json'), 'utf8'));
    if (tag !== `v${version}`) throw new Error(`Version mismatch: ${directory}`);
  }
  const sha = run('git', ['rev-parse', 'HEAD']);
  const existing = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (existing.error) throw existing.error;
  if (existing.status === 0 && existing.stdout.trim() !== sha)
    throw new Error('The tag already points to a different commit.');
  return sha;
}

function verifyAssets() {
  const version = tag.slice(1);
  const expected = [
    `Latch-${version}-mac-arm64.dmg`,
    `Latch-${version}-mac-arm64.zip`,
    `Latch-${version}-linux-x86_64.AppImage`,
    `Latch-${version}-linux-amd64.deb`,
    `Latch-${version}-linux-arm64.AppImage`,
    `Latch-${version}-linux-arm64.deb`,
    `Latch-${version}-win-x64.exe`,
    ...['chrome', 'firefox', 'safari', 'sources', 'raycast'].map(
      (target) => `latch-${version}-${target}.zip`,
    ),
  ];
  const files = readdirSync(directory)
    .filter((name) => name !== 'SHA256SUMS')
    .sort();
  if (files.length !== expected.length || expected.some((name) => !files.includes(name)))
    throw new Error(`Incomplete or unexpected release assets: ${files.join(', ')}`);
  const sums = files.map((name) => {
    const bytes = readFileSync(resolve(directory, name));
    if (!bytes.length) throw new Error(`Empty asset: ${name}`);
    return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`;
  });
  writeFileSync(resolve(directory, 'SHA256SUMS'), sums.join('\n') + '\n');
  return [...files, 'SHA256SUMS'].sort();
}

function publish() {
  const sha = validateVersion();
  if (!process.env.GH_REPO || !process.env.RELEASE_SHA || process.env.RELEASE_SHA !== sha)
    throw new Error('Set GH_REPO and RELEASE_SHA to the checked-out release commit.');
  const files = verifyAssets();
  const gh = (args) => run('gh', args);
  const existing = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (existing.error) throw existing.error;
  if (existing.status === 0) {
    if (!JSON.parse(existing.stdout).isDraft)
      throw new Error('Release already published; use a new version.');
    gh(['release', 'edit', tag, '--target', sha]);
  } else {
    gh([
      'release',
      'create',
      tag,
      '--target',
      sha,
      '--draft',
      '--prerelease',
      '--title',
      `Latch ${tag}`,
      '--notes-file',
      resolve(root, '.github/release-notes.md'),
    ]);
  }
  gh(['release', 'upload', tag, ...files.map((name) => resolve(directory, name)), '--clobber']);
  const { assets } = JSON.parse(gh(['release', 'view', tag, '--json', 'assets']));
  const actual = assets.map((asset) => asset.name).sort();
  if (JSON.stringify(files) !== JSON.stringify(actual))
    throw new Error('Draft contains unexpected assets. Remove them before retrying.');
  const repository = process.env.GH_REPO;
  const refs = JSON.parse(gh(['api', `repos/${repository}/git/matching-refs/tags/${tag}`]));
  if (refs.some((ref) => ref.ref === `refs/tags/${tag}`)) {
    const commit = JSON.parse(gh(['api', `repos/${repository}/commits/${tag}`]));
    if (commit.sha !== sha) throw new Error('Remote tag changed during the build.');
  }
  gh([
    'release',
    'edit',
    tag,
    '--draft=false',
    '--prerelease',
    '--latest=false',
    '--notes-file',
    resolve(root, '.github/release-notes.md'),
  ]);
}

if (command === 'validate') {
  const output = `tag=${tag}\nsha=${validateVersion()}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
} else if (command === 'verify') {
  console.log(`Verified ${verifyAssets().length - 1} assets; wrote SHA256SUMS.`);
} else {
  publish();
}
