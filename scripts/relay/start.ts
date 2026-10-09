// 中継プロセスの起動: `npm run relay`。ポートは .env の EDB_RELAY_PORT（既定 8787）。待ち受けは 127.0.0.1 に固定。
import { loadCopilotSdk } from './copilot-adapter';
import { startRelay } from './relay';

const port = Number(process.env.EDB_RELAY_PORT ?? 8787);
const sdk = await loadCopilotSdk();
const relay = await startRelay({ sdk, port });
console.log(`中継プロセスを ${relay.url} で待ち受けています（Copilot SDK: ${sdk ? '利用可能' : '未導入または未サインイン。モックで動作'}）`);
