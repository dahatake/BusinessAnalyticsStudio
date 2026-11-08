// AC-226 / AC-529 / AC-584: reuse a shared server when the runner provides one,
// otherwise use one local app server per Playwright worker.
// Each test receives a new browser context, so state-changing scenarios do not share layout data.
import { test as base, disableFsAccess, gotoAndEnter, skipOpening } from './fixtures';
import { examplePack } from './packs';
import { startStaticServer, unusedPort, type RunningServer } from './server';

type LayoutApp = {
  url: string;
  initialStorage: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;
  reload(): Promise<void>;
};

export const layoutTest = base.extend<{ layoutApp: LayoutApp }, { layoutServer: RunningServer }>({
  layoutServer: [async ({}, use) => {
    const sharedUrl = process.env.ST_Q115_LAYOUT_URL;
    if (sharedUrl) {
      const parsed = new URL(sharedUrl);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port) {
        throw new Error('Q-115 shared server must use a loopback URL and a dynamically allocated port');
      }
      await use({ url: sharedUrl, port: Number(parsed.port), requests: [], close: async () => {} });
      return;
    }
    const relayUrl = `http://127.0.0.1:${await unusedPort()}`;
    const server = await startStaticServer({
      pack: { root: examplePack('mono').root },
      runtimeConfig: { relayUrl, aiMock: { delayMs: 0 } },
    });
    try { await use(server); } finally { await server.close(); }
  }, { scope: 'worker' }],
  layoutApp: async ({ page, layoutServer }, use) => {
    const initialStorage = await page.context().storageState();
    await disableFsAccess(page);
    const url = `${layoutServer.url}/?e2e=1`;
    await gotoAndEnter(page, url);
    await use({
      url,
      initialStorage,
      reload: async () => { await page.reload(); await skipOpening(page); },
    });
  },
});
