import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';

const root = resolve(import.meta.dirname, '../..');

test('10,000-item released renderer keeps the list bounded and search responsive', async () => {
  const server = createServer(async (request, response) => {
    const path = resolve(
      root,
      'dist/renderer',
      `.${request.url === '/' ? '/index.html' : request.url}`,
    );
    if (!path.startsWith(resolve(root, 'dist/renderer') + '/')) {
      response.writeHead(403);
      response.end();
      return;
    }
    const content = await readFile(path).catch(() => null);
    if (!content) {
      response.writeHead(404);
      response.end();
      return;
    }
    const type =
      { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(path)] ??
      'application/octet-stream';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    response.end(content);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 720 } });
    await page.addInitScript(() => {
      const items = Array.from({ length: 10_000 }, (_, index) => ({
        id: `fixture-${index}`,
        name: `Login ${String(index).padStart(5, '0')}`,
        username: `person-${index}@example.test`,
        website: `https://site-${index}.example.test`,
        type: 1,
        favorite: index % 10 === 0,
        hasPasskey: false,
        restricted: false,
      }));
      Object.defineProperty(window, 'latch', {
        value: {
          async state() {
            return {
              ok: true,
              value: {
                status: 'unlocked',
                email: 'performance@example.test',
                server: 'https://vault.bitwarden.com',
                lastSync: null,
                itemCount: items.length,
              },
            };
          },
          async items() {
            return { ok: true, value: items };
          },
          onState() {
            return () => undefined;
          },
          onFocusSearch() {
            return () => undefined;
          },
        },
      });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await expect(page.getByText('10000 items', { exact: true })).toBeVisible();
    const rowCount = await page.getByRole('option').count();
    expect(rowCount).toBeLessThan(40);
    const timings: number[] = [];
    for (let index = 0; index < 20; index++) {
      const name = `Login ${String(9000 + index).padStart(5, '0')}`;
      const duration = await page.evaluate(async (query) => {
        const input = document.querySelector<HTMLInputElement>('[aria-label="Search vault"]')!;
        const start = performance.now();
        return new Promise<number>((resolve, reject) => {
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error('Search did not finish'));
          }, 2_000);
          const observer = new MutationObserver(() => {
            const names = document.querySelectorAll('.item-row .item-text strong');
            if (names.length === 1 && names[0]!.textContent === query) {
              observer.disconnect();
              clearTimeout(timeout);
              requestAnimationFrame(() => resolve(performance.now() - start));
            }
          });
          observer.observe(document.querySelector('.item-list')!, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            input,
            query,
          );
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }, name);
      timings.push(duration);
    }
    timings.sort((a, b) => a - b);
    const report = {
      date: new Date().toISOString(),
      hardware: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {
        encoding: 'utf8',
      }).trim(),
      browser: browser.version(),
      dataset: '10,000 synthetic summaries; production renderer bundle; test IPC adapter',
      samples: timings.length,
      visibleRows: rowCount,
      searchP50Ms: +timings[10]!.toFixed(2),
      searchP95Ms: +timings[18]!.toFixed(2),
      excludes:
        'Unlock, sync, real IPC, and network; typing to matching DOM update and next animation frame',
    };
    expect(report.searchP95Ms).toBeLessThan(250);
    await mkdir(join(root, 'docs/verification'), { recursive: true });
    await writeFile(
      join(root, 'docs/verification/search-performance.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log('Search benchmark:', JSON.stringify(report));
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
