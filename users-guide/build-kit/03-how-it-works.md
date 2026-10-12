# 3. 仕組み（工程と役割）

## 3.1 全体像

利用者が呼ぶエージェントは `conductor` だけです。conductor は自分ではコードも要求定義書も書かず、6 つの工程を順に進めながら、作業役（subagent）に仕事を渡します。作業役は、役割ごとの手順書（skill）に従い、10 行以内の結果だけを返します。

```text
/build（依頼） ─► conductor
                   │ 工程 1  要求定義    ─► rd-author
                   │ 工程 2  独立監査    ─► rd-auditor
                   │ 工程 3  計画（queue を作る）   … conductor 自身
                   │ 工程 4  System Test の設計 ─► test-designer
                   │ 工程 5  実装ループ  ─► implementer（並列）／ reviewer
                   └ 工程 6  最終        ─► rd-auditor ／ rd-author ／ conductor
```

品質は、LLM の自己申告ではなく、スクリプトと hook の決定的な検査で保たれます（[6 章](06-quality-gates.md)）。進行の状態は `/work` のファイルと git に保存されるので、どこで止まっても続きから再開できます（[2.2](02-during-and-after-run.md#22-停止したときの再開)）。

## 3.2 conductor の工程

工程の順序は変わりません。ただし、工程 3 と 4 は並行して進めます（test-designer を background で起動してから計画を作ります）。工程の開始と完了は、`run-state.py stage N` と `stage N --done` で記録されます。

| 工程 | 名前 | 担当 | 内容 |
|---|---|---|---|
| 0 | 初期化 | conductor | `clean-work.py` と `run-state.py start` を実行し、run を開始します。実行中の run があれば `RESUME <run-id>` として続きから再開します。基準として `git log` と `verify.py --docs-only` を記録します |
| 1 | 要求定義 | rd-author | `<request>`・`<answers>`・`<references>` を、構造化欄つきの要求・受入基準・質問票・決定記録にします |
| 2 | 独立監査 | rd-auditor | 変わった要求と、同じ対象エンティティ・状態・PARAM・用語を持つ既存の要求との直接矛盾を探します（scope: 差分、runs: 1）。確度の高い直接矛盾が残れば、rd-author に戻して工程 1 を繰り返します（最大 3 周） |
| 3 | 計画 | conductor | 承認済みの要求から、作業項目の queue を作ります。1 項目は要求 ID 1〜5 個です。同じ画面・API・テーブルを通る要求は 1 項目にまとめ、依存と、共通部品・テーブルの重なりを記録して、重なる項目を並行させません |
| 4 | System Test の設計 | test-designer | 実装より前に、受入基準だけから System Test と台帳のケースを作ります。すべて `not_run` で commit します |
| 5 | 実装ループ | implementer・reviewer・conductor | 項目ごとに worktree で実装し、1 項目ずつ統合します（[3.5](#35-worktree-と統合ブランチ)） |
| 6 | 最終 | conductor・rd-auditor・rd-author | 全量の System Test と verify、全量の監査、転記、KPI と報告の作成、main への取り込みを行います |

- `scope: なし`（要求定義だけの依頼）のときは、queue を空のまま工程 3 を完了し、工程 4・5 を省いて工程 6 に進みます。
- **軽量モード:** 依頼が数文で言える変更で、queue が 2 項目以下になり、セキュリティ・個人情報・課金・認証の要求に触れないときは、reviewer を使わず、工程 6 の監査も scope: 差分、runs: 1 にします。System Test の先行設計・verify・hook は通常どおりです。途中で条件を外れたり競合が出たりしたら、通常の手順に戻ります。
- 時間予算（`max_hours`）の 85% を超えると、新しい項目を始めず、工程 6 に進みます（[2.2](02-during-and-after-run.md#22-停止したときの再開)）。

### 工程 5 の実装ループ

実装ループはパイプラインで、常に最大 `parallel_workers` 体の implementer が動いている状態を保ちます。1 体が終わるたびに、その項目の統合と、次の項目の起動を行います。

1. `integrate.py prepare <項目>` で、worktree のプールから 1 つを割り当て、作業ブランチ `work/<run-id>/<項目>` を作ります。
2. implementer を background で起動します。implementer は worktree の中で実装・単体テスト・結合テスト・カタログの行を書き、`verify.py --quick` と関係する System Test が通るまで直して、commit します。
3. 結果を見て分岐します。

| 結果 | 動作 |
|---|---|
| `GATE: fail`、または `GATE G-4` | `integrate.py abandon` で項目を todo に戻します（ブランチは残り、次の試行は続きから）。3 回失敗したら強いモデル（`models.implementer-escalation`）で 1 回だけ再挑戦し、それでも失敗したら blocked にして原因を記録します |
| `競合:` がある | 要求や System Test との食い違いです。rd-author に回し（工程 1 を差分で再実行）、影響する項目を戻します |
| 共通部品・契約・テーブルの変更、セキュリティ・個人情報・認証の要求、画面の変更を含む | reviewer に回します。`差し戻し` なら、同じ worktree のまま implementer に戻します |
| 上記以外 | 統合します |

4. 統合は `integrate.py merge <項目> --summary "…"` の 1 コマンドです。merge → `verify --quick`（5 項目ごとに全コマンド）→ 関係する System Test と canary → 台帳の commit → worktree の解放 → done までを行います。失敗（verify・System Test は exit 1、競合は exit 2）のときは統合を取り消して、項目を todo に戻します。
5. 節目（10 項目ごと・4 時間ごと）に、rd-auditor（scope: 差分）を background で起動します。canary が失敗し、3 回の修正でも直らないときは、ループを止めて工程 6 に進みます。

### 工程 6 の最終

1. 使い終わった worktree を削除し（`integrate.py pool --prune`）、データ層の不整合を直し（`rdfix.py --apply`、[6.3](06-quality-gates.md#63-データ層の不整合の自動修正rdfix)）、全量の System Test（`ledger.py run --select all --canary-first`）と `verify.py --strict --run current` を実行します。
2. rd-auditor が全量を監査します（3 回の多数決。軽量モードは 1 回）。
3. rd-author が、包括承認した項目を決定記録へ、未回答の質問票・承認依頼を「仮定・未解決事項」へ、残った監査指摘を「監査指摘」へ転記します。`next-id.py --sync --finalize` で、使わなかった採番済みの ID を欠番にします。
4. `kpi.py` で KPI を集計し、`run-report.md` を書き、`run-state.py finish` で `docs/run-history.md` に 1 行を追記します。
5. 結果が「全件完了」で完了条件を満たし、main 上で始めた run のときだけ、統合ブランチをローカルの main にマージして `verify.py --run current` で確かめ、`clean-work.py` で run の資産を清掃します（[2.4](02-during-and-after-run.md#24-マージする)）。main への push はしません。

## 3.3 役割と skill

| 役割 | 位置づけ | 手順書（skill） | 書いてよいもの | 返す結果 |
|---|---|---|---|---|
| conductor | 利用者が呼ぶ唯一のエージェント。進行役 | `build`（入口）・`build-template` | `work/` と `docs/run-history.md` だけ（hook G-5） | 最終報告 `run-report.md` |
| rd-author | 要求定義書とカタログの **唯一の書き手** | `requirement-definition` | `docs/` の管理データだけ（要求定義書・`docs/requirements/`・カタログ） | 変更した要求 ID・新しい質問・BLOCKED・包括承認・競合・commit |
| rd-auditor | 要求定義書を書き手とは独立に監査する読み取り専用の役 | `rd-audit` | `work/runs/<run-id>/audit/` と指定された出力先だけ | 重大度別の件数・直接矛盾・rd-author への依頼文 |
| test-designer | 受入基準だけから System Test と台帳のケースを作る | `system-test-increment` | `tests/system/` だけ（台帳は `ledger.py` で更新） | 追加・更新したケース・BLOCKED・canary・競合 |
| implementer | 1 項目（要求 ID 1〜5 個）を worktree で実装する | `implement-fr`（画面は `ui-design.md`） | 渡された worktree の中だけ。要求定義書・ID 台帳・`tests/system/`・台帳は変更しません | `WORKTREE` と `GATE`・変更した共通部品・テスト・System Test の結果・競合 |
| reviewer | 差分を受入基準と照合する読み取り専用の役 | （agent の手順に記載） | 何も変更しません | 承認／差し戻し・不足テスト・影響する要求 |

- skill は `.github/skills/*` にあります。`requirement-definition`・`system-test-increment`・`implement-fr` は、利用者の原本の手順書に、無人の連続実行のための読み替えと規則を加えたものです。原本と食い違うときは読み替えが優先されます。
- rd-auditor は、rd-author とは別系統のモデルで呼びます（偏りの共有を避けるため）。モデルの割り当ては [4.2](04-customization.md#42-モデルの割り当てmodels) です。
- 作業役への依頼は、目的・関連する受入基準の本文・読むファイル・許可する操作・返す結果の 5 点だけです。会話の履歴や長いログは渡しません。
- 利用者が設定した MCP Server・plugin・拡張機能のツールは、作業役も使えます。参照はいつでもできますが、外部のシステムの変更は `external_write`、デプロイは `deploy` の値に従います（[1.3](01-writing-requests.md#13-run_options-の意味)、[4.4](04-customization.md#44-mcp-serverplugin拡張機能を使う)）。

reviewer は、すべての項目では呼びません。共通部品・契約・テーブルを変更する項目、セキュリティ・個人情報・認証の要求を含む項目、画面の変更を含む項目だけです。

### 作業役が守る規則（hook G-1〜G-7）

権限の分担は、依頼文のお願いではなく、hook が機械的に強制します。

| 守られること | hook |
|---|---|
| 要求定義書を編集できるのは rd-author だけ | G-1 |
| System Test と台帳は、test-designer が `ledger.py` 経由でだけ更新する。implementer・reviewer は変更できない | G-2 |
| ID は `next-id.py` だけが採番する。ID 台帳は手で編集しない | G-3 |
| 作業役の終了前に verify を実行する | G-4 |
| conductor の編集範囲、push・デプロイ・外部のシステムの変更の制限 | G-5 |
| 一時ファイルは `/work` にだけ置く | G-6 |
| 作業役は `models` で決めたモデルで呼ぶ | G-7 |

詳しくは [6.2](06-quality-gates.md#62-hook-のゲートg-1g-7) です。

## 3.4 データの流れ

要求定義書を **正本** とし、ほかのデータはそれに従います。

| データ | 場所 | 書く人 | 役割 |
|---|---|---|---|
| 要求定義書 | `docs/requirements-definition.md`（と `docs/requirements/`） | rd-author だけ | 目的・要求・受入基準（AC）・質問票・決定記録・監査指摘。正本です |
| カタログ | `docs/catalog.md` | rd-author（要求 ID・題名・決定状態）と implementer（実装ファイル・テスト・共通部品） | 要求と、実装・テスト・共通部品・API・テーブルの対応表 |
| ID 台帳 | `docs/id-registry.md` | `next-id.py` だけ | ID の使用中・廃止・削除済みの記録。ID の重複と再利用を防ぎます |
| System Test の台帳 | `tests/system/ledger.json` | `ledger.py` だけ | System Test のケース、対応する AC、状態（`not_run`・`pass`・`fail`・`blocked`）、変更の理由（history） |
| 手動テスト | `docs/manual-tests.md` | （手順を書いた人） | 検証レベルが `manual` の AC を確かめる手順です。コマンドで判定できない要求は、ここに要求 ID があれば CHK-09 を満たします |
| 実行履歴 | `docs/run-history.md` | `run-state.py finish`（conductor） | run 1 回を 1 行で記録します（結果・要求 ID・pass 率・経過時間・人の介入・検証済み要求など） |
| 一時ファイル | `work/`（`/work`） | 各役割とスクリプト | ログ・証跡・実行結果・作業メモ。git の管理対象外で、14 日で削除されます |

関係を図にすると次のとおりです。

```text
要求定義書（正本） ──要求 ID・AC──► カタログ（実装ファイル・テスト）
      │                              ▲
      │ AC（検証レベル: system）      │ implementer が書く
      ▼                              │
System Test の台帳 ◄── test-designer ─┘（ケース）
      │
      └─ 実行結果 ─► 台帳の状態（pass/fail）／ work/runs/<run-id>/results.json

ID 台帳 … 要求定義書の ID の採番と状態の記録（next-id.py）
実行履歴 … run ごとの結果と KPI（工程 6 で 1 行追記）
```

- ID・カタログ・台帳・実行履歴が要求定義書と食い違ったときは、`rdfix.py` が要求定義書に合わせて直します（[6.3](06-quality-gates.md#63-データ層の不整合の自動修正rdfix)）。
- データ層は、[EABK Studio](../../EABK-Studio/users-guide/README.md)（`python EABK-Studio/studio.py`）で図と表として見られます。
- ファイルの場所は `scripts/ebak.config.json` の `management_files` で変えられます（[4.5](04-customization.md#45-管理データ検査作業ディレクトリの設定)）。

### /work の中身

`/work`（既定は `work/`）は git の管理対象外です。`CHK-23` が、`.gitignore` にあることと、一時ファイルが commit されていないことを検査します。

| 場所 | 内容 |
|---|---|
| `work/current-run.txt` | 実行中の run-id |
| `work/runs/<run-id>/meta.json` | run の状態（run_options・工程・統合ブランチなど） |
| `work/runs/<run-id>/queue.json` | 作業項目の queue（状態・試行回数・ブランチ・依存） |
| `work/runs/<run-id>/progress.md` | 進捗と判断の記録 |
| `work/runs/<run-id>/run-report.md` | 最終報告 |
| `work/runs/<run-id>/kpi.md`・`kpi.html` | KPI |
| `work/runs/<run-id>/logs/`・`audit/` | verify・テストのログ、監査の生データ |
| `work/runs/<run-id>/models.jsonl` | 実際に使ったモデル（hook G-7 が記録） |
| `work/worktrees/<run-id>-w<N>` | 作業役の worktree のプール |
| `work/.ebak/` | hook の記録（`gate.log`）、verify のキャッシュ、統合のロックなど |

全件完了した run は、統合後に `clean-work.py` が run の worktree・作業ブランチ・統合ブランチ・一時資産を清掃します。失敗・中止・未達の run は、自動期限なしで保持されます（[5 章の clean-work.py](05-scripts-reference.md#clean-workpywork-のクリーンアップ)）。

## 3.5 worktree と統合ブランチ

並列に実装しても互いを壊さないよう、ブランチと worktree を次のように使います。

| もの | 内容 |
|---|---|
| 統合ブランチ | main 上で始めた run では、`run/<run-id>` が作られます。以後の commit は、統合ブランチか作業ブランチでだけ行い、main には直接 commit・merge しません（hook G-5）。別のブランチや New Worktree で始めた run では、そのブランチが統合ブランチです。名前は `run-state.py status` の `integration:` の行で確認でき、run の途中で変えません |
| 作業ブランチ | 項目ごとの `work/<run-id>/<項目>`。implementer だけが commit します。失敗して戻したときもブランチは残り、次の試行は続きから始まります |
| worktree のプール | `work/worktrees/<run-id>-w<N>`。run の間、項目をまたいで再利用されます。ignore されたビルドの生成物（`node_modules`・`bin/obj`・`.venv` など）が残るので、2 回目以降のビルドが速くなります |
| 統合 | `integrate.py merge` が、ロックで 1 本ずつ直列に行います。失敗したときは `git reset --hard` で取り消すので、統合ブランチは常に緑に保たれます |

- 同じ共通部品・テーブル・境界に触れる項目は、並行させません（工程 3 の `--boundary`・`--shared`・`--depends`）。
- commit のメッセージは、`[RD]`（要求定義）、`[ST]`（System Test）、`[<要求 ID>]`（実装）で始まります。`git log --oneline --graph` で、工程の流れを追えます（[2.1](02-during-and-after-run.md#21-進捗を確認する)）。
- 統合の直後は、統合ブランチの verify が緑のままです。緑でなくなったときは、その統合が取り消されて項目が todo に戻ります。

## 3.6 報告の読み方

run が終わったら、`work/runs/<run-id>/run-report.md` を読みます。全体の読み方と、永続的な場所への転記は [2.3](02-during-and-after-run.md#23-終了後に読むもの) です。ここでは、上から読むときの見どころをまとめます。

| 順 | 見る所 | 判断 |
|---|---|---|
| 1 | 1 行目の **結果** | 全件完了／blocked あり／時間予算で中止／canary 失敗で中止。「全件完了」以外は、統合ブランチが残っているので、手動で取り込むかどうかを決めます（[2.4](02-during-and-after-run.md#24-マージする)） |
| 2 | **包括承認した項目** | 利用者に代わって承認したものです。意図と違えば、次の `<answers>` で取り消します |
| 3 | **未回答の質問票** | 重要度順です。そのまま次の `<answers>` に書けます |
| 4 | BLOCKED の要求 ID と理由 | 質問に答えると、次の run で実装されます |
| 5 | 品質の指標 | verify、AC の pass 率、監査の指摘（CRITICAL・HIGH の件数） |
| 6 | KPI | 「人の介入 1 回あたりの検証済み要求」ほか。検証済みにならなかった要求は理由つきです |
| 7 | 取り込み方法 | 統合ブランチ名と、`git merge` または `gh pr create` のコマンド |

次の run に進むには、質問票に答えた `<answers>` を付けて、もう一度 `/build` を送ります（[1.4](01-writing-requests.md#14-初回と-2-回目以降)）。
