# 8. ロードマップと KPI

## 8.1 このキットの位置づけと運用の段階

Enterprise App Build Kit は、要求定義書・カタログ・System Test の台帳を **一貫した状態** に保ちながら、conductor が無人で開発を進める仕組みです（[3 章](03-how-it-works.md)）。利用者の関与は、依頼（`/build`）と、報告の質問票への回答（`<answers>`）に絞られます（[1 章](01-writing-requests.md)）。

運用は、次の 3 つの段階で進めます。段階の名前は、`scripts/ebak.config.json` の `models._note` と、conductor・`kpi.py` の記述（「Phase 1 で較正」「Phase 1 の計測値」）に合わせた整理です。段階ごとの期間や数値の基準は、リポジトリに定義がないので、ここでは決めません。

| 段階 | やること | 確認の手がかり |
|---|---|---|
| 導入 | toolkit を入れ、`verify.commands` を登録し、hook が動くことを確かめる。既存の要求定義書があれば `next-id.py --sync --adopt` で ID を取り込む | `.github/ebak-toolkit.json`（導入した版）、`python scripts/verify.py` が exit 0、`work/.ebak/gate.log` ができること（[4.1](04-customization.md#41-検証コマンドの登録verifycommands)、[7.3](07-troubleshooting.md#73-verify-が失敗する)） |
| 較正 | 小さな依頼で run を繰り返し、`models` の割り当てと `verify.commands` の `slow`、`parallel_workers` を、KPI を見ながら決める | `kpi.py run` の表、`work/runs/<run-id>/models.jsonl`（[4.2](04-customization.md#42-モデルの割り当てmodels)） |
| 定着 | 依頼と回答だけで run を回し、`docs/run-history.md` の履歴で傾向を見る | `kpi.py history`（[8.2](#82-kpi)） |

このリポジトリで、ファイルの内容から確かめられる現状は次のとおりです。

| 項目 | 現状 | 確かめた場所 |
|---|---|---|
| toolkit の版 | 0.2.0 | `.github/ebak-toolkit.json`、`scripts/ebaklib.py` の `TOOLKIT_VERSION` |
| 管理データ | 要求定義書・カタログ・ID 台帳・実行履歴・手動テストが `docs/` にある | `docs/` |
| 検証コマンド | `typecheck`・`build`・`unit` が登録済み。`slow` のコマンドはない | `scripts/ebak.config.json` の `verify.commands` |
| モデルの割り当て | すべて空（既定のモデル）。較正の結果はまだ書かれていない | `scripts/ebak.config.json` の `models` |
| hook のゲート | 有効（`gates.enabled: true`） | `scripts/ebak.config.json` の `gates` |
| 実行履歴 | 2 件の run（いずれも「全件完了」、人の介入は 1 と 2）が記録されている | `docs/run-history.md` |
| CI | `.github/workflows/ebak-verify.yml` が、push（main）と pull request で verify を再実行する。アプリのツールチェーンのセットアップは、未追加のコメントのまま | `.github/workflows/ebak-verify.yml` |

「較正」の段階にあるかどうかは、`models` が空かどうかと、実行履歴の件数で判断できます。

## 8.2 KPI

KPI は `scripts/kpi.py` が集計します。run 1 回分と、履歴全体の 2 種類です。

```bash
python scripts/kpi.py run                          # 実行中（なければ最新）の run を Markdown で表示
python scripts/kpi.py run --run 202610080900 --format json
python scripts/kpi.py run --format html --out work/runs/<run-id>/kpi.html
python scripts/kpi.py history                      # docs/run-history.md 全体の集計
```

出力の列は、指標・値・目標・判定（達成／未達／`-`）・根拠・内訳です。conductor は工程 6 で、`kpi.md` と `kpi.html` を `work/runs/<run-id>/` に書き、`run-report.md` に表を貼ります（[3.2](03-how-it-works.md#32-conductor-の工程)）。

### North Star

**人の介入 1 回あたりの検証済み要求** = 検証済み要求の数 ÷ 人の介入の回数。

- **人の介入** は、`run-state.py` が記録した利用者の Prompt の回数です。新しい run の最初の依頼（`request`）は `start` が記録し、再開のときに conductor が 1 回だけ `human answers`（`<answers>` あり）・`human resume`・`human instruction`（途中の追加指示）のいずれかを記録します（[5 章](05-scripts-reference.md#run-statepyconductor-の状態管理)）。記録がない run は「未記録」で、North Star は `-` です。
- 目標は、run 単位では「前回より増やす」、履歴では「増加傾向」です。数値の目標はありません。
- 履歴では、人の介入を記録した run だけを対象に、検証済み要求の合計 ÷ 人の介入の合計を求めます。

### 検証済み要求の定義

実装した要求（queue で done になった項目の要求 ID）のうち、**次をすべて満たすもの** が検証済みです。

1. 要求定義書にあり、決定状態が `承認済み` である
2. カタログに行がある
3. 受入基準（AC）に `BLOCKED` がない
4. 検証レベルが `system` の AC のすべてに、台帳のケースが 1 つ以上あり、それらがすべて `pass` である

検証レベルが `integration`・`unit` の AC は、implementer のゲートと verify で見るので、ここでは再確認しません。満たさない要求には、理由（「決定状態が …」「カタログの行がない」「BLOCKED の AC: …」「System Test が pass でない AC: …」）が表示されます。

### run ごとの指標

| 指標 | 内容 | 目標 |
|---|---|---|
| 人の介入 | 利用者の Prompt の回数と内訳（request・answers・resume・instruction） | 1（回答があれば 2）。2 以下が「達成」 |
| 検証済み要求 / 実装した要求 | 上の定義による件数 | 全件 |
| 1 回目のゲート通過率 | queue の done の項目のうち、試行回数（attempts）が 1 以下のものの割合 | 70% 以上 |
| system AC の pass 率 | 承認済みで `BLOCKED` でない system の AC のうち、台帳で pass のものの割合 | 100% |
| トレーサビリティ網羅率 | 承認済みの要求のうち、カタログに行があり、system の AC のすべてに台帳のケースがあるものの割合 | 100% |
| 要求 1 件あたりの経過時間 | run の経過時間 ÷ 実装した要求の数 | 「Phase 1 の計測値より短く」（計測値そのものはリポジトリにありません） |
| 項目の完了 / BLOCKED | queue の done の件数と、blocked の件数 | BLOCKED 0 |
| 未回答の質問票 | 回答のない Q の数 | なし。次の `<answers>` で回答します |

### 流れ（速さ）の指標

工程や統合のタイムスタンプ（`run-state.py` と `integrate.py` が記録）から集計します。

| 指標 | 内容 | 目標 |
|---|---|---|
| 工程ごとの時間 | 工程 1〜6 の分数（`meta.json` の `stage_times`） | なし |
| 実効の並列度（実装ループ） | 項目の作業時間（doing の間）の合計 ÷ 実装ループの経過時間 | `parallel_workers` の 70% 以上 |
| 項目 1 件あたりの作業時間 | 項目の作業時間の平均（分） | なし |
| 統合の直列時間 | `integrate.py merge` の所要時間の合計と、実装ループに対する割合 | ループの 20% 以下 |
| 実際に使ったモデル | 役割ごとのモデルと呼んだ回数（`models.jsonl`。hook G-7 が記録） | `models` の設定と一致 |

### 履歴全体の指標（`kpi.py history`）

`docs/run-history.md` の行から集計します。

| 指標 | 内容 | 目標 |
|---|---|---|
| North Star | 検証済み要求の合計 ÷ 人の介入の合計（介入を記録した run のみ） | 増加傾向 |
| 無人完走率 | 結果が「全件完了」で始まる run の割合 | 80% 以上 |
| run あたりの人の介入（平均） | 人の介入を記録した run の平均 | 2 以下 |
| 1 回目のゲート通過率 | 全 run の合計 | 70% 以上 |
| 要求 1 件あたりの経過時間 | 経過時間の合計 ÷ 実装した要求の数 | 短縮傾向 |
| 直近の AC pass 率 | 最後の run の値 | 100% |
| AI クレジットを記録した run | `run-state.py finish --credits` で記録した run の割合 | 全件 |

### 目標値の根拠

目標値は `scripts/kpi.py` に定数または文字列として書かれており、**根拠の説明はリポジトリにありません**。コードから読み取れるのは次の範囲です。

| 目標 | 定義の場所 |
|---|---|
| 1 回目のゲート通過率 70% 以上、AC pass 率 100%、トレーサビリティ 100% | `TARGET_FIRST_GATE`・`TARGET_AC_PASS`・`TARGET_TRACE` |
| 人の介入 1（回答があれば 2） | run の表の「目標」の列（判定は 2 以下で「達成」）。初回の依頼と、質問票への回答の 2 回までを想定した値と読めますが、コードに説明はありません |
| 無人完走率 80% 以上、run あたりの人の介入 2 以下 | 履歴の表の「目標」の列 |
| 並列度 70% 以上、統合の直列時間 20% 以下 | 流れの指標の表の「目標」の列 |

目標は、この環境に合わせて見直す前提の初期値として扱い、変える場合は `kpi.py` の値と、この章の表を一緒に直します。

## 8.3 改善の進め方

KPI が悪いときは、まず **どの指標が悪いか** で、見る場所を分けます。それぞれの指標は `kpi.py run` の表の「根拠・内訳」列で、原因に近づけます。

| 悪い指標 | 見ること | 対処 |
|---|---|---|
| 人の介入が多い | 内訳（request・answers・resume・instruction）。`resume` が多いのは、run が途中で止まっているからです | 止まる原因を [7.2](07-troubleshooting.md#72-run-が止まる終わらない) で確認します。`answers` が多いのは、質問票が多いからです。`approval_policy` と、依頼の書き方を見直します（[1.3](01-writing-requests.md#13-run_options-の意味)） |
| 検証済み要求が少ない | 「検証済みにならなかった理由」 | 理由に応じて直します。「カタログの行がない」は implementer の書き漏れ、「BLOCKED の AC」は未回答の質問票、「System Test が pass でない AC」は実装か System Test の不備です |
| 1 回目のゲート通過率が低い | `attempts` が 2 以上の項目と、その失敗の原因（`work/runs/<run-id>/logs/`、`python scripts/summarize.py <ログ>`） | 項目が大きすぎないか（1 項目は要求 ID 1〜5 個）、実装のモデルが弱くないかを見ます（[4.2](04-customization.md#42-モデルの割り当てmodels)） |
| system AC の pass 率・トレーサビリティが低い | 台帳（`python scripts/ledger.py summary -v`）と、CHK-10・CHK-11 | AC が変わったのに System Test が追従していないときは、test-designer がケースを見直します（[7.3](07-troubleshooting.md#73-verify-が失敗する)） |
| BLOCKED が多い | 未回答の質問票 | 次の `<answers>` で答えます（[1.4](01-writing-requests.md#14-初回と-2-回目以降)） |
| run が遅い | 「実効の並列度」と「統合の直列時間」 | 下の表で切り分けます |

遅い run は、[`kpi.py` の流れの指標](#流れ速さの指標)で、並列度が低いのか、統合の直列時間が長いのかを切り分けます。

| 見立て | 意味 | 対処 |
|---|---|---|
| 並列度が低い | 作業役の待ちが多い。同じ共通部品・テーブルに触れる項目が並行できない、または項目が少ない | 計画（工程 3）で依存と境界が過剰でないかを見ます。`parallel_workers` を、項目の数に合わせます |
| 統合の直列時間が長い | verify・System Test が重い | `verify.commands` の重いコマンドに `"slow": true` を付けます（[4.1](04-customization.md#41-検証コマンドの登録verifycommands)）。統合は `--quick` で実行され、5 項目ごとにだけ全コマンドを実行します |
| 工程ごとの時間のどこかが突出する | その工程の作業役が遅い | 実際に使ったモデルを確認し、役割に合うモデルに変えます（[4.2](04-customization.md#42-モデルの割り当てmodels)） |
| 使ったモデルが `models` と違う | G-7 が効いていない | `work/.ebak/gate.log` と [7.1](07-troubleshooting.md#71-拒否差し戻し) を確認します |

### 進め方の手順

1. **変える前に計測する。** `python scripts/kpi.py run` の表を保存し、`docs/run-history.md` の直前の行と比べます。
2. **1 回に 1 つだけ変える。** モデル・`verify.commands`・`parallel_workers`・`approval_policy` のどれかです。複数を同時に変えると、効果の原因が分かりません。
3. **次の run の後に、同じ指標で比べる。** `python scripts/kpi.py history` の傾向（North Star・無人完走率・要求 1 件あたりの経過時間）を見ます。
4. **品質を下げて速くしない。** 品質（AC の pass 率・1 回目のゲート通過率・監査の CRITICAL・HIGH の件数）が下がったら、速さの改善を戻します。conductor の目的も、品質を落とす節約はしないことです。
5. **hook は止めたままにしない。** 切り分けで `gates.enabled` を `false` にしたら、必ず元に戻します（[4.3](04-customization.md#43-ゲートの調整gates)）。

AI クレジットは、取得できた run だけ記録されます。履歴の「AI クレジット」が `未取得` の行は、費用の比較に使えません（`kpi.py history` は、記録のある run の割合を表示します）。
