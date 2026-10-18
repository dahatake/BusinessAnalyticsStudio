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
| `--copy` | ③で `node_modules` と `dist` をフルコピーする（既定は、読み取り専用のリンクで共有して瞬時に用意する） | リンク |
| `--no-keep` | ⑦で起動を確かめたら、サーバーを止めて終了する | 起動したままにする |
| `--smoke` | ⑥verify のブラウザー検査（`playwright`／`mock`。`mock` はブラウザーを使わず合格とする検証用） | `playwright` |

## 規則

- ⑤スキーマ検証でエラーが出たら、エラーの箇所だけを再生成して直します（自己修正。FR-126）。全体は再生成しません。最大 3 回（PARAM-006）で、上限に達したらエラーの一覧を出して止まります。
- ④で生成する `public/data/entities.json` は、全エンティティに世界区分 `world`（`real`＝現実世界／`digital`＝デジタル世界）と種別 `kind` を付けます（FR-213。値は要求定義書 §3.7 の「顧客パックに書く値」）。
  種別は、現実世界が `site`・`equipment`・`person`・`organization`・`operation`・`thing`・`event`、デジタル世界が `data`・`model`・`system`・`ui-component`・`metric` です。上位（`parentId`）は同じ世界区分の中だけで指します。
  デジタル世界と現実世界の対応は `twins[]`（`realId`・`digitalId`・`relation`＝`represents`／`measures`／`records`／`displays`・出典 `sourceIds`）に書きます（FR-214）。
  種別 `person` は役割の単位（例: 「保守担当」）だけで書き、個人名・連絡先を入れません（Q-037 の回答まで）。
  生成した顧客パックでは「区分なし」（`world` か `kind` のないエンティティ）を許しません。⑤スキーマ検証は区分なしを位置つきのエラー（例: `public/data/entities.json entities[3].world`）にして、その箇所を再生成します。⑥verify も区分なしを項目 1 の不合格にします（単独では `npm run verify:pack -- <作業フォルダー> --generated`）。手作りの顧客パックの検証（`--generated` なし）では、区分なしは件数の警告だけです。
- ⑥verify は、顧客パックの受け入れを 9 項目（スキーマ検証エラー 0 件・起動時のページエラー 0 件・Primary 色の反映と AA コントラスト・タイトルとオープニングの顧客名・Project 名・出典のない数値項目 0 件・主要画面の「サンプル」「AI 生成」の表示・`P`/`M`/`Esc` の動作・Markdown の保存と復元・所要時間）で判定します。1 分（PARAM-020）以内に行い、不合格の項目は原因と対処を出して止まります。ブラウザー検査は `tests/system` の Playwright（Chromium）を使うので、`tests/system` で `npm install` と `npx playwright install chromium` を済ませておきます。単独では `npm run verify:pack -- <作業フォルダー>` で実行できます。
- ⑦起動は、127.0.0.1 だけで待ち受ける静的サーバーで `dist` と顧客パックを配信し、URL を表示します。ポートが使用中なら別のポートで起動します。
- 追加資料（`--material`）に、雛形が持たない画面種別の要望（行頭に `画面種別: ○○`）や、`雛形への要望: ○○` の行があれば、顧客パックでは実装せず、作業フォルダーの親の `template-improvement-requests.md` に「雛形への改善要望」として追記します（FR-131。コミットしません）。
- 雛形の用意（③）は 30 秒以内に行い、`npm install` とビルドを実行しません。雛形は、事前に 1 度だけ `npm install` と `npm run build` を済ませておきます。
  既定では `node_modules` と `dist` をリンク（Windows はディレクトリ・ジャンクション）で共有します。複製先で `npm install` を実行したり `dist` を書き換えたりしないでください（雛形に及びます。必要なら `--copy`）。
  `.env`（`.env.example` を除く）と、雛形に残った顧客のデータ（`public/data`・`public/brand`・`assets/brand`・`assets/audio`）は複製しません。
- 工程ごとの開始・終了時刻・方式（link／copy）と所要時間は、作業フォルダーの `logs/timing.json` に、実行したコマンドは `logs/commands.json` に記録します。
- 調査キャッシュと顧客パックは顧客の情報です。コミットしません（既定の置き場所 `work/` は Git の対象外です）。
- 調査（WorkIQ・Web・Copilot）と生成（LLM）の実際の接続は、接続点（`Researcher`・`PackGenerator`）の後ろにあります。接続の実装は `--researcher <モジュール>`・`--generator <モジュール>` で差し替えます。既定は、外部に接続しない同梱のサンプル・モックです。顧客情報を外部に送ってよい条件は、利用者の決定（Q-001）に従います。
- WorkIQ 由来の情報は、出典に機密区分（`internal`／`shareable`）を付けます（FR-117）。付いていないとスキーマ検証でエラーになります。
