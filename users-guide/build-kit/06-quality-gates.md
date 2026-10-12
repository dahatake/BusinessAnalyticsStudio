# 6. 品質ゲート

品質は、LLM の「できました」という自己申告ではなく、決定的な検査で保たれます。検査は 3 つの層からなります。

| 層 | 何が検査するか | いつ |
|---|---|---|
| verify | `scripts/verify.py`（管理データの検査 CHK-01〜27 と、利用者が登録したビルド・テストのコマンド） | 作業役の終了前（`--quick`／`--docs-only`）、統合のたび、工程 6、CI |
| hook のゲート | `scripts/hooks/gate.py`（G-1〜G-7） | 操作の直前・作業役の終了時・conductor の終了時 |
| System Test | `ledger.py run`（受入基準から作ったテスト） | 統合のたび（変更に関係するケースと canary）、工程 6（全件） |

どれも、人手の確認を待たずに、同じ規則で動きます。

## 6.1 verify（CHK-01〜27）

`python scripts/verify.py` は、管理データを検査し（`rdcheck.py check`）、続けて `verify.commands` のコマンドを実行します（[4.1](04-customization.md#41-検証コマンドの登録verifycommands)）。exit 0 が合格です。引数と使い分けは [5 章](05-scripts-reference.md#verifyl1-決定的検査) にあります。

| モード | 検査する範囲 | 使う人 |
|---|---|---|
| `--docs-only` | 管理データの検査だけ | rd-author・test-designer の終了前（G-4） |
| `--quick` | 管理データと、`slow` でないコマンド | implementer の終了前（G-4）、統合のたび |
| （なし） | すべて | 5 項目ごとの統合、最終 |
| `--strict` | すべて。警告のうち重要なものをエラーにする | 工程 6 |
| `--run current` | 上に加えて、queue.json との整合（CHK-21） | 統合、工程 6 |

出力のレベルは、`ERROR`（verify が失敗します）と `WARN`（既定では表示されません。`--show-warnings` で表示します）です。

### 検査の分類

| 分類 | CHK | 検査の内容 | 主なレベル |
|---|---|---|---|
| ID・台帳 | 01 | ID が重複していない。要求定義書のすべての ID が ID 台帳にある（ID は `next-id.py` だけが採番します） | ERROR（ID 台帳がないときは WARN） |
| | 02 | 廃止・削除した ID を再利用していない | ERROR |
| | 22 | 決定記録が、存在する Q・承認依頼・依頼・包括承認を指している | ERROR |
| 構造 | 03 | 受入基準（AC）が、存在する要求に属している | ERROR |
| | 04 | 要求の「上位」に目的（G）か既定制約があり、存在する G を指している。承認済みの要求がない G は警告 | ERROR／WARN |
| | 05 | MUST 要求に、AC か未回答の質問票がある | ERROR |
| | 06 | 承認済みの要求に決定記録（承認の根拠と日付）がある | ERROR |
| | 20 | 決定状態が定義済みの値である。既定制約（ui_policy）の節・ペルソナ表の必須列・要求の構造化欄・AC の検証レベルがある | ERROR |
| | 18 | `BLOCKED` の AC が、存在する未回答の Q・TBD・競合を指している（回答済みの Q を指していたら、BLOCKED を外します） | ERROR |
| 意味の整合 | 13 | 曖昧な語（「適切」「なるべく」など）がない（`--strict` では MUST 要求だけ ERROR） | WARN |
| | 14 | 数値と単位の直書きがない（PARAM を参照します） | WARN |
| | 15 | 用語の禁止同義語を使っていない | WARN |
| | 16 | `{PARAM-xxx}` の参照が、パラメータの表に定義されている | ERROR |
| | 24 | 参照している ID が要求定義書に定義されている。カタログが、廃止・却下の要求を参照していない | ERROR／WARN |
| | 25 | 対象エンティティ・関係する状態・参照パラメータが、用語の表・状態の表・本文と一致している | ERROR／WARN |
| | 26 | どの要求からも参照されない PARAM・出典（SRC）・状態がない | WARN |
| カタログ・コード | 07 | カタログの機能の表が、要求定義書と ID・題名・決定状態で一致している（1 要求 1 行） | ERROR（カタログがないときは WARN） |
| | 08 | カタログに書いたファイルが実在する | ERROR |
| | 09 | MUST 要求がカタログにあり、実装済みの MUST の ID がテストコード（か手動テスト）にある。未実装は警告（`--strict` では ERROR） | ERROR／WARN |
| | 17 | 廃止した要求の実装が、コード・テスト・カタログから取り除かれている | ERROR／WARN |
| | 19 | コードやテストにある要求 ID・AC ID が、要求定義書に存在する（[4.5](04-customization.md#45-管理データ検査作業ディレクトリの設定) の `id_scan_exclude` で除外できます） | ERROR |
| | 27 | カタログの共通部品・API・テーブルの表の重複がなく、機能の表が使う共通部品が共通部品の表にある | ERROR |
| System Test | 10 | 台帳のケースが、存在する AC・要求を指している。system の AC に対応するケースがある | ERROR（対応不足は工程 4 以降 ERROR、それまでは WARN） |
| | 11 | 台帳の `ac_digests` が AC の本文と一致している（AC を変えたら test-designer がケースを見直します） | 同上 |
| | 12 | System Test の弱体化がない: 作業役のブランチが `tests/system/` を変更していない（G-2）。ケースの削除・理由なしの command／ac_ids の変更・検証（assert など）の減少がない | ERROR |
| run・一時ファイル | 21 | `--run` のとき、queue で done の要求がカタログに実装ファイルとして載り、done の system の AC の台帳のケースが pass である | ERROR |
| | 23 | `/work` が `.gitignore` にある。一時ファイルが commit されていない。実行履歴の run-id が重複していない | ERROR |

- 表の「主なレベル」は、`scripts/rdcheck.py` の既定の動作です。要求定義書がないとき（未初期化）は `CHK-00` の警告になります。
- 差分の検査（CHK-12 など）の基準は、main との分岐点です（`--base`）。
- 検査の対象と閾値は、`scripts/ebak.config.json` の `checks` で変えられます（[4.5](04-customization.md#45-管理データ検査作業ディレクトリの設定)）。
- 失敗の見方と対処は [7.3](07-troubleshooting.md#73-verify-が失敗する) です。1 つの検査の詳しい内容は、`python scripts/rdcheck.py check --show-warnings` の出力の `<CHK> <場所> <内容>` の行にあります。

### System Test と canary

System Test は、受入基準（検証レベル `system`）から test-designer が実装より前に作る E2E・契約テストで、台帳 `tests/system/ledger.json` に記録されます。

- 統合のたびに、変更に関係するケースと **canary**（アプリの基本の動作を確かめる、常に実行する少数のケース）を実行します。まだ統合していない要求のケースは、通らないことが分かっているので除きます。
- 工程 6 は、全件を canary から先に実行します（`ledger.py run --select all --canary-first`）。
- canary が失敗して 3 回の修正でも直らないときは、実装ループを止めて工程 6 に進みます。
- 実装を直しても、テストは弱められません。implementer と reviewer は `tests/system/` を変更できず、台帳の更新は test-designer だけが `ledger.py` 経由で行い、変更には理由が必要です（G-2、CHK-12）。

## 6.2 hook のゲート（G-1〜G-7）

hook は `.github/hooks/quality-gates.json` で定義され、`scripts/hooks/gate.py` が判定します。VS Code・Copilot CLI・GitHub Copilot app のどれでも、同じファイルが読み込まれます。拒否・差し戻した操作は `work/.ebak/gate.log` に記録されます。

| ゲート | 守ること | 拒否される操作の例 |
|---|---|---|
| G-1 | 要求定義書を編集できるのは rd-author だけです。作業役（worktree）は、要求の誤りや不足を結果の `競合:` に書きます | rd-author 以外の、`docs/requirements-definition.md`・`docs/requirements/` の編集 |
| G-2 | System Test と台帳は test-designer だけが更新します。implementer・reviewer は `tests/system/` を変更できず、台帳は `ledger.py` 経由でだけ更新します。作業役は台帳を更新せず（`ledger.py run --no-record` で実行だけ）、データ層を自動修正（`rdfix.py --apply`）しません | `tests/system/` の編集、台帳の直接編集、作業役の `ledger.py add|update|block|set` |
| G-3 | ID は `next-id.py` だけが採番します。ID 台帳を直接編集しません | `docs/id-registry.md` の編集 |
| G-4 | 作業役は、終了前に verify が通っていなければ終了できません。implementer は `--quick`、test-designer と rd-author は `--docs-only` です（`gates.subagent_verify`）。失敗すると原因の要約つきで差し戻され、3 回で直らなければ `GATE G-4` を付けて conductor に返り、その項目は統合されません | 検証が失敗したままの終了 |
| G-5 | 実行の範囲を守ります。次の表を参照してください | main への push・force push、`git_push: しない` での push、main への直接の commit、デプロイ、外部のツールでの変更、ブランチ名の変更 など |
| G-6 | ログ・証跡・実行結果などの一時ファイルは `/work/runs/<run-id>/` にだけ書きます。`/work` の削除は `clean-work.py` と `git worktree remove` だけで行います | リポジトリ直下への `*.log`・`trace*.zip`・`test-results/` などの出力 |
| G-7 | `scripts/ebak.config.json` の `models` に値がある作業役は、その値のモデルで呼びます。`task` の呼び出しは `work/runs/<run-id>/models.jsonl` に記録されます | `task` の `model` 指定なし、または違うモデル |

G-5 の内容:

| 内容 | 動作 |
|---|---|
| conductor の編集範囲 | `work/` と `docs/run-history.md` だけです（`gates.enforce_conductor_edit_scope`）。作業は作業役に委譲します |
| 読み取り専用の役割 | rd-auditor・reviewer は、`work/runs/<run-id>/` 以外を編集できません。外部のツールでの変更もできません |
| 役割ごとの編集範囲 | test-designer は `tests/system/` だけ、rd-author は `docs/` の管理データだけ（`docs/run-history.md` を除く）です |
| git | main（`base_branch`）や master への push、force push・ブランチの削除の push、履歴の書き換え（`filter-branch`）、run 中の main への commit・merge を拒否します。`git_push` が `しない` の間は、作業ブランチへの push も拒否します |
| デプロイ | `deploy` が `しない` の間は、`gates.deploy_patterns` に当たるコマンド（`azd up`・`terraform apply` など）を拒否します |
| 外部のツール | `external_write` が `しない` の間は、MCP Server・plugin・拡張機能のツールのうち、名前に変更を表す動詞を含むものを拒否します。参照は許されます（[4.3](04-customization.md#43-ゲートの調整gates)） |
| ゲートの保護 | run の間は、`.github/hooks/` と `scripts/hooks/` を編集できません |
| ブランチ名 | run の間は、セッションのブランチ名の変更（`rename_branch`）を拒否します |
| 作業ディレクトリの外 | 作業ディレクトリの外への書き込みを拒否します |

hook はイベントごとに次のように働きます。

| イベント | 動作 |
|---|---|
| `sessionStart` | 実行中の run があれば、run-id と工程を伝えます。新しい文脈でも状態ファイルから再開できます |
| `userPromptSubmitted` | `/build template` を検出し、読み取り以外のツールを拒否して、雛形を出すだけで終わらせます |
| `preToolUse` | G-1・G-2・G-3・G-5・G-6・G-7 の判定を、操作の直前に行います。読み取りだけのツールは、判定せずにすぐ許可します |
| `subagentStart` | 動いている作業役の名前を記録します（`work/.ebak/gate.log` の `START <作業役>`） |
| `subagentStop` | G-4。作業役の終了前に verify を実行します（作業役の `WORKTREE:` の行の worktree で実行します） |
| `agentStop` | conductor の終了前に、完了条件（`run-state.py complete-check`）を判定します。満たしていなければ、続けさせます（上限 `agent_stop_max_blocks`、既定 40 回） |

- 完了条件は、queue に todo・doing がない、工程 6 が終わっている、`run-report.md` がある、の 3 つです。時間予算の 125% を超えたときは、無限に続けないよう、終了を許します。
- hook が内部の想定外のエラーを起こしたときは、操作を許し、`gate.log` に記録します。ゲートの不具合でセッションが動かなくなることはありません。
- 設定は [4.3](04-customization.md#43-ゲートの調整gates)、拒否されたときの対処は [7.1](07-troubleshooting.md#71-拒否差し戻し) です。
- hook が止まっている間（`gates.enabled: false`、harness が hook を呼ばない場合など）も、verify が統合の時点で同じ規則の一部（CHK-12 の System Test の変更、CHK-23 の一時ファイルなど）を検査します。

## 6.3 データ層の不整合の自動修正（rdfix）

要求定義書を正本として、カタログ・ID 台帳・System Test の台帳・実行履歴・`.gitignore` は、そこから導かれるデータです。並行して作業したり、ブランチをマージしたりすると、これらが要求定義書や互いに食い違うことがあります。`rdfix.py` は、機械的に直せる食い違いを直します。**要求定義書は変更しません**（G-1）。

```bash
python scripts/rdfix.py                           # 修正の計画を表示する（書き込まない）
python scripts/rdfix.py --apply                   # 修正を書き込み、rdcheck で確かめる
python scripts/rdfix.py --only catalog,ledger     # 対象を絞る
```

### 何を直すか

| 対象（`--only`） | ファイル | 直す内容 | CHK |
|---|---|---|---|
| `registry` | `docs/id-registry.md` | 状態（使用中・廃止・削除済み）、マージで重複した行、台帳がないときの作成（`next-id.py` 経由） | 01 |
| `catalog` | `docs/catalog.md` | 機能の表の決定状態・題名、行のない要求の行の追加、要求定義書にない行（実装・テストの記載がないもの）の削除、名前が変わった・削除されたファイルの参照、廃止した要求の実装ファイルの欄、共通部品の「使っている要求 ID」 | 07・08・17・27 |
| `ledger` | `tests/system/ledger.json` | 欠けた項目、`requirement_ids`、`ac_digests` の不足・不要（`ledger.py` 経由で、history に記録します） | 10・11 |
| `gitignore` | `.gitignore` | `/work/` の追加 | 23 |
| `history` | `docs/run-history.md` | マージで重複した行 | 23 |

### 判断が要るもの（MANUAL）

内容を決める判断が要るものは、直さずに `MANUAL` の行として、直す役割とともに表示します。

| 例 | 担当 |
|---|---|
| ID 台帳にない ID（手で振った ID かもしれない） | rd-author。正しい ID と確認できたら `rdfix.py --adopt --apply` で取り込みます |
| 二重に採番された ID・削除済みの ID の再利用 | rd-author（`next-id.py` で採番し直します） |
| カタログの機能の表がない・同じ要求の行が複数で内容が違う | rd-author |
| 機能の表が使う共通部品が、共通部品の表にない | implementer |
| 変更された AC の本文に合わせたケースの見直し | test-designer |
| 一時ファイルが commit されている（`/work` へ移し、`git rm --cached` します） | conductor |
| 実行履歴の同じ run-id の行の内容が違う | conductor |

### 出力と終了コード

```text
FIX CHK-07 docs/catalog.md:12 FR-012 の決定状態を 承認待ち → 承認済み に直します（要求定義書に合わせる）
MANUAL CHK-02 docs/requirements-definition.md:88 FR-030 は ID 台帳で削除済み／欠番です。…（担当: rd-author）
rdfix: fix=1 manual=1 mode=dry-run → `python scripts/rdfix.py --apply` で修正します
```

| exit | 意味 |
|---|---|
| 0 | 自動で直すものが残っていない（`MANUAL` が残っていてもよい） |
| 1 | 修正が未適用（`--apply` なし）、または修正後も収束していない |
| 2 | 拒否した。作業役のブランチ（`work/<run-id>/<項目>`）では `--apply` を実行しません |

### いつ、誰が実行するか

- verify が `CHK-01`・`CHK-07`・`CHK-08`・`CHK-11`・`CHK-17`・`CHK-23`・`CHK-27` などで失敗し、`HINT rdfix: データ層の不整合のうち N 件は … で自動修正できます` と表示したときに実行します。
- conductor は、run の開始時（`verify.py --docs-only` が `HINT rdfix` を出したとき）と、工程 6 の最初（統合で生じた不整合）に、統合ブランチで `rdfix.py --apply` を実行し、commit します。`MANUAL` の行は、担当の役割への依頼に含めます。
- 作業役や読み取り専用の役割は `--apply` を実行できません（G-2）。rd-author は `registry`・`catalog`、test-designer は `ledger` に絞った場合（`--only`）だけ実行できます（G-5）。
- 利用者が手で直すときは、まず引数なしで計画を確認し、`FIX` の内容を見てから `--apply` を実行します。

運用の確認は [7.3](07-troubleshooting.md#73-verify-が失敗する) と [5 章](05-scripts-reference.md#rdfixpyデータ層の不整合の自動修正) にあります。
