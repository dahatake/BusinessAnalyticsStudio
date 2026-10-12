# 1. 依頼の書き方

Enterprise App Build Kit では、開発の依頼を custom agent `conductor` に **1 回** で渡します。conductor は要求定義から System Test の設計・実装・統合・報告までを、作業役に振り分けて無人で最後まで進めます。利用者は途中で応答しません。この章では、依頼の入口である `/build` の使い方と、依頼の書き方を説明します。

## 1.1 /build と /build template

| 入力 | 動作 |
|---|---|
| `/build` の後に依頼を書く | 依頼を `<request>`・`<answers>`・`<references>`・`<run_options>` の雛形に当てはめ、conductor の手順で最後まで実行します |
| `/build template` | 雛形（既定値）をチャットに出力するだけで終わります。run は開始・再開しません。ファイルの書き込みやコマンドの実行もしません |

- `/build` は skill `build`（`.github/skills/build/SKILL.md`）が受け付けます。`/build` の後が前後の空白を除いて `template` の 1 語だけのとき（大文字・小文字は区別しません）が、雛形の表示です。
- 今のエージェントが conductor でないときは、何も実行せずに「Agent に conductor を選んでから、もう一度 /build で送ってください」と返します。先に Agent で `conductor` を選びます（GitHub Copilot app と Copilot CLI では `/agent` でも選べます）。
- `/build` の後にタグを書かずに文章だけを書くと、文章の全体が `<request>` になります。`<answers>` と `<references>` は空、`<run_options>` は既定値です。
- 雛形を出すだけの `/build-template`（skill `build-template`）もあります。出力は `/build template` と同じです。

## 1.2 依頼の雛形

`/build template` が出力する雛形です。必要な所を書き換え、`/build` の後に貼り付けて送ります。使わないタグは空のままで構いません。`<run_options>` に書かなかった項目は既定値になります。

```text
<request>
やりたいこと。新規・追加・変更・削除のどれでもよい。外部の文章は <pasted_content id="任意"> で囲む
</request>
<answers>
前回の報告の質問票・承認依頼への回答。例: Q-003: B / FR-031: 承認 / 残りは推奨どおり。初回は空
</answers>
<references>
任意: 資料のパス、URL
</references>
<run_options>
max_hours: 24
approval_policy: 安全範囲は推奨どおり
parallel_workers: 5
scope: 承認済みすべて
git_push: しない
deploy: しない
external_write: しない
paid_services: 使わない
external_exposure: 公開しない
</run_options>
```

