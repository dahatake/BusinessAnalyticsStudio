// 中継プロセスの起動: `npm run relay`。ポートは .env の EDB_RELAY_PORT（既定 8787）。待ち受けは 127.0.0.1 に固定。
import { loadCopilotSdk } from './copilot-adapter';
import { startRelay } from './relay';
import { azureConfigFromEnv, createAzureServices } from './azure-services';

const port = Number(process.env.EDB_RELAY_PORT ?? 8787);
const sdk = await loadCopilotSdk();
// 音声合成・手書き認識のキーは、この中継プロセスの環境変数（.env）だけから読む（FR-182・NFR-SEC-001）
const azure = createAzureServices(azureConfigFromEnv(process.env));
// Microsoft Foundry（現状の説明・生成AIの活用分析）の接続情報は、設定画面から入れて中継の暗号化した保管庫に置く共通接続（FR-275）だけ。環境変数は使わない
const relay = await startRelay({ sdk, azure, port });
console.log(`中継プロセスを ${relay.url} で待ち受けています（SDK の認証状態は設定画面で確認してください。未認証では実接続できません）`);
