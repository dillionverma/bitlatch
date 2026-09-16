import { describe, expect, it } from 'vitest';
import { matchesUri, normalizeServer } from '../src/desktop/matching';

describe('website matching', () => {
  it('requires an explicit base-domain rule to include sibling subdomains', () => {
    expect(
      matchesUri({ uri: 'https://example.com', match: 0 }, 'https://login.example.com/sign-in'),
    ).toBe(true);
    expect(matchesUri({ uri: 'https://example.com' }, 'https://login.example.com')).toBe(false);
    expect(
      matchesUri({ uri: 'https://example.com', match: null }, 'https://login.example.com'),
    ).toBe(false);
    expect(
      matchesUri({ uri: 'https://example.com', match: null }, 'https://example.com/login'),
    ).toBe(true);
    expect(matchesUri({ uri: 'http://localhost:8230' }, 'http://localhost:8230/')).toBe(true);
    expect(
      matchesUri({ uri: 'https://example.com', match: null }, 'https://example.com.attacker.test'),
    ).toBe(false);
    expect(matchesUri({ uri: 'https://example.com', match: null }, 'https://notexample.com')).toBe(
      false,
    );
  });
  it('respects private suffixes and does not leak between tenant sites', () => {
    expect(matchesUri({ uri: 'https://alice.github.io', match: 0 }, 'https://bob.github.io')).toBe(
      false,
    );
    expect(
      matchesUri({ uri: 'https://alice.github.io', match: 0 }, 'https://alice.github.io/login'),
    ).toBe(true);
  });
  it('does not downgrade HTTPS or match a different port', () => {
    expect(matchesUri({ uri: 'https://example.com', match: null }, 'http://example.com')).toBe(
      false,
    );
    expect(matchesUri({ uri: 'http://localhost:8230', match: null }, 'http://localhost:8231')).toBe(
      false,
    );
    expect(
      matchesUri({ uri: 'http://localhost:8230', match: null }, 'http://localhost:8230/login'),
    ).toBe(true);
  });
  it('enforces host, exact, prefix, never, and unsupported regex rules', () => {
    expect(
      matchesUri({ uri: 'https://login.example.com', match: 1 }, 'https://other.example.com'),
    ).toBe(false);
    expect(
      matchesUri(
        { uri: 'https://example.com/login', match: 3 },
        'https://example.com/login?next=1',
      ),
    ).toBe(false);
    expect(
      matchesUri({ uri: 'https://example.com/login', match: 2 }, 'https://example.com/login/step'),
    ).toBe(true);
    expect(
      matchesUri({ uri: 'https://example.com', match: 2 }, 'https://example.com.evil.test'),
    ).toBe(false);
    expect(matchesUri({ uri: 'https://example.com', match: 5 }, 'https://example.com')).toBe(false);
    expect(matchesUri({ uri: '.*', match: 4 }, 'https://example.com')).toBe(false);
  });
  it('rejects non-web URLs and URLs containing credentials', () => {
    expect(
      matchesUri({ uri: 'https://example.com', match: null }, 'https://example.com@evil.test'),
    ).toBe(false);
    expect(matchesUri({ uri: 'javascript:alert(1)', match: null }, 'https://example.com')).toBe(
      false,
    );
    expect(() => normalizeServer('http://example.com')).toThrow();
    expect(() => normalizeServer('https://user:pass@example.com')).toThrow();
    expect(normalizeServer('https://vault.bitwarden.eu/')).toBe('https://vault.bitwarden.eu');
  });
});
