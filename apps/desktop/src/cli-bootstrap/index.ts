import { closeSync, readSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BOOTSTRAP_MARKER, secretNames, type BootstrapPayload } from './payload';

// Loaded into the Bitwarden CLI before it starts. The secrets never enter the
// real environment: `ps -E` shows the one a process started with, and child
// processes copy the current one. Reads of `process.env` still find them.
const fd = Number(process.env.LATCH_SECRET_FD);
delete process.env.LATCH_SECRET_FD;
delete process.env.NODE_OPTIONS;
if (Number.isInteger(fd) && fd > 2) {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(16_384);
  for (let read; (read = readSync(fd, buffer));) chunks.push(Buffer.from(buffer.subarray(0, read)));
  closeSync(fd);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BootstrapPayload;
  if (payload.probe) {
    writeSync(1, BOOTSTRAP_MARKER);
    process.exit(0);
  }
  const secrets = new Map<string | symbol, string>(Object.entries(payload.env));
  const secret = (key: string | symbol) =>
    (secretNames as readonly (string | symbol)[]).includes(key);
  process.env = new Proxy(process.env, {
    get: (env, key) => (secret(key) ? secrets.get(key) : Reflect.get(env, key)),
    has: (env, key) => (secret(key) ? secrets.has(key) : Reflect.has(env, key)),
    // The CLI stores the session key it creates on unlock; keep that one private too.
    set: (env, key, value) => {
      if (secret(key)) secrets.set(key, String(value));
      else Reflect.set(env, key, value);
      return true;
    },
    deleteProperty: (env, key) => {
      if (secret(key)) secrets.delete(key);
      else Reflect.deleteProperty(env, key);
      return true;
    },
  });
}
// Electron's Node ignores NODE_OPTIONS, so there the bootstrap runs as the main
// script, with the CLI's entry as its first argument.
if (process.argv[1] === __filename) {
  process.argv.splice(1, 1);
  void import(pathToFileURL(process.argv[1]!).href);
}
