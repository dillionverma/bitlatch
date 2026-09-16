import {
  test,
  expect,
  _electron as electron,
  chromium,
  type ElectronApplication,
} from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createFixtureAccount, fixtureApiKey } from '../fixture-account';
import { startTestTlsProxy } from '../tls-proxy';

const root = resolve(import.meta.dirname, '../..');
const website = 'http://localhost:8230';
const browserKind = process.env.LATCH_TEST_BROWSER === 'aside' ? 'aside' : 'chromium';
const appExecutable = process.env.LATCH_TEST_APP;
const extensionPath = appExecutable
  ? resolve(dirname(appExecutable), '../Resources/app.asar.unpacked/dist/extension')
  : join(root, 'dist/extension');
const fixtureLogin = {
  name: 'Northstar',
  username: 'hello@example.test',
  password: 'synthetic-only-Northstar-42-🔐-é!',
};
let fixtureServer: Server;
let acceptedSignIns = 0;
let tlsProxy: Awaited<ReturnType<typeof startTestTlsProxy>>;

test.beforeAll(async () => {
  tlsProxy = await startTestTlsProxy();
  fixtureServer = createServer((request, response) => {
    if (request.url === '/login' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const data = new URLSearchParams(body);
        const valid =
          data.get('username') === fixtureLogin.username &&
          data.get('password') === fixtureLogin.password;
        if (valid) acceptedSignIns++;
        response.writeHead(valid ? 200 : 401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(valid ? '<h1>You’re signed in.</h1>' : '<h1>Incorrect credentials.</h1>');
      });
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><html lang="en"><head><title>Northstar — sign in</title><style>body{background:#f5f5f1;font:14px system-ui;color:#353a30;display:grid;place-items:center;height:100vh;margin:0}form{background:#fff;padding:40px;border:1px solid #e1e5db;border-radius:14px;width:330px}h1{font-size:24px;font-weight:500;margin:30px 0 8px}p{color:#8a9280;font-size:12px;margin-bottom:30px}label{display:block;font-size:11px;color:#7f8876;margin-top:20px}input{box-sizing:border-box;width:100%;padding:13px;margin-top:8px;border:1px solid #dce1d5;border-radius:6px;font:14px system-ui}button{width:100%;padding:12px;border:0;border-radius:6px;background:#7d8e5c;color:white;margin-top:25px;font:13px system-ui}.brand{font-size:11px;letter-spacing:3px;color:#7d8e5c}</style></head><body><form method="post" action="/login"><div class="brand">NORTHSTAR</div><h1>Welcome back.</h1><p>Sign in to your workspace.</p><label>Email<input name="username" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form></body></html>`,
    );
  });
  await new Promise<void>((resolve) => fixtureServer.listen(8230, '::', resolve));
});

test('personal API key sign-in still requires the master password', async () => {
  const account = await createFixtureAccount();
  const api = await fixtureApiKey(account);
  const dataDir = await mkdtemp(join(tmpdir(), 'latch-api-e2e-'));
  const application = await electron.launch({
    ...(appExecutable ? { executablePath: appExecutable, args: [] } : { args: [root] }),
    env: {
      ...process.env,
      LATCH_DATA_DIR: dataDir,
      NODE_EXTRA_CA_CERTS: tlsProxy.certPath,
      LATCH_TEST_BUNDLED_CLI: '1',
    },
  });
  try {
    const page = await application.firstWindow();
    await page.getByLabel('Email address').fill(account.email);
    await page.getByLabel('Master password').fill(account.password);
    await page.getByLabel('Server', { exact: true }).selectOption('custom');
    await page.getByLabel('Server address').fill(tlsProxy.url);
    await page.getByRole('button', { name: 'Personal API key sign-in' }).click();
    await page.getByLabel('Client ID', { exact: true }).fill(api.clientId);
    await page.getByLabel('Client secret', { exact: true }).fill(api.clientSecret);
    await page.getByRole('button', { name: 'Connect your vault' }).click();
    await expect(
      page.getByRole('heading', { name: 'All items', exact: true }).or(page.getByRole('alert')),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'All items', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lock vault', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await page.getByLabel('Master password').fill('wrong-fixture-password');
    await page.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'All items', exact: true })).toHaveCount(0);
  } finally {
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  await tlsProxy.close();
});

