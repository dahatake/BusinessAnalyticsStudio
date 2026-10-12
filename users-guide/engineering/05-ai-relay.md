# 5. AI と中継プロセス

対象: AI の連携を設定・拡張・保守する Software Engineer。

## 5.1 全体像

```
ブラウザー（アプリ）
   │  askAi(kind, prompt)            src/ai/client.ts
   │   ├─ 既定: モック（何も送信しない。「AI 生成（モック）」）
   │   └─ 実接続を有効にしたとき: POST {relayUrl}/ask
   ▼
中継プロセス（127.0.0.1 だけで待ち受け）   scripts/relay/
   ▼
Copilot SDK（@github/copilot-sdk。利用者の PC の Copilot CLI のサインインを使う）
```

- **API キーは持ちません。** GitHub Copilot のサインイン（`copilot` を起動して `/login`）を使います。
- Copilot SDK は任意の依存です。入っていない・サインインしていないときは、中継プロセスはモックで動きます（起動メッセージに「未導入または未サインイン。モックで動作」と出ます）。
- ブラウザーからの送信先は、**設定された localhost の中継プロセスだけ**です（`isLoopbackUrl` で検査）。

## 5.2 起動と設定

```
npm run relay          # ポートは .env の EDB_RELAY_PORT（既定 8787）。待ち受けは 127.0.0.1 に固定
```

| 設定 | 場所 | 内容 |
|---|---|---|
| `EDB_RELAY_PORT` | `.env`（`.env.example` の複製。git に入れない） | 中継プロセスのポート |
| `EDB_AI_API_KEY` | `.env` | 通常は空。ほかの AI API を使うときだけ値を入れる（コードに書かない） |
| `relayUrl`・`aiMock` | `/runtime-config.json`（任意。配信側が置く） | アプリが使う中継プロセスの URL と、モックの待ち時間 |

アプリ側では、設定パネルの「**AI 接続**」で「AI の実接続を有効にする（GitHub Copilot）」を ON にします。有効にする前に、送信される情報の種類を示して確認を求めます。この設定は**顧客パックごと**で、別の顧客パックで起動するとモックに戻ります（FR-132）。

さらに、企業ごとに「**外部 AI への送信を許可する**」（企業と Project の欄）を ON にした企業だけが、AI に送信できます。既定は許可なしです（FR-140）。

## 5.3 中継プロセスの HTTP

| メソッド・パス | 内容 |
|---|---|
| `GET /health` | 生存確認。アプリは `probeRelay` でこれを呼び、状態表示（モック／接続済み）を決める |
| `POST /ask` | すべての AI 処理の入口。本文に `kind` と `prompt` |

- `Origin` が localhost 系（`localhost`・`127.0.0.1`・`::1`）でないリクエストは `403` で拒否します。
- ループバック以外の host を指定すると、起動を拒否します。
- 処理の種類（`AiKind`）: `structure`・`summary`・`recommend`・`chat`・`exec-summary`。

System Test は、`tests/system/support/relay-stub.ts` のスタブを中継プロセスの代わりに使います（HTTP の形は [CONTRACT.md](../../tests/system/CONTRACT.md) §5）。

## 5.4 守ること（顧客データの保護）

1. 実接続を明示的に有効にするまで、**何も送信しない**。モックの文言（「実際の AI には送信していません」）を保つ。
2. 送信前に、送る情報の種類を利用者に示す。企業ごとの許可がなければ送らない。
3. AI の出力には必ず「AI 生成」（モックは「AI 生成（モック）」）を付け、**採用するまで**顧客の決定値に混ぜない。AI の提案値と顧客の決定値は別に持つ。
4. 中継プロセスを 127.0.0.1 以外で待ち受けさせない（社内ネットワークへ公開しない）。
5. 外部の AI の応答は信頼しない。画面に出す前に、型と長さを検査し、HTML として解釈しない。

## 5.5 トラブルシュート

| 症状 | 確認すること |
|---|---|
| ずっと「AI: モック」のまま | `npm run relay` を起動しているか。設定パネルで実接続を ON にしたか。企業の「外部 AI への送信を許可する」が ON か |
| 中継は起動したがモックで動く | 起動メッセージが「未導入または未サインイン」か。`copilot` で `/login`。`@github/copilot-sdk` が入っているか（`scripts/setup.ps1`・`setup.sh` が導入する） |
| `403 forbidden origin` | ブラウザーの URL が localhost／127.0.0.1 か。LAN の別端末（iPad など）からの AI 実接続は、仕様上できない |
| ポートが使用中 | `.env` の `EDB_RELAY_PORT` を変える。`runtime-config.json` の `relayUrl` も合わせる |
