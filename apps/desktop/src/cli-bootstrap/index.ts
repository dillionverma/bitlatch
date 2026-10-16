import { closeSync, readSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BOOTSTRAP_MARKER, type BootstrapPayload } from './payload';

// Loaded into the Bitwarden CLI before it starts. Secrets set here live only in
// this process's memory; `ps -E` shows the environment a process started with.
const fd = Number(process.env.LATCH_SECRET_FD);
delete process.env.LATCH_SECRET_FD;
if (Number.isInteger(fd) && fd > 2) {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(16_384);
  for (let read; (read = readSync(fd, buffer));) chunks.push(Buffer.from(buffer.subarray(0, read)));
  closeSync(fd);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BootstrapPayload;
  Object.assign(process.env, payload.env);
  if (payload.probe) {
    writeSync(1, BOOTSTRAP_MARKER);
    process.exit(0);
  }
}
// Electron's Node ignores NODE_OPTIONS, so there the bootstrap runs as the main
// script, with the CLI's entry as its first argument.
if (process.argv[1] === __filename) {
  process.argv.splice(1, 1);
  void import(pathToFileURL(process.argv[1]!).href);
}
