# 4. カスタマイズ

利用者が変えられる設定は、`scripts/ebak.config.json` に集まっています。ファイルが読めない（JSON の誤りなど）ときは警告を出して既定値で動作し、書いたキーだけが既定値を上書きします（入れ子の項目は、書いたものだけが上書きされます）。

| キー | 内容 | 節 |
|---|---|---|
| `verify.commands`・`verify.timeout_sec` | verify が実行するビルド・静的検査・テストのコマンド | [4.1](#41-検証コマンドの登録verifycommands) |
| `models` | 作業役ごとのモデル | [4.2](#42-モデルの割り当てmodels) |
| `gates` | hook のゲートの設定 | [4.3](#43-ゲートの調整gates) |
| （MCP Server・plugin・拡張機能） | 利用者が設定したツールの使い方 | [4.4](#44-mcp-serverplugin拡張機能を使う) |
| `management_files`・`base_branch`・`checks`・`work` | 管理データの場所、基準のブランチ、検査、作業ディレクトリ | [4.5](#45-管理データ検査作業ディレクトリの設定) |

設定を変えたら、`python scripts/verify.py --docs-only` で JSON の誤りがないかを確かめます。verify のキャッシュは設定ファイルの内容をキーに含むので、変更は次の verify に反映されます。

## 4.1 検証コマンドの登録（verify.commands）

`verify.commands` は、`verify.py` が管理データの検査（CHK-01〜27）に続けて実行するコマンドの配列です。アプリのビルド・静的検査・テストを登録します。空のままだと、verify は `INFO verify.commands が空です` と表示し、管理データの検査だけを行います。

```json
"verify": {
  "timeout_sec": 1800,
  "commands": [
    { "name": "typecheck", "run": "npm run typecheck" },
    { "name": "build", "run": "npm run build" },
    { "name": "unit", "run": "npx vitest run tests/unit/projects.test.ts" },
    { "name": "e2e-smoke", "run": "npx playwright test --grep @canary", "slow": true, "timeout_sec": 3600 }
  ]
}
```

| 項目 | 意味 |
|---|---|
| `name` | 出力とログの名前です。省略するとコマンドの先頭の語から作ります。同じ名前は `-2` のように番号が付きます |
| `run` | 実行するコマンドです。リポジトリのルートで、シェルを通して実行します。終了コードが 0 なら PASS です（`command`・`cmd` の名前でも受け付けます） |
| `slow` | `true` にすると、`verify.py --quick` では `SKIP` されます。implementer のゲート（作業役の worktree）と、統合のたびの verify は `--quick` なので、重いテストをここに置くと、速さを保てます |
| `timeout_sec` | そのコマンドだけの制限時間（秒）です。省略時は `verify.timeout_sec`（既定 1800）です |

- 文字列だけの要素（`"npm test"`）も、`{ "run": "npm test" }` として扱います。
- `slow` のコマンドは、`verify.py`（`--quick` なし）が実行します。統合は 5 項目ごとに全コマンドを実行し（`integrate.py merge --full`）、工程 6 でも `slow` を含めて実行します。
- `"run"` がない要素や、配列でない値は `FAIL config …` になり、書き方が表示されます。
- ログの全文は `work/runs/<run-id>/logs/` に保存されます。画面には要約だけが出ます。`python scripts/summarize.py <ログ>` で、さらに短くできます。
- 初めての実行で implementer がビルド・テストのコマンドを見つけられなかったときは、その技術スタックの標準のコマンドを登録します（implementer の規則）。利用者があらかじめ書いておくと、作業役の判断が減ります。
- コマンドは、**どのディレクトリでも同じ結果になる** 書き方にします。作業役の worktree でも実行されるためです。

## 4.2 モデルの割り当て（models）

`models` は、conductor が作業役（`task`）を呼ぶときに使うモデルの表です。キーは役割名で、値はモデル名です。

```json
"models": {
  "_note": "…",
  "conductor": "",
  "rd-author": "",
  "rd-auditor": "",
  "test-designer": "",
  "implementer": "",
  "implementer-escalation": "",
  "reviewer": ""
}
```

| キー | 呼び出し | 目安（各 agent ファイルの記述） |
|---|---|---|
| `conductor` | 利用者がエージェントを選ぶときのモデルです（`conductor.agent.md` の `model:` で固定する場合に使います） | 推論の強いモデル |
| `rd-author` | 工程 1・工程 6 の転記 | 推論の強いモデル |
| `rd-auditor` | 工程 2・節目・工程 6 の監査 | rd-author とは別系統のモデル（偏りの共有を避けるため） |
| `test-designer` | 工程 4 | 中位のモデル |
| `implementer` | 工程 5 の実装 | 低〜中位のモデル |
| `implementer-escalation` | 同じ項目が 2〜3 回失敗した後の 1 回だけの再挑戦 | implementer より強いモデル |
| `reviewer` | 工程 5 のレビュー | 中位のモデル |

動作:

- 空の値は「既定のモデル」です。conductor は `task` の `model` を指定しません。
- 値がある役割は、conductor が `task` の `model` に **必ず** その値を渡します。違う値や指定なしで呼ぶと、hook G-7 が拒否し、正しい指定で呼び直します（`gates.enforce_models`、[4.3](#43-ゲートの調整gates)）。
- `implementer-escalation` のように `<役割名>-…` のキーは、その役割に許された別のモデルとして扱われます（implementer を `implementer-escalation` のモデルで呼んでも拒否されません）。
- `_` で始まるキー（`_note`）は説明で、モデルとしては使われません。
- 呼ぶ役割とモデルは、run ごとに `work/runs/<run-id>/models.jsonl` に記録されます。KPI の「実際に使ったモデル」の表にも出ます（`python scripts/kpi.py run`）。

### 較正のしかた

`_note` にあるように、モデルは最初の数回の run で較正して決めます。

1. まず `models` を空のまま run を実行し、`kpi.py run` の表（1 回目のゲート通過率・工程ごとの時間・実効の並列度）と、報告の品質の指標（AC の pass 率・監査の指摘）を控えます。
2. 役割ごとにモデルを変えて、同じ種類の依頼で比べます。判断の基準は、次のとおりです。
   - 品質が下がったか（AC の pass 率、1 回目のゲート通過率、監査の CRITICAL・HIGH の件数）
   - 遅くなったか（工程ごとの時間、項目 1 件あたりの作業時間）
   - 失敗の繰り返しが増えたか（`implementer-escalation` を使った回数）
3. 実装が最も量の多い工程なので、implementer に低〜中位のモデルを、失敗したときのために `implementer-escalation` に強いモデルを割り当てるのが、品質を保ったまま速さと費用を抑える出発点です。rd-author と rd-auditor は、判断の質に直結するので強いモデルにし、rd-auditor は rd-author と別系統にします。
4. 決まったら、`models` に書き、`_note` を実際の較正の記録に書き換えます。

`task` が `model` 引数を受け付けない環境で、呼び直しても拒否が続くときは、`gates.enforce_models` を `false` にし、agent ファイルの frontmatter の `model:` で固定します（[7.1](07-troubleshooting.md#71-拒否差し戻し)）。

## 4.3 ゲートの調整（gates）

`gates` は、hook（`scripts/hooks/gate.py`）の設定です。ゲートの内容は [6.2](06-quality-gates.md#62-hook-のゲートg-1g-7) にあります。

| キー | 既定値 | 意味 |
|---|---|---|
| `enabled` | `true` | `false` にすると、すべての hook の判定が止まります（verify の検査は残ります）。切り分けのための一時的な設定で、終わったら元に戻します |
| `subagent_verify` | implementer: `["--quick"]`、test-designer: `["--docs-only"]`、rd-author: `["--docs-only"]` | G-4。作業役が終了する前に実行する `verify.py` の引数です。表にない役割は検査しません |
| `subagent_verify_max_blocks` | `3` | G-4 が、同じ作業役を差し戻す回数の上限です。超えると、`GATE G-4` を付けて結果を返します。その項目は統合されません |
| `agent_stop_max_blocks` | `40` | conductor が完了条件を満たさずに終了しようとしたとき、続けさせる回数の上限です。時間予算の 125% を超えたときも終了を許します |
| `enforce_conductor_edit_scope` | `true` | conductor の編集を `work/` と `docs/run-history.md` に限ります（G-5）。作業役の検出に問題があるときは、`false` にします（[7.1](07-troubleshooting.md#71-拒否差し戻し)） |
| `enforce_models` | `true` | G-7。`models` の値を `task` に強制します（[4.2](#42-モデルの割り当てmodels)） |
| `deploy_patterns` | `azd up`・`terraform apply`・`kubectl apply`・`docker push`・`npm publish` など | `deploy` が `しない` のときに拒否するコマンドの正規表現です |
| `external_write_verbs` | `create`・`update`・`delete`・`send`・`merge` など | MCP Server・plugin・拡張機能のツール名に、これらの動詞が含まれると、外部のシステムの変更として扱います |
| `external_deploy_verbs` | `deploy`・`provision`・`publish`・`release` | 同じく、デプロイ・公開として扱う動詞です |
| `external_tool_allow` | `[]` | 動詞を含んでいてもローカルにしか作用しないツールを許すための、ツール名の正規表現の配列です |

例: ローカルにしか作用しない（架空の）ツール `local_draft_create` を許す。名前に `create` を含むので、`external_write` が `しない` の間は拒否されますが、次の設定で通ります。

```json
"gates": {
  "external_tool_allow": ["^local_draft_"]
}
```

- `subagent_verify` に引数を足すと（たとえば implementer を `["--quick", "--strict-ledger"]` にする）、作業役の終了前の検査が増えますが、待ち時間も増えます。変える前に `kpi.py run` で、統合の直列時間と並列度を見ます。
- 実行中（`run_active`）の run では、`.github/hooks/` と `scripts/hooks/` の編集が拒否されます（G-5）。ゲートの設定は、run の前後に変えます。
- hook の本体 `scripts/hooks/gate.py` は、内部の想定外のエラーのときは操作を許し、`work/.ebak/gate.log` に記録します。ゲートが壊れてもセッションは止まりません。

## 4.4 MCP Server・plugin・拡張機能を使う

利用者が GitHub Copilot に設定した MCP Server・plugin・拡張機能のツールと skill（Work IQ、Microsoft Learn、Azure、Copilot Studio など）は、conductor と作業役のどちらもそのまま使えます。agent の frontmatter はツールを限定していません。

- **参照** （検索・取得・質問）は、いつでもできます。使えるツールは環境ごとに違うので、conductor は特定のツールがある前提で計画せず、なければ通常の検索と資料で進め、「未確認」と記録します。
- **外部のシステムの変更** は、`external_write: する` のときだけです。デプロイ・公開は `deploy: する` のときだけです。hook G-5 が、ツール名の動詞で判定して拒否します（[4.3](#43-ゲートの調整gates)）。
- rd-author・rd-auditor・test-designer・reviewer のツールの使い方は、各 agent ファイルに書かれています。rd-auditor と reviewer は常に参照だけです。
- ツールが使われないときは、環境側の設定（MCP の一覧・ツールピッカー・サインイン）を確認します。agent の frontmatter に `tools:` を書いてツールを限定した場合は、`<サーバー名>/*` を追加します（[7.1](07-troubleshooting.md#71-拒否差し戻し)）。
- 作業役へは、`external_write` と `deploy` の値が必ず伝えられます。

## 4.5 管理データ・検査・作業ディレクトリの設定

### management_files

要求定義書などの管理データの場所です。既定値は次のとおりです。

| キー | 既定値 | 内容 |
|---|---|---|
| `requirements` | `docs/requirements-definition.md` | 要求定義書（正本） |
| `requirements_dir` | `docs/requirements` | 要求定義書を分割したときのディレクトリ。G-1 の対象です |
| `catalog` | `docs/catalog.md` | カタログ |
| `id_registry` | `docs/id-registry.md` | ID 台帳（G-3 の対象） |
| `run_history` | `docs/run-history.md` | 実行履歴 |
| `ledger` | `tests/system/ledger.json` | System Test の台帳（G-2 の対象） |
| `manual_tests` | `docs/manual-tests.md` | 手動テストの手順 |

既存のリポジトリに導入するときに、場所が違うときだけ変えます。hook とスクリプトは、すべてこの表を参照します。

### base_branch

既定は `main` です。次の判定の基準になります。

- 差分の検査（CHK-12 など）の基準（main との分岐点）
- hook G-5 の、main への直接の commit・merge・push の禁止
- 工程 6 の、統合ブランチの取り込み先

main ではなく `develop` などを使っているリポジトリでは、その名前にします。

### checks

| キー | 内容 |
|---|---|
| `id_scan_exclude` | ID の検査（CHK-19）から外すパスの glob の配列です。テストデータや資料の中に、要求 ID のような文字列（`FR-001` など）があって誤検出されるときに、そのパスを追加します |
| `ambiguous_words` | CHK-13 が検出する曖昧な語（「適切」「なるべく」など）です |
| `unit_pattern` | CHK-14 が検出する、直書きの数値と単位の正規表現です |
| `test_path_pattern` | テストコードとみなすパスの正規表現です |
| `temp_file_pattern` | 一時ファイルとみなすパスの正規表現です（G-6・CHK-23） |

`id_scan_exclude` の既定値には、`docs/**`・`work/**`・`.github/**`・`scripts/**`・`users-guide/**`・`node_modules/**`・`README.md` などと、GitHub Spec Kit の成果物（`.specify/**`・`specs/**/*.md`）が入っています。このリポジトリでは、さらに `dist/**`・`EABK-Studio/**`・`tests/toolkit/**`・一部のテストのファイルが除かれています。**既定値に追加するときは、既定の項目も残します**（配列は上書きされます）。

```json
"checks": {
  "id_scan_exclude": [
    "docs/**", "work/**", ".github/**", "scripts/**", "users-guide/**",
    "node_modules/**", "**/node_modules/**", ".git/**", "README.md",
    "tests/fixtures/**"
  ]
}
```

### work

| キー | 既定値 | 内容 |
|---|---|---|
| `dir` | `work` | 一時ファイルのディレクトリ（`/work`）です。変えたときは、`.gitignore` にも同じパスを書きます（CHK-23 が検査します。`rdfix.py --only gitignore --apply` でも追加できます） |
| `retention_days` | `14` | 以前の保持日数の設定です。現在の清掃（`clean-work.py`）は、日数ではなく、全件完了・main への統合・統合後の verify の成功で判断します。失敗・中止・未達の run は期限なく保持されます |

## 4.6 そのほかの変更

| 変えたいこと | 場所 |
|---|---|
| 作業役の手順・規則 | `.github/agents/*.agent.md`（役割ごとの規則）と `.github/skills/*/SKILL.md`（手順書） |
| 依頼の既定値（run_options） | 依頼のたびに `<run_options>` で指定します。既定値は `scripts/run-state.py` の `DEFAULT_OPTIONS` と、`/build` の雛形にあります（[1.2](01-writing-requests.md#12-依頼の雛形)） |
| CI での検証 | `.github/workflows/ebak-verify.yml`（アプリのツールチェーンのセットアップを追加します） |
| 画面の見た目の規則 | `.github/skills/implement-fr/ui-design.md` |

agent・skill・hook を編集した後は、`python scripts/verify.py` で確かめ、小さな依頼で `/build` を 1 回試してから、長い run に使います。
