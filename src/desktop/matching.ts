import { getDomain } from 'tldts';

export interface CipherUri {
  uri: string | null;
  match?: number | null;
}

export function webUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return null;
    return url;
  } catch {
    return null;
  }
}

export function matchesUri(entry: CipherUri, target: string): boolean {
  if (!entry.uri || entry.match === 5 || entry.match === 4) return false;
  const destination = webUrl(target);
  const saved = webUrl(entry.uri.includes('://') ? entry.uri : `https://${entry.uri}`);
  if (!destination || !saved || saved.protocol !== destination.protocol) return false;
  if (entry.match === 3) return saved.href === destination.href;
  if (entry.match === 2)
    return saved.origin === destination.origin && destination.href.startsWith(saved.href);
  // The CLI does not expose each client's default URI setting. Use a strict host
  // fallback; only an explicit base-domain rule may include sibling subdomains.
  if (entry.match === 1 || entry.match === undefined || entry.match === null)
    return saved.host === destination.host;
  if (entry.match !== 0) return false;
  if (saved.port !== destination.port) return false;
  const savedDomain = getDomain(saved.hostname, { allowPrivateDomains: true }) ?? saved.hostname;
  const targetDomain =
    getDomain(destination.hostname, { allowPrivateDomains: true }) ?? destination.hostname;
  return savedDomain === targetDomain;
}

export function normalizeServer(input: string): string {
  const url = webUrl(input);
  if (!url || url.protocol !== 'https:' || url.search || url.hash)
    throw new Error('Use an HTTPS server URL.');
  return url.href.replace(/\/$/, '');
}
