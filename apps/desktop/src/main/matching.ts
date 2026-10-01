import { isLocalHost } from '@latch/shared/urls';
import { parse } from 'tldts';

export interface CipherUri {
  uri: string | null;
  match?: number | null;
}

/** A web address Bitlatch is willing to store on an item. */
export function webUrl(input: string): URL | null {
  return parsedWebUrl(input)?.url ?? null;
}

function parsedWebUrl(input: string): { url: URL; explicitPort: boolean } | null {
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

/**
 * A web address Bitlatch is willing to hand a credential to. Plain HTTP puts the
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

export function matchesUri(entry: CipherUri, target: string): boolean {
  const mode = entry.match ?? 1;
  if (!entry.uri || ![0, 1, 2, 3].includes(mode)) return false;
  const destination = fillableUrl(target);
  if (!destination) return false;
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(entry.uri);
  // Single-label host:port is ambiguous with URI schemes. Require HTTP(S),
  // except for localhost; dotted hosts and bracketed IPv6 are unambiguous here.
  const schemeLike = /^[a-z][a-z\d+.-]*:/i.exec(entry.uri)?.[0];
  if (
    !hasScheme &&
    schemeLike &&
    !schemeLike.includes('.') &&
    schemeLike.toLowerCase() !== 'localhost:'
  )
    return false;
  const scheme = mode === 2 || mode === 3 ? 'https:' : destination.protocol;
  const parsed = parsedWebUrl(hasScheme ? entry.uri : `${scheme}//${entry.uri}`);
  if (!parsed || parsed.url.protocol !== destination.protocol) return false;
  const saved = parsed.url;
  if (mode === 3) return saved.href === destination.href;
  if (mode === 2)
    return saved.origin === destination.origin && destination.href.startsWith(saved.href);
  // URL removes explicit default ports, so retain their presence from the input.
  if (parsed.explicitPort && saved.port !== destination.port) return false;
  if (saved.hostname === destination.hostname) return true;
  // The CLI does not expose the client's default rule. Only an explicit base-
  // domain rule may include sibling subdomains, and only under a known suffix.
  if (mode !== 0) return false;
  const savedDomain = registrableDomain(saved.hostname);
  return savedDomain !== null && savedDomain === registrableDomain(destination.hostname);
}

function registrableDomain(hostname: string): string | null {
  const result = parse(hostname, { allowPrivateDomains: true });
  if (!result.domain || (!result.isIcann && !result.isPrivate)) return null;
  return result.domain + (hostname.endsWith('.') ? '.' : '');
}

export function normalizeServer(input: string): string {
  const url = webUrl(input);
  if (!url || url.protocol !== 'https:' || url.search || url.hash)
    throw new Error('Use an HTTPS server URL.');
  return url.href.replace(/\/$/, '');
}
