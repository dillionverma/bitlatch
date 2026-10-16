import { nativeImage, net } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'tldts';
import { webUrl } from './matching';

const MAX_BYTES = 128 * 1024;
const CACHE_LIMIT = 256;

export function iconHostname(website: string): string | null {
  const url = webUrl(website.includes('://') ? website : `https://${website}`);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const domain = parse(host, { allowPrivateDomains: true });
  // Never send IP addresses, local names, or non-web schemes to the icon service.
  if (domain.isIp || !domain.domain || (!domain.isIcann && !domain.isPrivate)) return null;
  return host;
}

/**
 * Bitwarden's cloud icon services, or a self-hosted server's own, so a
 * self-hosted vault never sends website names to Bitwarden.
 */
export function iconService(server: string) {
  const host = new URL(server).hostname;
  if (host === 'vault.bitwarden.com') return 'https://icons.bitwarden.net';
  if (host === 'vault.bitwarden.eu') return 'https://icons.bitwarden.eu';
  return `${server.replace(/\/$/, '')}/icons`;
}

export function iconUrl(server: string, host: string) {
  return `${iconService(server)}/${encodeURIComponent(host)}/icon.png`;
}

/** Icons stay in memory. Locking clears hostnames, images, and queued requests. */
export class WebsiteIcons {
  enabled = true;
  private cache = new Map<string, { value: string | null; expires: number }>();
  private pending = new Map<string, Promise<string | null>>();
  private controllers = new Set<AbortController>();
  private queue: { run: () => void; cancel: () => void }[] = [];
  private active = 0;
  private epoch = 0;

  constructor(
    private preferencePath: string,
    private server: () => string,
  ) {}

  async load() {
    try {
      this.enabled = JSON.parse(await readFile(this.preferencePath, 'utf8')).enabled === true;
    } catch (error) {
      this.enabled = (error as NodeJS.ErrnoException).code === 'ENOENT';
    }
  }

  async setEnabled(enabled: boolean) {
    await writeFile(this.preferencePath, JSON.stringify({ enabled }), { mode: 0o600 });
    this.enabled = enabled;
    if (!enabled) this.clear();
    return enabled;
  }

  clear() {
    this.epoch++;
    for (const controller of this.controllers) controller.abort();
    for (const task of this.queue.splice(0)) task.cancel();
    this.pending.clear();
    this.cache.clear();
  }

  get(website: string): Promise<string | null> {
    const host = iconHostname(website);
    if (!this.enabled || !host) return Promise.resolve(null);
    const cached = this.cache.get(host);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    const pending = this.pending.get(host);
    if (pending) return pending;
    if (this.pending.size >= 64) return Promise.resolve(null);
    const epoch = this.epoch;
    const promise = new Promise<string | null>((resolve) => {
      this.queue.push({
        cancel: () => resolve(null),
        run: () => {
          this.active++;
          void this.fetch(host)
            .then((value) => {
              if (epoch === this.epoch && this.enabled) {
                this.pending.delete(host);
                this.cache.delete(host);
                this.cache.set(host, {
                  value,
                  expires: Date.now() + (value ? 86_400_000 : 300_000),
                });
                if (this.cache.size > CACHE_LIMIT)
                  this.cache.delete(this.cache.keys().next().value!);
                resolve(value);
              } else resolve(null);
            })
            .finally(() => {
              this.active--;
              this.drain();
            });
        },
      });
    });
    this.pending.set(host, promise);
    this.drain();
    return promise;
  }

  private drain() {
    while (this.active < 4 && this.queue.length) this.queue.shift()!.run();
  }

  private async fetch(host: string): Promise<string | null> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      // Chromium's network stack trusts the same certificates as the system, which
      // a self-hosted server with a private CA needs. No cookies are sent, nothing
      // goes to the HTTP cache, and redirects cannot escape this origin.
      const response = await net.fetch(iconUrl(this.server(), host), {
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok || !response.body) return null;
      if (Number(response.headers.get('content-length')) > MAX_BYTES) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) return null;
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      // The icon service can return JPEG bytes even for its /icon.png endpoint.
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
      if (!png && !jpeg) return null;
      if (
        png &&
        (bytes.length < 24 || bytes.readUInt32BE(16) > 512 || bytes.readUInt32BE(20) > 512)
      )
        return null;
      const image = nativeImage.createFromBuffer(bytes);
      const { width, height } = image.getSize();
      if (image.isEmpty() || width > 512 || height > 512) return null;
      return image.resize({ width: 64, height: 64 }).toDataURL();
    } catch {
      return null;
    } finally {
      controller.abort();
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}
