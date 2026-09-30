import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fillableUrl,
  matchesUri,
  normalizeServer,
  webUrl,
} from '../apps/desktop/src/main/matching.ts';

const hostModes = [undefined, null, 1];
const siteModes = [...hostModes, 0];
const supportedModes = [...siteModes, 2, 3];

function cases(rows, match) {
  for (const [name, uri, target, expected] of rows) {
    void it(name, () => assert.equal(matchesUri({ uri, match }, target), expected));
  }
}

for (const match of siteModes) {
  void describe(`hostname and port matching, mode ${match}`, () => {
    cases(
      [
        ['NAS without a port', 'skynet.local', 'https://skynet.local:5001/', true],
        ['NAS with scheme but no port', 'https://skynet.local', 'https://skynet.local:5001/', true],
        ['NAS with matching port', 'skynet.local:5001', 'https://skynet.local:5001/', true],
        ['NAS with different port', 'skynet.local:5000', 'https://skynet.local:5001/', false],
        [
          'explicit default port stays restrictive',
          'https://skynet.local:443',
          'https://skynet.local:5001/',
          false,
        ],
        [
          'explicit default port matches implicit default',
          'https://skynet.local:443',
          'https://skynet.local/',
          true,
        ],
        [
          'zero padded explicit default port',
          'https://skynet.local:00443',
          'https://skynet.local/',
          true,
        ],
        [
          'explicit nondefault port rejects default',
          'https://skynet.local:5001',
          'https://skynet.local/',
          false,
        ],
        [
          'omitted port also works on public HTTPS',
          'https://example.com',
          'https://example.com:8443/',
          true,
        ],
        ['port zero is explicit', 'https://example.com:0', 'https://example.com/', false],
        ['port zero matches itself', 'https://example.com:0', 'https://example.com:0/', true],
        ['maximum port', 'https://example.com:65535', 'https://example.com:65535/', true],
        ['case normalization', 'HTTPS://EXAMPLE.COM', 'https://example.com/login', true],
        [
          'path does not constrain host mode',
          'https://example.com/old?x=1#part',
          'https://example.com/new?x=2#other',
          true,
        ],
        [
          'scheme marker inside a path',
          'example.com/redirect/https://elsewhere.test',
          'https://example.com/',
          true,
        ],
        ['scheme-less local HTTP', 'skynet.local', 'http://skynet.local:5000/', true],
        ['scheme-less private IP HTTP', '192.168.0.11', 'http://192.168.0.11:5000/', true],
        ['scheme-less localhost HTTP', 'localhost:3000', 'http://localhost:3000/', true],
        [
          'explicit HTTPS cannot downgrade locally',
          'https://skynet.local',
          'http://skynet.local/',
          false,
        ],
        ['explicit HTTP stays HTTP', 'http://skynet.local', 'https://skynet.local/', false],
        ['public HTTP is never fillable', 'example.com', 'http://example.com/', false],
        [
          'explicit local HTTP port 80 stays restrictive',
          'http://skynet.local:80',
          'http://skynet.local:5000/',
          false,
        ],
        ['explicit HTTP default port', 'http://skynet.local:80', 'http://skynet.local/', true],
        ['different device', 'skynet.local', 'https://other.local:5001/', false],
        ['IPv4 same address', '192.168.0.11', 'https://192.168.0.11:5001/', true],
        ['IPv4 different address', '192.168.0.11', 'https://192.168.0.12:5001/', false],
        ['IPv6 omitted port', '[::1]', 'https://[::1]:5001/', true],
        ['IPv6 explicit port', '[::1]:5001', 'https://[::1]:5001/', true],
        ['IPv6 different port', '[::1]:5000', 'https://[::1]:5001/', false],
        ['IPv6 canonical form', 'https://[0:0:0:0:0:0:0:1]', 'https://[::1]/', true],
        ['IPv6 loopback HTTP without saved scheme', '[::1]:3000', 'http://[::1]:3000/', true],
        ['IPv6 different address', 'https://[2001:db8::1]', 'https://[2001:db8::2]/', false],
        ['single label HTTPS', 'router', 'https://router:8443/', true],
        [
          'single label explicit scheme and port',
          'https://router:8443',
          'https://router:8443/',
          true,
        ],
        ['single label port needs a scheme', 'router:8443', 'https://router:8443/', false],
        ['localhost with uppercase port syntax', 'LOCALHOST:3000', 'http://localhost:3000/', true],
        ['IPv4 shorthand canonicalization', '127.1', 'http://127.0.0.1:8080/', true],
        ['IPv4 numeric canonicalization', '2130706433:8080', 'http://127.0.0.1:8080/', true],
        ['single label HTTP remains unsupported', 'router', 'http://router/', false],
        [
          'Unicode and punycode are equivalent',
          'https://bücher.de',
          'https://xn--bcher-kva.de/',
          true,
        ],
        ['Unicode lookalike is another hostname', 'https://apple.com', 'https://аpple.com/', false],
        [
          'trailing dot remains a distinct host',
          'https://example.com.',
          'https://example.com/',
          false,
        ],
        ['trailing dots on both hosts', 'https://example.com.', 'https://example.com./', true],
        ['hostname suffix attack', 'https://example.com', 'https://example.com.evil.test/', false],
        ['hostname prefix attack', 'https://example.com', 'https://notexample.com/', false],
        [
          'hostname embedded in path',
          'https://example.com',
          'https://evil.test/example.com/',
          false,
        ],
        [
          'hostname embedded in query',
          'https://example.com',
          'https://evil.test/?next=https://example.com',
          false,
        ],
      ],
      match,
    );
  });
}

