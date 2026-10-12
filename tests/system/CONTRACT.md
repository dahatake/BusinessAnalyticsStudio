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

## 8. 分析手法・ステッパー・企業別 Project（FR-133〜137。analysis-projects.spec.ts が前提にする画面の探し方）
- 企業: ボタン「企業を登録」→ dialog 内の textbox「企業名」＋ボタン「登録」。企業ごとに region「企業 <企業名>」。その中にボタン「Project を作成」（dialog: textbox「Project 名」＋ボタン「作成」）と、Project への link（名前は Project 名）。link で Project を開く。
- ステッパー: `data-testid="stepper"`。各ステップは listitem（5 個。名前は課題定義・現状分析・KPI 測定・ユースケース作成・施策計画）で、`data-step-state="not-started|current|done"`。ステップは button（名前＝ステップ名）で、押すと対応する作業画面へ移動する。
- 端末内保存・Project 切替・レイアウト（FR-137/138・NFR-UX-006・NFR-SEC-004。同じ spec の末尾）:
  - 「アプリを閉じて開き直す」は同じブラウザー文脈での `page.reload()`（保存先は端末内。別の browser context＝別の端末には引き継がれない）。開き直し後は企業の region が見え、Project は link で開き直す（開いたままなら stepper が見える）。
  - Project 画面からボタン「Project 一覧へ」で企業・Project の一覧に戻る。Project を切り替えて未保存の入力があるときの確認の案内は role=alertdialog か dialog（AC-210 は統合テストの範囲で、この spec では扱わない）。
  - レイアウト: 分析画面のパネル `data-testid="analysis-result"` の見出し部 `data-testid="panel-handle"`（そのパネル内）をドラッグすると位置が変わる（`boundingBox` の変化で判定）。ボタン「レイアウトを既定に戻す」で既定の位置に戻る。
  - NFR-SEC-004: 通信は `page.on('request')` で、配信物は `dist/` の全ファイルの文字列検索で調べる（企業・Project 名は一意な合成値）。
- 分析: ボタン「分析を開始」→ listbox「分析手法」の option（5 手法の名称）。開始後は `data-testid="analysis"`。その中に `analysis-params`（入力欄。値は spinbutton。範囲外はエラーを role=alert で表示）、`analysis-result`（結果。採用した値のテキストを含む）、radiogroup「ビュアー」の radio（2 つ以上）、searchbox「絞り込み」、`result-item`（`data-entity-id`・`data-value`・`aria-selected`）。

## 9. コンポーネントの移動・自動サイズ調整・作業先の選択・Fluent 2（FR-142〜144・NFR-UX-007。workspace-layout.spec.ts が前提にする画面の探し方）
- 移動: コンポーネントの見出し（heading）をつかんでドラッグする。移動中は置ける場所を `data-testid="drop-indicator"` で示す。Esc で中止できる。
- 自動サイズ調整: フォーカスしたコンポーネントの面積が基準の PARAM-033（1.5）倍になる。switch「サイズの自動調整」で切り替える。
- 作業先: 常に表示する `data-testid="work-target"`（「デモ」または「企業名 / Project 名」）。ボタン「作業先」で dialog「作業先の選択」を開く。候補は option（「デモ」「<企業名> … <Project 名>」「実際の Project を登録」）。実 Project が 2 件以上ある端末では起動時に同じ dialog を出す。
- 表示設定: Light/Dark は `emulateMedia({colorScheme})`、ハイコントラストは `forcedColors: 'active'`、動きの軽減は `reducedMotion: 'reduce'`。
