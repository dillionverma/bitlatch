import { getDomain } from 'tldts';

export interface CipherUri {
  uri: string | null;
  match?: number | null;
}

/** A web address Latch is willing to store on an item. */
export function webUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * A web address Latch is willing to hand a credential to. Plain HTTP puts the
 * password on the wire, so it is only filled where the traffic stays on this
 * machine or the local network, which is also where a certificate is not
 * possible. Routers and other local devices live here; the open internet does
 * not. Saving an address is not restricted this way, only filling one.
 */
export function fillableUrl(input: string): URL | null {
  const url = webUrl(input);
  if (!url) return null;
  return url.protocol === 'https:' || isLocalHost(url.hostname) ? url : null;
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  // Names handed out by mDNS on the local network, such as a printer or a NAS.
  if (host.endsWith('.local')) return true;
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts || parts.slice(1).some((part) => Number(part) > 255)) return false;
  const [first, second] = [Number(parts[1]), Number(parts[2])];
  return (
    first === 127 || // loopback
    first === 10 || // 10.0.0.0/8
    (first === 172 && second >= 16 && second <= 31) || // 172.16.0.0/12
    (first === 192 && second === 168) || // 192.168.0.0/16
    (first === 169 && second === 254) // link-local
  );
}

export function matchesUri(entry: CipherUri, target: string): boolean {
  if (!entry.uri || entry.match === 5 || entry.match === 4) return false;
  const destination = fillableUrl(target);
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
