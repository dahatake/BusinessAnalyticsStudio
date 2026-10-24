// 中継プロセスの起動: `npm run relay`。ポートは .env の EDB_RELAY_PORT（既定 8787）。待ち受けは 127.0.0.1 に固定。
import { loadCopilotSdk } from './copilot-adapter';
import { startRelay } from './relay';
import { createAzCliTokenProvider } from './foundry-token';
import { azureConfigFromEnv, createAzureServices } from './azure-services';

const port = Number(process.env.EDB_RELAY_PORT ?? 8787);
const sdk = await loadCopilotSdk();
// 音声合成・手書き認識のキーは、この中継プロセスの環境変数（.env）だけから読む（FR-182・NFR-SEC-001）
const azure = createAzureServices(azureConfigFromEnv(process.env));
// Microsoft Foundry（現状の説明・生成AIの活用分析）の接続情報は、設定画面から入れて中継の暗号化した保管庫に置く共通接続（FR-275）だけ。環境変数は使わない
// 認証方式が Microsoft Entra ID のときのトークンは、Azure CLI のサインインから取得する（FR-282 AC-761。値はログに出さない）
const relay = await startRelay({ sdk, azure, port, foundryToken: createAzCliTokenProvider() });
console.log(`中継プロセスを ${relay.url} で待ち受けています（Copilot SDK: ${sdk ? '利用可能' : '未導入または未サインイン。モックで動作'}）`);
