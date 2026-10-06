/** Loopback, private IPv4, link-local IPv4, and local mDNS hostnames. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (host.endsWith('.local')) return true;
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts || parts.slice(1).some((part) => Number(part) > 255)) return false;
  const [first, second] = [Number(parts[1]), Number(parts[2])];
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

/** A web address Bitlatch is willing to store on an item. */
export function webUrl(input: string): URL | null {
  return parsedWebUrl(input)?.url ?? null;
}

export function parsedWebUrl(input: string): { url: URL; explicitPort: boolean } | null {
  // Reject repairs that URL would silently make to malformed authorities.
  if (/[\s\p{Cc}\\]/u.test(input)) return null;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(input)?.[1];
  if (!authority) return null;
  const host = /^(?:\[[0-9a-f:.]+\]|[^:@[\]]+)(?::(\d+))?$/i.exec(authority);
  if (!host) return null;
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url, explicitPort: host[1] !== undefined };
  } catch {
    return null;
  }
}
