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

- **サインイン方式が既定（キー不要）**です。GitHub Copilot CLI の保存済み資格情報を使います。代替のトークン方式は中継側の暗号化保管庫だけに保存し、画面に再表示しません。Foundry は API キーと Microsoft Entra ID の両方に対応します。
- 公式 `@github/copilot-sdk` 1.0.26（MIT）は依存に含まれます。`npm ci` で復元してください。SDK の起動成功ではなく `getAuthStatus` の結果で認証状態を判定します。未認証・オフラインでは実接続を有効にできません。
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
| `POST /ask` | 従来の 5 種の AI 処理の入口。Copilot SDK 固定。共通接続の選択の対象外 |
| `GET・PUT /ai/provider` | 共通生成AIの接続先（`foundry` / `copilot`）。再起動後も保持 |
| `GET・PUT・DELETE /copilot/config` | 認証方式・モデル名・暗号化トークンの管理（トークンの値は取得不可） |
| `GET・POST /copilot/signin` | Web サインインの開始・固定 URL とコード・SDK 認証状態の取得 |
| `POST /foundry/ask・review・analyze` | 共通接続で選択した先だけに送信 |
| `POST /foundry/import` | Foundry 専用。Copilot 選択時は未対応で呼び出し 0 回 |

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

## 5.6 共通生成AIの接続先と認証（FR-275・FR-011）

1. 設定の「生成AIの接続先」で Microsoft Foundry（既定）または GitHub Copilot SDK を選びます。
2. Foundry は既存のエンドポイント・デプロイ名・API キー、または Entra ID を設定します。Copilot 選択時に Foundry キーは不要です。
3. Copilot の「サインイン」では「GitHub にサインイン」を押し、表示されたワンタイムコードを https://github.com/login/device で承認します。中継はシェルなしの固定引数 `gh auth login --web` を最大 300 秒実行します。出力の全文やトークンは表示しません。
4. GitHub CLI の成功は SDK の認証成功を保証しません。未サインインなら端末で `copilot` を起動して `/login` を行い、「認証状態を再確認」を押すか、トークン方式を選びます。VS Code との資格情報共有も保証しません。
5. トークン方式は伏せ字入力から保存します。保存後は「設定済み」と固定伏せ字だけです。「トークンを削除」後はサインイン方式へ自動フォールバックしません。モデル名は任意（空なら SDK の既定）です。
6. 顧客了承を記録し、送信先・費用・送信内容を確認して実接続を有効にします。Copilot の費用は利用者の契約に従い、Foundry の円予算には加算しません。回数・大きさの上限は引き続き適用します。種別「人」の送信確認も必要です。
7. 接続先、認証方式、モデル、トークン、Foundry 設定を変更・削除すると実接続は解除されます。再確認・再有効化まで生成要求は送信しません。接続先は再起動後も保持しますが、有効化は保持しません。

設定の保存先は `EDB_RELAY_DATA`（省略時は OS のユーザーデータフォルダー）で、リポジトリの外です。公開の選択・モデル名と、既存保管庫と同等の AES-256-GCM・マスター鍵保護で暗号化したトークンを分離します。SDK は生成専用で、ツール・MCP・スキル・コマンドの自動実行や権限許可を無効にしています。認証確認・生成のクライアントは毎回終了し、生成は 60 秒で打ち切ります。
