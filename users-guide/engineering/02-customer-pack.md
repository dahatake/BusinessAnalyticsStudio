# 2. 顧客パック

対象: 顧客ごとのデータを作る・直す Software Engineer。
顧客パックは、アプリ本体を変えずに、顧客の議論に必要なデータ・ブランドを差し替えるための一式です（FR-100・FR-119）。

## 2.1 構成

```
public/data/    customer・entities・issues・products・plan・architecture・mocks・show・sources の各 .json（9 ファイル）
public/brand/   brand-profile.json
assets/brand/   ロゴなどの画像
assets/audio/   BGM（任意）
data/customer-research.md   顧客調査の記録
brand/BRAND-RESEARCH.md     ブランド調査の記録
```

お手本パックは `examples/mono/`（既定）と `examples/koto/` にあり、同じ構成です。

| ファイル | 中身 |
|---|---|
| `customer.json` | 顧客名・Project 名・業種・`templateVersion`（雛形のバージョンとの互換の判定に使う） |
| `entities.json` | 現場・設備・拠点・工程などの「もの」。3D・地図・2D 図面・ナレッジグラフの元 |
| `issues.json` | 課題・原因・仮説・評価（重み付きスコアの評価値）・解決策・効果 |
| `products.json` | Microsoft 製品など、解決策につながる製品 |
| `plan.json` | 工程・Feature・タスク（ガントチャートの元） |
| `architecture.json` | AsIs / ToBe のビジネス・アプリ／システムの構成 |
| `mocks.json` | ミニ・モックアプリの定義 |
| `show.json` | プレゼンテーションのチャプター・議題・字幕 |
| `sources.json` | 出典（取得日・確度・機密区分） |

形式の正本は Zod スキーマ（[src/schema/files.ts](../../src/schema/files.ts)）で、`schema/*.json` はそこから生成した JSON Schema です。エディターの入力補完に使えます。

## 2.2 守るべき決まり

| 決まり | 内容 |
|---|---|
| ID | 小文字英数字とハイフンだけ。パック全体で一意（FR-114） |
| 参照 | `parentId`・`issueIds`・`sourceIds` など `REFERENCE_KEYS` の項目は、存在する ID を指す。存在しない ID は検証エラー |
| 作成者の種別 | すべての項目に `createdBy`（`ai` / `human` / `sample`）を付ける（FR-116）。サンプルの項目は画面に「サンプル」が出る |
| 出典 | 数値には `sourceIds` で出典を結びつける。**出典のない数値項目は 0 件**にする（verify の判定項目） |
| 確度 | 出典の確度は `高` / `中` / `低` / `推定`（FR-115） |
| 機密区分 | `internal` / `shareable`。エクスポートや匿名化の判断に使う（FR-117） |
| 未知のキー | スキーマは `looseObject` です。未知のキーは落とさずに保持されます |

> 検証で**項目だけが誤っている**場合、その項目は無効化され、ほかは表示されます（理由は `issues` に残ります）。ファイル全体が壊れている場合は、起動時にエラーになります。

## 2.3 作り方

### (a) 生成パイプライン

Skill `envisioning-dashboard`（`.github/skills/envisioning-dashboard/SKILL.md`）の手順を、コマンドにしたものです。

```
npm run pipeline -- all --customer "<顧客名>" --project "<Project 名>"
npm run pipeline -- research --customer "<顧客名>"      # ①②（事前調査）だけ
npm run pipeline -- build    --customer "<顧客名>"      # ③〜⑦（複製・生成・検証・起動）
```

| 入力 | 意味 |
|---|---|
| `--customer` / `--project` | 顧客名・Project 名（省くと対話形式で尋ねる） |
| `--intensity` | 演出強度（Executive / Showcase / Entertainment） |
| `--bgm` | BGM のフォルダー |
| `--material` | 追加資料（複数指定可） |
| `--workspace` | 作業フォルダーの親（既定は `work/envisioning/`） |
| `--smoke`（`playwright` か `mock`） | ⑥ のブラウザー検査（既定は Chromium） |
| `--copy` / `--no-keep` | ③ をフルコピーにする／⑦ で起動確認後にサーバーを止める |

終了コードは 0=成功、1=失敗、2=入力の誤りです。

> **既定の生成部品と調査部品はモックです。** `--generator` と `--researcher` を省くと、同梱のモック生成器とサンプルの調査（WorkIQ・Web の差し替え部品がないとき「利用不可」として前提を置く）で動きます。実際の顧客データを作るときは、`--generator <モジュールのパス>`・`--researcher <モジュールのパス>` で、`PackGenerator` / `Researcher` を実装した部品を渡します（[scripts/pipeline/generate.ts](../../scripts/pipeline/generate.ts)・[research.ts](../../scripts/pipeline/research.ts)）。

### (b) 手で作る

1. `examples/mono/` を作業フォルダーに複製する。
2. `public/data/*.json` と `public/brand/brand-profile.json` を書き換える（`schema/` を参照）。
3. ロゴなどを `assets/brand/` に置く。
4. 検証する（次節）。

## 2.4 検証する

```
npm run check:pack -- <顧客パックのフォルダー>      # 形式と必須ファイル、参照の整合
npm run verify:pack -- <作業フォルダー>             # 受け入れ判定（ブラウザーで 9 項目）
```

`verify:pack` の 9 項目は、スキーマ検証エラー 0 件／起動時のページエラー 0 件／Primary 色の反映と AA コントラスト／タイトルとオープニングの顧客名・Project 名／出典のない数値項目 0 件／主要画面の「サンプル」「AI 生成」の表示／P・M・Esc の動作／Markdown のエクスポートと復元／所要時間の合計、です。失敗した項目は、原因と対処が出力されます。

## 2.5 アプリへ反映する

顧客パックは、**このリポジトリには入れません**（`public/data/` は空のまま）。配信側が重ねます。

| 方法 | 手順 |
|---|---|
| 開発サーバー | `EDB_PACK=<フォルダー名> npm run dev`。`examples/<名前>/` が `/data/`・`/brand/`・`/assets/brand/` に重なる（[vite.config.ts](../../vite.config.ts)。既定は `mono`） |
| ビルド済みの `dist/` | `dist/data/` と `dist/brand/`、`dist/assets/brand/` に置く（再ビルド不要）。ない間は `dist/example-pack/` のお手本パックで起動する |
| 配布パッケージ | [7. ビルド・配布・運用](07-build-and-distribution.md) |

## 2.6 バージョンの互換

`customer.json` の `templateVersion` が、雛形のバージョン（`package.json` の `version`）と互換でないとき（メジャーが違う、パックが新しい、メジャーが 0 の間はマイナーも違う）は、画面に警告が出ます（FR-106）。雛形を上げたら、パックの `templateVersion` と形式の変更点を確認してください。

## 2.7 スキーマを変えるとき

1. `src/schema/` の Zod スキーマを変える。
2. `npm run gen:schema` で `schema/*.json` を再生成する（`-- --check` は差分があると失敗する。CI 向け）。
3. お手本パック（`examples/`）を新しい形式に合わせる。
4. `npm run check:pack -- examples/mono` と単体テスト（`tests/unit/`）を通す。
5. 既存の顧客パックに影響する変更は、`templateVersion` の扱いを決める（上記 2.6）。
