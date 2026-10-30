# FR-043 / FR-287: 実装前の検証契約（run 202610250852）

期待値は要求commit `63f4363` の AC-054・748・749・750・753。
既存の実装を期待値にせず、旧提供確認の E2E-146 を差し替える。新要求・重複ケースは作らない。

## 対応・入力

- E2E-146 / AC-054: モノ・コトのデモ、保存済みProject。旧 `mock-app` のみの枝、混在タブのactive、
  浮動・最小化・ピン止めを含む旧形式レイアウトを初回起動前に投入する。
  保存済みProjectは端末内Projectのfixtureと公開Markdown読み込み経路で用意する。
  初回だけ投入し、再読込時には再投入しない。
  保存済みモックの画面名と解決策名は配信元デモと変え、再読込でデモへ戻るバグも検出する。
- モノとProjectは旧説明キーあり、コトはなし。起動・保存・再読込・ZIP書き出しの結果を、
  **最初の入力パック**の全 `mocks`・全 `issues`（解決策と参照を含む）・`screenGuides` と比較。
  元 `mocks.json` のバイト列と配信内容も確認する。表示の削除をデータ削除で実現しないこと。
- メニュー・追加/切替候補・旧コマンド検索・ステッパーからの到達を検査する。
  追加/切替の入口そのものが廃止されている場合はその入口の存在を要求しない。
  残機能は課題-解決策の項目選択可能性、ユースケース/ホワイトボードの表示、
  Projectの「ユースケース作成」ステップの到達、チャットの汎用モック応答で確認する。
- IT-080 / AC-748: 固定の23キーと登録簿の一致、両パックの非空・120文字以内、
  旧キーの有無の受け入れ、入力保持、現役キー欠落・上限超過の拒否。
  既存ケースを再利用してテストを更新した。ただし有効化するとCHK-10
  （integrationはSystem Testの対象外）になるため、台帳の停止は維持する。
  要求の検証レベルを勝手に変更せず、上記Nodeコマンドによる直接実行を引き渡す。
- E2E-430 / AC-749: 両デモの23画面の説明。設定はモーダル。
- E2E-431 / AC-750: 両デモの設定以外22画面。キー→データ種別は下表。

| キー | 表示データの種類 |
|---|---|
| issue-solution | 行（課題・解決策） |
| priority | 行（課題・解決策） |
| summary | 行（サマリー） |
| matrix | ノード（課題・解決策の点） |
| ranking | 行（順位） |
| knowledge-graph | ノード |
| business-graph | ノード |
| architecture | 図形（構成要素） |
| discussion-tree | ノード |
| table | 行 |
| gantt | 工程 |
| map | 場所 |
| kpi-okr | 行（KPI/OKR） |
| twin-view | ノード |
| sources | 行（出典） |
| usecase | 行（ユースケース） |
| data-catalog | 行（データエンティティ） |
| spatial-view | 図形（空間） |
| whiteboard | 付箋 |
| themes | 行（議論テーマ） |
| genai-scenario | 行（シナリオ） |
| chat | メッセージ |

## AC-753（manual）

既存 `docs/manual-tests.md` の FR-287 手順は要求commitで23画面へ更新済み。その手順をそのまま使用する。
両デモについて上表の22キーと `settings` の計23件を初めて使う人が確認し、
画面キー・表示説明・参加者の発言・可否・理由・証跡を記録する。
旧キーは任意の互換データなので説明の必須対象に加えない。旧画面へ到達できた場合は廃止未完了。
意味の理解を文字列検査の自動テストで代替したり、manual未実施をpass扱いにしたりしない。

## 依存・起動・実行

- 依存: ルートの `node_modules`（tsx）、`tests/system/node_modules`（Playwright・JSZip・TypeScript）、
  PlaywrightのChromium、ビルド済み `dist/index.html`、`examples/mono` / `examples/koto`。
- 製品変更後に conductor が `npm run build` を実行し、古いdistで判定しない。
  各E2Eの `start` がローカル `127.0.0.1` のランダムポートでdistとパックを配信するため、
  手動のdevサーバー・Azure・実AI接続・資格情報は不要。終了時はfixtureがサーバーを停止する。
- E2E実行: `node tests/system/run.mjs AC-054 AC-749 AC-750`。
- データ検証: `node --test --test-name-pattern=AC-748 tests/system/integration-demo/screen-guides.test.mjs`。
  オプションはファイル名より前に置く。パック変種は `work/` の下だけに作成し終了時に削除する。
- 収集: `node tests/system/node_modules/@playwright/test/cli.js test --config tests/system/playwright.config.ts --grep "AC-(054|749|750)(?![0-9])" --list`。
  `ledger.py preflight` はpytestだけを収集するため、Playwrightの収集とNodeの構文確認も別途実施する。
- 変更ケースはすべて `not_run` で渡す。実装前の挙動確認を実行する場合も `ledger.py run --no-record` を使い、
  成功実績を捏造しない。既存canary E2E-162/345/346/351の基点FAILと
  toolkit-integration-catalogの13件の基点FAILは、本変更の合否と分離する。

## 実装役への回帰注意

既存の `quality.spec.ts` AC-180 は旧モック表示をまだ要求し、
`workspace-free-maximize.spec.ts` AC-591/592 の対象一覧にも `mock-app` がある。
今回の担当AC以外の期待値は独断で変更しない。conductor / rd-author が
NFR-LEGAL-002等の廃止後の適用範囲を確認してから、必要なケース更新を別途依頼すること。

また、基点の登録簿には要求の23キーに加えて `mock-app` と `memo` があり、現在25件。
`mock-app` だけを廃止しても24件となり、AC-748の「23件すべて」と一致しない。
本テストの期待値は依頼の23件を維持する。`memo` は FR-043 と無関係な既存画面として残す（conductor 判断。
AC-748 の前提テストは「23キーすべてあり・mock-app なし・それ以外は memo だけ許容」）。
実装役は件数を合わせるためだけに `memo` を削除しないこと。
`quality.spec.ts` AC-180 は廃止画面の「モック（イメージ）」部分を外し、`workspace-free-maximize.spec.ts` の対象から `mock-app` を外した。

## 実装前の実行可能性確認

- 対象Playwrightは7件収集。対象2ファイルとその依存先のTypeScript検査、
  Nodeテストの構文確認はexit 0。
- System Test全体の型検査は既存 `support/relay-stub.ts:108` のTS2678で失敗。
  担当外なので変更していない。
- ローカルChromiumとfixtureサーバーは起動できた。両デモのAC-749/750は4件ともpass。
  AC-054はモノと保存済みProjectで起動・fixture投入まで到達し、
  `nav-mock-app` が1件残るため最初の廃止アサーションでfail（想定どおりの未実装検出）。
  その後のデータ保持・書き出し経路、およびAC-054のコト分岐は未完走。
- AC-748の直接実行は5件収集・2 pass / 3 fail。
  登録簿が25件であることと、旧キーなしの両パックを既存スキーマが拒否することを検出。
  旧キーあり・異常入力の後続アサーションはその修正後に再実行する。
- これらは台帳へ結果を書き込まない設計時の確認。
  E2E-146/430/431は `not_run`、IT-080は検証レベルによる `blocked` を維持。
  証跡は `work/runs/202610250852/evidence/playwright/` の
  `st-design-smoke` と `st-design-project-koto`。
