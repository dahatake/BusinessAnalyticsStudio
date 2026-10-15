// 中継プロセスの起動: `npm run relay`。ポートは .env の EDB_RELAY_PORT（既定 8787）。待ち受けは 127.0.0.1 に固定。
import { loadCopilotSdk } from './copilot-adapter';
import { startRelay } from './relay';
import { azureConfigFromEnv, createAzureServices } from './azure-services';

const port = Number(process.env.EDB_RELAY_PORT ?? 8787);
const sdk = await loadCopilotSdk();
// 音声合成・手書き認識のキーは、この中継プロセスの環境変数（.env）だけから読む（FR-182・NFR-SEC-001）
const azure = createAzureServices(azureConfigFromEnv(process.env));
const relay = await startRelay({ sdk, azure, port });
console.log(`中継プロセスを ${relay.url} で待ち受けています（Copilot SDK: ${sdk ? '利用可能' : '未導入または未サインイン。モックで動作'}）`);