for (const match of hostModes) {
  void describe(`default stays exact-host, mode ${match}`, () => {
    cases(
      [
        ['parent does not match child', 'https://example.com', 'https://login.example.com/', false],
        ['child does not match parent', 'https://login.example.com', 'https://example.com/', false],
        ['siblings do not match', 'https://a.example.com', 'https://b.example.com/', false],
      ],
      match,
    );
  });
}

void describe('explicit base-domain matching', () => {
  cases(
    [
      ['parent and child', 'https://example.com', 'https://login.example.com/', true],
      ['child and parent', 'https://login.example.com', 'https://example.com/', true],
      ['siblings', 'https://a.example.com', 'https://b.example.com/', true],
      ['multi-label public suffix', 'https://a.example.co.uk', 'https://b.example.co.uk/', true],
      ['different registrable domain', 'https://a.example.co.uk', 'https://other.co.uk/', false],
      ['different TLD', 'https://example.com', 'https://example.net/', false],
      [
        'explicit port across siblings',
        'https://a.example.com:8443',
        'https://b.example.com:8443/',
        true,
      ],
      [
        'explicit port mismatch across siblings',
        'https://a.example.com:8443',
        'https://b.example.com/',
        false,
      ],
      [
        'explicit default port across siblings',
        'https://a.example.com:443',
        'https://b.example.com:8443/',
        false,
      ],
      [
        'private suffix tenant isolation',
        'https://alice.github.io',
        'https://bob.github.io/',
        false,
      ],
      [
        'private tenant subdomain',
        'https://alice.github.io',
        'https://login.alice.github.io/',
        true,
      ],
      ['appspot tenant isolation', 'https://alice.appspot.com', 'https://bob.appspot.com/', false],
      ['public suffix alone', 'https://co.uk', 'https://example.co.uk/', false],
      ['private suffix alone', 'https://github.io', 'https://alice.github.io/', false],
      [
        'local parent does not include child',
        'https://skynet.local',
        'https://admin.skynet.local/',
        false,
      ],
      ['local siblings stay separate', 'https://a.skynet.local', 'https://b.skynet.local/', false],
      [
        'unknown suffix siblings stay separate',
        'https://a.company.internal',
        'https://b.company.internal/',
        false,
      ],
      ['localhost children stay separate', 'https://a.localhost', 'https://b.localhost/', false],
      [
        'IP-looking hostname is not an IP',
        'https://192.168.0.11',
        'https://x.192.168.0.11/',
        false,
      ],
    ],
    0,
  );
});

