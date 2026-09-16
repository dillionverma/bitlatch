import { createServer } from 'node:https';
import { request } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

export async function startTestTlsProxy() {
  const directory = await mkdtemp(join(tmpdir(), 'latch-test-tls-'));
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  let offline = false;
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const proxy = createServer(
    { key: await readFile(keyPath), cert: await readFile(certPath) },
    (incoming, outgoing) => {
      if (offline) {
        outgoing.writeHead(503);
        outgoing.end();
        return;
      }
      const upstream = request(
        {
          hostname: '127.0.0.1',
          port: 8229,
          path: incoming.url,
          method: incoming.method,
          headers: incoming.headers,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on('error', () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(upstream);
    },
  );
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return {
    url: `https://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
    certPath,
    setOffline(value: boolean) {
      offline = value;
    },
    async close() {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}