test(`${browserKind}: real vault → desktop create/edit → native bridge → browser fill → lock → offline unlock`, async () => {
  test.setTimeout(180_000);
  const fixture = await createFixtureAccount();
  const dataDir = await mkdtemp(join(tmpdir(), 'latch-e2e-'));
  const browserDir = await mkdtemp(join(tmpdir(), 'latch-browser-'));
  let application: ElectronApplication | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  const launchOptions = {
    ...(appExecutable ? { executablePath: appExecutable, args: [] } : { args: [root] }),
    env: {
      ...process.env,
      LATCH_DATA_DIR: dataDir,
      LATCH_BROWSER_ROOT: dataDir,
      NODE_EXTRA_CA_CERTS: tlsProxy.certPath,
      LATCH_TEST_BUNDLED_CLI: '1',
    },
  };
  await mkdir(join(root, 'docs/screenshots'), { recursive: true });
  try {
    application = await electron.launch(launchOptions);
    let page = await application.firstWindow();
    if (appExecutable) expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('Renderer error:', error.message);
    });
    await expect(page.getByRole('heading', { name: 'Your vault, within reach.' })).toBeVisible();
    await page.getByLabel('Email address').fill(fixture.email);
    await page.getByLabel('Master password').fill(fixture.password);
    await page.getByLabel('Server', { exact: true }).selectOption('custom');
    await page.getByLabel('Server address').fill(tlsProxy.url);
    await page.getByRole('button', { name: 'Connect your vault' }).click();
    await expect(
      page.getByRole('heading', { name: 'All items', exact: true }).or(page.getByRole('alert')),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'All items', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'New login', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(fixtureLogin.name);
    await page.getByLabel('Website', { exact: true }).fill(website);
    await page.getByLabel('Username', { exact: true }).fill(fixtureLogin.username);
    await page.getByLabel('Password', { exact: true }).fill(fixtureLogin.password);
    await page
      .getByLabel('Notes', { exact: true })
      .fill('A disposable login created by the end-to-end test.');
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await page.getByRole('button', { name: 'Save login' }).click();
    await expect(page.getByRole('heading', { name: 'Northstar', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Reveal password' }).click();
    await expect(page.locator('.field-value.password')).toHaveText(fixtureLogin.password);
    await page.getByRole('button', { name: 'Hide password' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Notes', exact: true })
      .fill('Updated through Latch; encrypted by the official Bitwarden CLI.');
    await page.getByRole('button', { name: 'Save login' }).click();
    await expect(page.locator('.notes')).toContainText('Updated through Latch', {
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Copy password' }).click();
    const copiedCorrectly = await application.evaluate(
      async ({ clipboard }, expected) => (await clipboard.readText()) === expected,
      fixtureLogin.password,
    );
    expect(copiedCorrectly).toBe(true);
    await page.getByRole('button', { name: 'Browser & settings' }).click();
    await page.getByRole('button', { name: 'Connect browser', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bridge connected' })).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.screenshot({
      path: join(root, 'docs/screenshots/desktop-light.png'),
      animations: 'disabled',
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      path: join(root, 'docs/screenshots/desktop-dark.png'),
      animations: 'disabled',
    });
    await page.emulateMedia({ colorScheme: 'light' });

    // Chromium resolves user-level native hosts under its chosen user-data directory.
    await mkdir(join(browserDir, 'NativeMessagingHosts'), { recursive: true });
    await copyFile(
      join(
        dataDir,
        'Library/Application Support/Google/Chrome/NativeMessagingHosts/app.latch.vault.json',
      ),
      join(browserDir, 'NativeMessagingHosts/app.latch.vault.json'),
    );

    browser = await chromium.launchPersistentContext(browserDir, {
      ...(browserKind === 'aside'
        ? { executablePath: '/Applications/Aside.app/Contents/MacOS/Aside' }
        : { channel: 'chromium' }),
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      viewport: { width: 1100, height: 800 },
    });
    const tab = await browser.newPage();
    await tab.goto(website);
    const service = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    const nativeStatus = await service.evaluate(async () =>
      chrome.runtime.sendNativeMessage('app.latch.vault', { type: 'status' }),
    );
    expect(nativeStatus).toEqual({ ok: true, value: 'unlocked' });
    await tab.getByLabel('Password', { exact: true }).click();
    await expect
      .poll(async () => {
        return service.evaluate(async () =>
          chrome.runtime.sendNativeMessage('app.latch.vault', {
            type: 'matches',
            url: 'http://localhost:8230/',
          }),
        );
      })
      .toMatchObject({ ok: true, value: { state: 'unlocked', items: [{ name: 'Northstar' }] } });
    // The picker uses a closed shadow root. Exercise its real keyboard controls.
    await tab.keyboard.press('ArrowDown');
    await tab.screenshot({ path: join(root, `docs/screenshots/inline-${browserKind}.png`) });
    await tab.keyboard.press('Enter');
    await expect(tab.getByLabel('Email')).toHaveValue(fixtureLogin.username);
    await expect(tab.getByLabel('Password', { exact: true })).toHaveValue(fixtureLogin.password);
    await tab.getByLabel('Password', { exact: true }).press('Enter');
    await expect(tab.getByRole('heading', { name: 'You’re signed in.' })).toBeVisible();
    expect(acceptedSignIns).toBe(1);

    await service.evaluate(async () =>
      chrome.storage.local.set({ autoFillOrigins: ['http://localhost:8230'] }),
    );
    await tab.goto(website);
    await expect(tab.getByLabel('Email')).toHaveValue(fixtureLogin.username);
    await expect(tab.getByLabel('Password', { exact: true })).toHaveValue(fixtureLogin.password);
    expect(acceptedSignIns).toBe(1); // Filling never submits the form.
    await tab.goto('http://127.0.0.1:8230');
    await expect(tab.getByLabel('Email')).toHaveValue('');
    const wrongOrigin = await service.evaluate(async () =>
      chrome.runtime.sendNativeMessage('app.latch.vault', {
        type: 'matches',
        url: 'http://127.0.0.1:8230/',
      }),
    );
    expect(wrongOrigin).toEqual({ ok: true, value: { state: 'unlocked', items: [] } });

    await page.getByRole('button', { name: 'Lock vault', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    const clipboardCleared = await application.evaluate(
      async ({ clipboard }) => (await clipboard.readText()) === '',
    );
    expect(clipboardCleared).toBe(true);
    const lockedMatches = await service.evaluate(async () =>
      chrome.runtime.sendNativeMessage('app.latch.vault', {
        type: 'matches',
        url: 'http://localhost:8230/',
      }),
    );
    expect(lockedMatches).toEqual({ ok: true, value: { state: 'locked', items: [] } });
    const noSecretsOnDisk = await readFile(join(dataDir, 'bitwarden/data.json'), 'utf8');
    expect(noSecretsOnDisk).not.toContain(fixtureLogin.password);
    expect(noSecretsOnDisk).not.toContain(fixture.password);

    tlsProxy.setOffline(true);

    await page.getByLabel('Master password').fill('intentionally-wrong-password');
    await page.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Master password').fill(fixture.password);
    await page.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(page.getByRole('heading', { name: 'All items', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('option').filter({ hasText: 'Northstar' }).click();
    await expect(page.locator('.notes')).toContainText('Updated through Latch');
    expect(errors).toEqual([]);

    await application.close();
    application = await electron.launch(launchOptions);
    page = await application.firstWindow();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel('Master password').fill(fixture.password);
    await page.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(page.getByRole('option').filter({ hasText: 'Northstar' })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    tlsProxy.setOffline(false);
    await browser?.close();
    await application?.close();
    await rm(dataDir, { recursive: true, force: true });
    await rm(browserDir, { recursive: true, force: true });
  }
});