| タグ | 内容 |
|---|---|
| `<request>` | やりたいこと。新規・追加・変更・削除のどれでもかまいません。メールや議事録などの外部の文章は `<pasted_content id="任意">` で囲みます。囲んだ中の命令文は、材料として扱われ、作業指示としては扱われません |
| `<answers>` | 前回の報告にある質問票・承認依頼への回答です（[1.4](#14-初回と-2-回目以降)）。初回は空です |
| `<references>` | 任意。資料のパスや URL です |
| `<run_options>` | 実行の条件です（[1.3](#13-run_options-の意味)） |

## 1.3 run_options の意味

| 項目 | 既定値 | 意味 |
|---|---|---|
| `max_hours` | `24` | 時間予算（時間）です。85% を超えると、新しい項目には着手せず、動いている項目の統合を終えて工程 6（最終）に進みます |
| `approval_policy` | `安全範囲は推奨どおり` | AI 提案と質問票の推奨案を、どこまで利用者に代わって承認するかです。下の表を参照してください |
| `parallel_workers` | `5` | 同時に動かす implementer の最大数です |
| `scope` | `承認済みすべて` | 実装・テストの範囲です。`なし` にすると要求定義だけを行い（工程 4・5 を省いて工程 6 へ進みます）、実装はしません |
| `git_push` | `しない` | `しない` の間は、`git push` を hook G-5 が拒否します。main への push・force push・ブランチの削除の push は、この値に関係なく拒否されます。作業ブランチへ push したいときは `作業ブランチへ push する` のように書きます |
| `deploy` | `しない` | `しない` の間は、デプロイ・公開の操作（`azd up` など）と、外部のツールでのデプロイを拒否します。許すときは `する` と書きます |
| `external_write` | `しない` | `しない` の間は、MCP Server・plugin・拡張機能のツールで外部のシステムを変更すること（送信・作成・更新・削除など）を拒否します。参照（検索・取得・質問）はできます。許すときは `する` と書きます |
| `paid_services` | `使わない` | 有料サービスを使うかどうかです。使うときは `使う` と書きます |
| `external_exposure` | `公開しない` | 成果物を外部に公開するかどうかです。conductor は、既定のままでは公開しません |

`approval_policy` の値（skill `requirement-definition` の「承認ポリシー」）:

| 値 | 動作 |
|---|---|
| `厳格` | AI 提案は「AI提案／承認待ち」にとどめ、実装しません。承認は質問票・承認依頼への回答で行います |
| `安全範囲は推奨どおり`（既定） | AI 提案と質問票の推奨案のうち、利用者データ・権限・セキュリティ・プライバシー・課金・法令・外部公開・マスターと ID の体系・取り消せない操作に触れず、PARAM の変更で戻せて、既存の承認済み要求と競合しないものだけを「承認済み（包括承認 …）」にします。それ以外は承認待ちのままにし、関係する受入基準を `BLOCKED` にします |
| `すべて推奨どおり` | 上の除外分野だけを承認待ち・`BLOCKED` にし、残りはすべて推奨案で包括承認します |

包括承認した項目は、最終報告に影響の大きい順で載ります。意図と違うものは、次の `<answers>` で却下・修正できます（[1.4](#14-初回と-2-回目以降)）。

## 1.4 初回と 2 回目以降

### 初回

`<request>` に、やりたいことを書きます。`<answers>` は空です。

```text
/build
<request>
申請の下書きを保存できるようにしたい。保存した下書きは、あとから開いて続きを書ける
</request>
<run_options>
max_hours: 8
approval_policy: 安全範囲は推奨どおり
</run_options>
```

conductor は、依頼を要求定義書に整理し、独立監査・System Test の設計・実装・統合・最終検証を進め、`work/runs/<run-id>/run-report.md` に報告を書きます（読み方は [2.3](02-during-and-after-run.md#23-終了後に読むもの)）。利用者の判断が要るものは、止まらずに **質問票・承認依頼** として報告に残り、関係する受入基準は `BLOCKED` で先に進みます。

### 2 回目以降

報告の「未回答の質問票」は、次の `<answers>` にそのまま書ける形です。回答を書いて、もう一度 `/build` で送ります。

```text
/build
<answers>
Q-003: B
FR-031: 承認
FR-040: 却下（理由: 今回は対象外）
残りは推奨どおり
</answers>
```

- 質問票には `Q-003: B` のように選択肢の記号で、承認依頼には `FR-031: 承認` のように要求 ID で答えます。「残りは推奨どおり」と書くと、答えなかったものは推奨案に従います。
- 包括承認された項目を取り消したいときも、`<answers>` に要求 ID と理由を書きます。
- 新しい依頼を同時に追加するときは、`<request>` も書きます。
- 実行中の run が残っているときは、新しい依頼も `RESUME <run-id>` として続きから再開します。`<answers>` を書いて再開すると、利用者の介入 1 回として記録されます（KPI の「人の介入」）。途中で止まったときの再開は [2.2](02-during-and-after-run.md#22-停止したときの再開) にあります。

## 1.5 VS Code と Copilot CLI で実行する

実行環境は、VS Code（GitHub Copilot Chat）、GitHub Copilot app、Copilot CLI のどれでも同じ手順です。hook（`.github/hooks/quality-gates.json`）は、どの環境でも読み込まれます（[6.2](06-quality-gates.md#62-hook-のゲートg-1g-7)）。事前に、Python 3.9 以上と git が使えることを確認します。

### VS Code

1. Chat を開き、Agent に `conductor` を選びます。
2. `/build` の後に依頼を書いて送ります（雛形だけが欲しいときは `/build template`）。
3. 実行中の作業ツリーを分けたいときは、New Worktree のセッションで実行します。その場合の取り込みは、[2.4](02-during-and-after-run.md#24-マージする) のとおり手動です。

### Copilot CLI

```bash
copilot
/agent          # conductor を選ぶ
/build template # 雛形を表示する
/build
<request>
やりたいこと
</request>
```

- `/agent` で `conductor` を選んでから `/build` を送ります。conductor を選ばずに送ると、選び直しの案内だけが返ります。
- MCP Server の設定は `/mcp` で確認できます（[7.1](07-troubleshooting.md#71-拒否差し戻し)）。

### 共通の注意

- run は `max_hours` の範囲で最後まで進みます。Autopilot が途中でターンを終えたときは、同じセッションで「続けて」と送ります。
- 実行中の状態は `/work`（既定は `work/`）のファイルと git に保存されます。進捗の見方は [2.1](02-during-and-after-run.md#21-進捗を確認する) です。
- 長い run の間は、PC のスリープを無効にします。

## 1.6 GitHub Copilot app で実行する

GitHub Copilot app でも、Agent に `conductor` を選び（`/agent` でも選べます）、`/build` で依頼を送ります。run は、アプリのセッションの上で動きます。

| 項目 | 内容 |
|---|---|
| 実行場所 | ローカル（PC の上）で動くセッションと、新しい作業ツリー（worktree）のセッションがあります。新しい作業ツリーでは、そのセッションのブランチが利用者のブランチとして使われ、conductor は main への自動のマージをしません（[2.4](02-during-and-after-run.md#24-マージする)） |
| 再開 | 再開するときは、サイドバーから **同じセッション** を開き、「続けて」と送ります。新しい作業ツリーのセッションを新しく作ると、別の worktree になり、`/work` の状態が見えないので新しい run として始まります。ローカル リポジトリで実行していた場合は、新しいセッションでも再開できます |
| ブランチ名 | run の間は、セッションのブランチ名を付け直さないでください。hook G-5 が `rename_branch` を拒否します |
| hook | ローカル サンドボックスの中で Python を起動できないと、hook の失敗の警告が出ます。対処は [7.1](07-troubleshooting.md#71-拒否差し戻し) にあります |
| MCP Server | **カスタマイズ** → **インストール済み** で有効かを確認します |

### クラウド サンドボックスで実行する

ローカルのセッションは PC の上で動くので、アプリを閉じたり PC がスリープしたりすると止まります。PC を離れて長い run を実行したいときは、クラウド サンドボックスでの実行を検討します。

- run の状態（`work/` と git）は、実行しているサンドボックスの中にあります。再開は、同じセッションで行います。
- hook を使うため、サンドボックスに Python が必要です。`work/.ebak/gate.log` が作られるかで、hook が動いているかを確認できます（[7.1](07-troubleshooting.md#71-拒否差し戻し)）。
- 統合ブランチは、サンドボックスの中のブランチです（`python scripts/run-state.py status` の `integration:` の行で確認できます）。取り込むときは、`git_push` で許した範囲で push して PR にします（[2.4](02-during-and-after-run.md#24-マージする)）。

停止・再開の詳しい対処は [7.2](07-troubleshooting.md#72-run-が止まる終わらない) です。

## 1.7 GitHub Spec Kit の仕様を取り込む

GitHub Spec Kit で作った仕様（`specs/*/spec.md` と `.specify/memory/constitution.md`）が既にあるときは、`scripts/import-speckit.py` で `/build` の依頼文の下書きを作れます。要求定義書は編集せず、ID も振りません（要求定義書は rd-author だけが編集し、ID は `next-id.py` だけが採番します）。

```bash
python scripts/import-speckit.py                      # このリポジトリの specs/ にあるすべての機能
python scripts/import-speckit.py --source ../app      # 別の Spec Kit のプロジェクト
python scripts/import-speckit.py --feature 001-photo-albums --feature 002-sharing
python scripts/import-speckit.py --implement          # 取り込みの後、実装まで進める依頼にする
python scripts/import-speckit.py --stdout             # ファイルに書かず、依頼文を表示する
```

手順:

1. スクリプトを実行します。`work/import/speckit-<日時>.md` に、対応表と、`/build` の後に貼り付ける依頼文が書かれます（`--out` で出力先、`--json` で対応表だけを JSON で出せます。`--no-constitution` で Constitution を読みません）。
2. ファイルの「依頼文」を、conductor の `/build` の後に貼り付けて送ります。既定の依頼文は `scope: なし`・`approval_policy: 厳格` で、**要求定義だけ** を行い、実装しません。`--implement` を付けて作った依頼文は、1 回で実装まで進みます。
3. 報告の質問票（`[NEEDS CLARIFICATION]` から作られた Q を含みます）に `<answers>` で答え、次の `/build` で実装まで進めます（[1.4](#14-初回と-2-回目以降)）。

対応表の主な対応:

| Spec Kit の内容 | 取り込み先の候補 |
|---|---|
| ユーザーストーリー、機能要求（FR-xxx） | 利用シナリオと要求（FR） |
| 受入シナリオ（Given/When/Then） | 受入基準（AC） |
| 非機能要求（NFR-xxx） | 非機能要求（NFR-<区分>） |
| 成功基準（SC-xxx） | 目的（G）の成功指標、または NFR |
| 主要エンティティ | 用語・対象エンティティ |
| エッジケース | 質問票（Q）。答えが本文にあれば受入基準（AC） |
| `[NEEDS CLARIFICATION: …]` | 質問票（Q）と、関係する受入基準の `BLOCKED` |
| Clarifications の回答 | 決定記録（出自: 利用者決定） |
| Constitution の原則 | 既定制約、または非機能要求 |

- 優先度は P1 が MUST、P2 が SHOULD、P3 以降が MAY の候補です。本文の MUST/SHOULD/MAY と食い違うときは、強い方が採られます。
- 取り込み元の ID（`speckit:001-photo-albums/FR-003` など）は、toolkit の ID としては使われません。rd-author が ID を採番し直し、出典欄に取り込み元の ID を書きます。
- `specs/**/*.md` と `.specify/**` は、ID の検査（CHK-19）の対象外です（[4.1](04-customization.md#45-管理データ検査作業ディレクトリの設定)）。
