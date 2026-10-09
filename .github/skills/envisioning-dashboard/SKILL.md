---
name: envisioning-dashboard
description: 顧客ごとの顧客パック（public/data の JSON ほか）を生成し、ビジネス議論の分析ボードを起動する生成パイプライン。「research」（①顧客調査・②ブランド調査）、「build」（③雛形の複製・④顧客パックの生成・⑤スキーマ検証・⑥verify・⑦起動）、「all」（①〜⑦）のコマンド単位で実行する。顧客名・Project 名・演出強度・BGM フォルダー・追加資料を入力変数として受け取る。
argument-hint: research | build | all と、顧客名などの入力変数（省くと顧客名を尋ねる）
---

# envisioning-dashboard（生成パイプライン）

商談の相手ごとに、顧客固有の情報を持つ「顧客パック」を作り、共通のアプリ（雛形）と組み合わせて起動します。
アプリ本体のコードは顧客固有の情報を持ちません。顧客固有の値は、すべて顧客パックの JSON にあります（FR-100）。

処理の流れ: ①顧客調査 と ②ブランド調査 を事前に行って調査キャッシュに保存 → ③雛形の複製 → ④顧客パックの生成 → ⑤スキーマ検証 → ⑥verify → ⑦起動。
①②は事前（バックグラウンド）、③〜⑦は商談の直前に実行します。

## コマンド

各コマンドは、リポジトリのルートで、次のスクリプトを呼びます（`scripts/pipeline/cli.ts`。npm script `pipeline`）。

### research

①顧客調査と②ブランド調査を行い、結果を `research-cache/<顧客名>/` に保存します。

```text
npm run pipeline -- research --customer "<顧客名>"
```

### build

③雛形の複製 → ④顧客パックの生成 → ⑤スキーマ検証 → ⑥verify → ⑦起動 を順に実行します。
調査キャッシュがなければ、前提を置いたサンプル（情報源は「推定（サンプル）」）で続けます。

```text
npm run pipeline -- build --customer "<顧客名>"
```

### all

①〜⑦をすべて実行します。

```text
npm run pipeline -- all --customer "<顧客名>"
```

## 入力変数（FR-130）

引数で渡すか、省いて対話形式で答えます。すべてを引数で渡すと、質問せずに実行します。

| 引数 | 内容 | 既定 |
|---|---|---|
| `--customer` | 顧客名（必須。省くと対話形式で尋ねる） | なし |
| `--project` | Project 名 | `<顧客名> プロジェクト` |
| `--intensity` | 演出強度の既定値（`Executive`／`Showcase`／`Entertainment` の 3 段階。それ以外は、有効な値を示して止まる） | `Showcase` |
| `--bgm` | BGM フォルダー（顧客パックの `assets/audio/` に複製） | なし |
| `--material` | 商談メモなどの追加資料（繰り返し指定できる） | なし |
| `--workspace` | 作業フォルダーの親（調査キャッシュと顧客ごとの作業フォルダーを置く） | `work/envisioning/` |
| `--template` | 雛形（`node_modules` と `dist` を含むビルド済みのアプリ） | リポジトリのルート |
| `--no-keep` | ⑦で起動を確かめたら、サーバーを止めて終了する | 起動したままにする |

## 規則

- 雛形の複製（③）は `node_modules` と `dist` を含めて 30 秒以内に行い、`npm install` とビルドを実行しません。雛形は、事前に 1 度だけ `npm install` と `npm run build` を済ませておきます。
- 工程ごとの開始・終了時刻と所要時間は、作業フォルダーの `logs/timing.json` に、実行したコマンドは `logs/commands.json` に記録します。
- 調査キャッシュと顧客パックは顧客の情報です。コミットしません（既定の置き場所 `work/` は Git の対象外です）。
- 調査（WorkIQ・Web・Copilot）と生成（LLM）の実際の接続は、接続点（`Researcher`・`PackGenerator`）の後ろにあります。接続の実装は `--researcher <モジュール>`・`--generator <モジュール>` で差し替えます。既定は、外部に接続しない同梱のサンプル・モックです。顧客情報を外部に送ってよい条件は、利用者の決定（Q-001）に従います。
- WorkIQ 由来の情報は、出典に機密区分（`internal`／`shareable`）を付けます（FR-117）。付いていないとスキーマ検証でエラーになります。
