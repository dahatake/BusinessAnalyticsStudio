# System Test の契約（テスト側が前提にすること）

テストは要求定義書の受入基準だけから作った。アプリはまだ存在しない。実装は次の契約を満たすこと。契約を変える必要があるときは、要求定義書と台帳を通して変更する（実装側でテストに合わせて勝手に変えない）。

## 1. 実行
- ランナー: Playwright（`tests/system/`。`npm ci` は `tests/system/` で 1 回）。ブラウザーは Chromium（要求定義書 §3.5）。
- 1 つの AC: `node tests/system/run.mjs AC-001`（リポジトリルートから。AC ID が題名に入るテストだけを実行。0 件なら非 0）。
- 一覧: `npm run st:list --prefix tests/system`。型検査: `npm run typecheck --prefix tests/system`。
- 性能の AC（`@perf`、AC-117・AC-163）は `chromium-perf` プロジェクトで、並列なしで実行する。
- 証跡: `RUN_ID` があれば `work/runs/<run-id>/evidence/playwright/`。

## 2. 起動（アプリの前提）
- アプリの起動をテストが行う: ビルド済みの `dist/`（リポジトリルート）を、`support/server.ts` が 127.0.0.1 のランダムなポートで静的に配信する。実装側は **`dist/` に静的ビルドが出る** こと（ビルドは conductor が事前に実施）。
- 顧客パックは `dist/` を書き換えずに重ねて配信する（`/data/`→`public/data/`、`/brand/`→`public/brand/`、`/assets/brand/`→`assets/brand/`）。
- `/runtime-config.json` に `{ "relayUrl": "<URL>", "aiMock": { "delayMs": n } }` を返す。アプリはこれを読んで中継プロセスの URL と AI モックを決める。
- URL には `?e2e=1` が付く。外部ネットワークへの通信はしない（AI は中継プロセスのスタブ `support/relay-stub.ts`、HTTP の形は §5）。

## 3. お手本パック
- `examples/`（FR-118）に `mono`・`koto` のパックが置かれる（`support/packs.ts`）。テストは匿名化した合成データの変種を `work/` 以下に作って使う。

## 4. 画面の探し方（CSS のクラス名には依存しない）
- `data-testid`: `opening`・`workspace`・`nav-<key>`・`component-<key>`（key は `support/fixtures.ts` の MAIN_SCREENS: canvas / issue-solution / priority / knowledge-graph / architecture / discussion-tree / gantt / whiteboard / settings）、そのほか各スペックで使うもの（`count-badge`・`source-card`・`product-fit` など）。全一覧は `grep -oh "getByTestId('[a-z0-9-]*" tests/system/e2e support`。
- `data-entity-id="<ID>"`: 同じ ID の項目。`data-highlight="selected|hover|dimmed|related"`: 強調の状態。
- ロール・文言: コマンドパレットは `Ctrl+K`（dialog「コマンドパレット」＋combobox）、ペルソナ切替ボタン「ペルソナ」（menuitemradio）、「編集モード」switch、オープニングは `Esc` で飛ばせる。

## 5. 中継プロセス（スタブ）の HTTP
- `support/relay-stub.ts` の形（CORS 許可、POST で質問、応答は回答と出典 ID）。詳細はそのファイルとスペックの AC-176 付近。

## 6. テスト用フック（`?e2e=1` のときだけ `window.__edbTest` が有効）
`annotations.count/presentation`・`audio.isAudible`・`board.state`・`canvas.isCentered/viewport`・`gantt.tasks`・`graph.allEdges/nodes`・`ink.loadSynthetic`・`map.markers`・`scene.camera/info/objects`。戻り値の型は `support/fixtures.ts` と各スペックの使い方に従う。
フックは「画面に見える状態」を機械的に読むためだけに使い、判定の主は画面の操作と表示にする。

## 7. 手動確認
- 自動化しない AC はない（全 AC を自動テストで確かめる）。ブラウザー依存の GPU 描画の見た目は、`expectCanvasDrawn` と `scene` フックで代替する。