void describe('exact matching', () => {
  cases(
    [
      [
        'identical full URL',
        'https://example.com/login?x=1#part',
        'https://example.com/login?x=1#part',
        true,
      ],
      ['root slash normalization', 'https://example.com', 'https://example.com/', true],
      ['default port normalization', 'https://example.com:443/', 'https://example.com/', true],
      [
        'hostname case normalization',
        'https://EXAMPLE.com/login',
        'https://example.com/login',
        true,
      ],
      [
        'dot path normalization',
        'https://example.com/a/../login',
        'https://example.com/login',
        true,
      ],
      ['scheme-less HTTPS root', 'example.com', 'https://example.com/', true],
      ['scheme-less exact stays HTTPS', 'skynet.local', 'http://skynet.local/', false],
      ['different port', 'https://skynet.local', 'https://skynet.local:5001/', false],
      ['different path', 'https://example.com/login', 'https://example.com/other', false],
      ['path case differs', 'https://example.com/Login', 'https://example.com/login', false],
      [
        'trailing path slash differs',
        'https://example.com/login',
        'https://example.com/login/',
        false,
      ],
      [
        'extra query differs',
        'https://example.com/login',
        'https://example.com/login?next=1',
        false,
      ],
      [
        'query order differs',
        'https://example.com/?a=1&b=2',
        'https://example.com/?b=2&a=1',
        false,
      ],
      ['fragment differs', 'https://example.com/#one', 'https://example.com/#two', false],
      [
        'encoded path is not decoded',
        'https://example.com/a%2Fb',
        'https://example.com/a/b',
        false,
      ],
      ['explicit local HTTP', 'http://skynet.local:5000/', 'http://skynet.local:5000/', true],
    ],
    3,
  );
});

void describe('prefix matching', () => {
  cases(
    [
      ['identical prefix', 'https://example.com/login/', 'https://example.com/login/', true],
      ['child path', 'https://example.com/login/', 'https://example.com/login/step', true],
      ['query after prefix', 'https://example.com/login', 'https://example.com/login?next=1', true],
      [
        'literal prefix without path boundary',
        'https://example.com/login',
        'https://example.com/login-other',
        true,
      ],
      [
        'explicit slash constrains path',
        'https://example.com/login/',
        'https://example.com/login-other',
        false,
      ],
      ['root prefix', 'https://example.com', 'https://example.com/any', true],
      ['scheme-less prefix', 'example.com/login/', 'https://example.com/login/step', true],
      ['scheme-less prefix stays HTTPS', 'skynet.local', 'http://skynet.local/', false],
      ['query prefix', 'https://example.com/?next=', 'https://example.com/?next=home', true],
      ['fragment prefix', 'https://example.com/#login', 'https://example.com/#login/step', true],
      ['different path', 'https://example.com/login/', 'https://example.com/logout/', false],
      ['different case', 'https://example.com/Login', 'https://example.com/login', false],
      [
        'different origin suffix attack',
        'https://example.com',
        'https://example.com.evil.test/',
        false,
      ],
      ['different port', 'https://example.com', 'https://example.com:8443/', false],
      ['port prefix attack', 'https://example.com:80', 'https://example.com:8000/', false],
      ['different subdomain', 'https://example.com', 'https://login.example.com/', false],
      [
        'normalized traversal escapes prefix',
        'https://example.com/login/',
        'https://example.com/login/../other',
        false,
      ],
      [
        'encoded traversal escapes prefix',
        'https://example.com/login/',
        'https://example.com/login/%2e%2e/other',
        false,
      ],
    ],
    2,
  );
});

