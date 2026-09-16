import { execFileSync } from 'node:child_process';
const image =
  'vaultwarden/server:1.37.3@sha256:1587c45feaa479f1f5e8af3b00eded36bff77bcf1880cf8dbf0541706dd470e0';
const name = 'latch-mvp-test';
const action = process.argv[2] ?? 'start';
if (action === 'stop') {
  execFileSync('docker', ['stop', name], { stdio: 'inherit' });
} else {
  const running = execFileSync(
    'docker',
    ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  ).trim();
  if (running === name) {
    console.log('Latch test server is already running.');
    process.exit(0);
  }
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1:8229:80',
      '--env',
      'SIGNUPS_ALLOWED=true',
      '--env',
      'WEB_VAULT_ENABLED=false',
      '--env',
      'I_REALLY_WANT_VOLATILE_STORAGE=true',
      '--env',
      'LOG_LEVEL=warn',
      image,
    ],
    { stdio: 'inherit' },
  );
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:8229/alive')).ok) {
        console.log('Disposable vault ready. Stop it with npm run test:server:stop.');
        process.exit(0);
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The local test vault did not start.');
}
