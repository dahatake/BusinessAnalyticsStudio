// FR-228 AC-529: one read-only app server for the whole parallel Q-115 run.
// Each Playwright test still gets its own browser context and synthetic data.
import { examplePack } from './packs';
import { startStaticServer, unusedPort } from './server';

export default async function setup() {
  const relayUrl = `http://127.0.0.1:${await unusedPort()}`;
  const server = await startStaticServer({
    pack: { root: examplePack('mono').root },
    runtimeConfig: { relayUrl, aiMock: { delayMs: 0 } },
  });
  process.env.ST_Q115_LAYOUT_URL = server.url;
  return async () => {
    delete process.env.ST_Q115_LAYOUT_URL;
    await server.close();
  };
}
