import { nativeImage } from 'electron';
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

/** Icons stay in memory. Locking clears hostnames, images, and queued requests. */
export class WebsiteIcons {
  enabled = true;
  private cache = new Map<string, { value: string | null; expires: number }>();
  private pending = new Map<string, Promise<string | null>>();
  private controllers = new Set<AbortController>();
  private queue: { run: () => void; cancel: () => void }[] = [];
  private active = 0;
  private epoch = 0;

  constructor(private preferencePath: string) {}

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
      // Node fetch has no browser cookies or referrer. Redirects cannot escape this origin.
      const response = await fetch(
        `https://icons.bitwarden.net/${encodeURIComponent(host)}/icon.png`,
        {
          signal: controller.signal,
          redirect: 'error',
          credentials: 'omit',
        },
      );
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
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
      if (bytes.length < 24 || bytes.readUInt32BE(16) > 512 || bytes.readUInt32BE(20) > 512)
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