const invalidUrls = [
  '',
  ' ',
  'not a url',
  '//example.com',
  'https:example.com',
  'https:/example.com',
  'https:///example.com',
  'https:////example.com',
  'https://',
  'https://example.com:',
  'https://example.com:65536',
  'https://example.com:-1',
  'https://example.com:abc',
  'https://example.com:1.5',
  'https://[::1',
  'https://::1/',
  'https://[::1]:',
  'https://user@example.com',
  'https://user:password@example.com',
  'https://@example.com',
  'https://:password@example.com',
  'https://example.com@evil.test',
  'https://example.com\\@evil.test',
  'https://example.com\\path',
  'https://exam\tple.com',
  'https://exam\nple.com',
  'https://example.com/\rlogin',
  ' https://example.com',
  'https://example.com ',
  'https://example.com/\u0000',
  'javascript:alert(1)',
  'data:text/html,test',
  'file:///example.com',
  'ftp://example.com',
  'chrome://settings',
  'androidapp://com.example',
  'https://example.com%2fevil.test',
];

void describe('URL validation', () => {
  for (const input of invalidUrls) {
    void it(`rejects ${JSON.stringify(input)}`, () => assert.equal(webUrl(input), null));
  }
  for (const input of [
    'https://example.com/',
    'http://example.com/',
    'https://skynet.local:5001/',
    'https://[::1]/',
  ]) {
    void it(`accepts ${input}`, () => assert.equal(webUrl(input)?.href, input));
  }
});

for (const match of supportedModes) {
  void describe(`invalid input cannot match, mode ${match}`, () => {
    void it('rejects a missing URI', () =>
      assert.equal(matchesUri({ uri: null, match }, 'https://example.com'), false));
    for (const input of invalidUrls) {
      void it(`rejects invalid saved URI ${JSON.stringify(input)}`, () => {
        assert.equal(matchesUri({ uri: input, match }, 'https://example.com/'), false);
      });
      void it(`rejects invalid destination ${JSON.stringify(input)}`, () => {
        assert.equal(matchesUri({ uri: 'https://example.com/', match }, input), false);
      });
    }
    for (const uri of [
      'javascript:443',
      'mailto:443',
      'data:443',
      'ftp:443',
      'http:443',
      'https:443',
      'ssh:443',
      'view-source:443',
      'gopher:443',
      'custom:443',
    ]) {
      void it(`does not reinterpret a scheme as a hostname: ${uri}`, () => {
        assert.equal(matchesUri({ uri, match }, `https://${uri}`), false);
      });
    }
  });
}

void describe('unsupported match modes', () => {
  for (const match of [4, 5, -1, 6, 1.5, NaN, Infinity]) {
    void it(`rejects mode ${match}`, () => {
      assert.equal(matchesUri({ uri: 'https://example.com', match }, 'https://example.com'), false);
    });
  }
});

void describe('fillable URL policy', () => {
  for (const host of [
    'localhost',
    'a.localhost',
    'skynet.local',
    '127.0.0.1',
    '127.255.255.255',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.1.1',
    '[::1]',
  ]) {
    void it(`allows local HTTP for ${host}`, () => assert.ok(fillableUrl(`http://${host}:5000/`)));
  }
  for (const host of [
    'example.com',
    'localhost.evil.test',
    'skynet.local.evil.test',
    'router',
    'router.lan',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '169.255.1.1',
    '126.255.255.255',
    '11.0.0.1',
    '0.0.0.0',
    '8.8.8.8',
    '[2001:db8::1]',
    '[fc00::1]',
    '[fe80::1]',
  ]) {
    void it(`rejects unapproved HTTP host ${host}`, () =>
      assert.equal(fillableUrl(`http://${host}/`), null));
    void it(`allows HTTPS for ${host}`, () => assert.ok(fillableUrl(`https://${host}/`)));
  }
});

void describe('server URL normalization', () => {
  for (const [input, expected] of [
    ['https://EXAMPLE.com:443/', 'https://example.com'],
    ['https://vault.example.com/base/', 'https://vault.example.com/base'],
    ['https://skynet.local:8443', 'https://skynet.local:8443'],
  ]) {
    void it(`normalizes ${input}`, () => assert.equal(normalizeServer(input), expected));
  }
  for (const input of [
    'http://localhost',
    'example.com',
    'https://example.com/?x=1',
    'https://example.com/#fragment',
    ...invalidUrls,
  ]) {
    void it(`rejects server ${JSON.stringify(input)}`, () =>
      assert.throws(() => normalizeServer(input), /Use an HTTPS server URL/));
  }
});
