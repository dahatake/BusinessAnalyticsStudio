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
- 作業先: 常に表示する `data-testid="work-target"`（「デモ」または「企業名 / Project 名」）。ボタン「作業先」で dialog「作業先の選択」を開く。候補は option（「デモ」「<企業名> … <Project 名>」「実際の Project を登録」）。起動のたびに（実 Project が 0 件でも）同じ dialog を必ず出し、何も選ばずには閉じられない（FR-144 AC-237・AC-239）。support/fixtures.ts の `skipOpening` は、この dialog が出ていればデモ（なければ最初の Project）を選んで進む。選択画面そのものを確かめるテストは `skipOpening: false` で起動し `pressOpeningEscape`（オープニングだけ飛ばす）を使う。
- デモの非表示（FR-144 AC-240・AC-241）: 設定画面（`nav-settings`）の switch「選択画面にデモを表示」（既定: オン）。オフにすると dialog「作業先の選択」にデモの option が出ない。端末内（localStorage 等）に保存され、再読込後も維持され、別の browser context には引き継がれない。
- 最初のフレーム（FR-147 AC-246〜250）: 新しいフックは使わない。「最初のフレーム」は `scene.info().frame > 0` かつ `scene.objects()` に `visible` な拠点がある状態。開いた時刻は `openScreen(view3d)` の直前。
- 3D の描画面（FR-146 AC-243・AC-244）: `data-testid="component-view3d"` の中の `canvas` と、その親要素（表示領域）の大きさを比べる。クリックは `scene.objects` の画面座標へ `page.mouse.click`。
- 表示設定: Light/Dark は `emulateMedia({colorScheme})`、ハイコントラストは `forcedColors: 'active'`、動きの軽減は `reducedMotion: 'reduce'`。

## 10. 作業先メニュー・操作アイコン・最小化・スナップ・KPI/OKR（FR-148〜154・NFR-UX-008。workspace-ops.spec.ts が前提にする画面の探し方）
- 作業先メニュー（FR-148）: 最上段に常時 `data-testid="work-target-menu"`（button。表示は現在の作業先）。押すと menu「作業先」。項目は menuitemradio（「デモ」「<企業名> … <Project 名>」。現在の作業先は checked）。Esc で閉じる。
- 操作アイコン（FR-150）: フォーカス中のコンポーネントの見出しに `data-testid="component-actions"`。その中の button（名前: 最大化・通常表示・最小化・元に戻す・タブにまとめる・非表示・その他の操作）。最小化中は `data-minimized="true"`。非表示の一覧は button「非表示のコンポーネント」→ menuitem。常時見える操作部品: ミュート・アニメーションの停止/再生・編集モード・レイアウトを既定に戻す（FR-149）。
- 左メニューの最小化（FR-151）: button「メニューを最小化」／「メニューを元の幅に戻す」。最小化中も `nav-<key>` は名前つきで表示され、ホバーで tooltip に画面名。
- スナップ（FR-152）: 端から 32 CSS px 以内で `data-testid="snap-candidates"`（候補は button「左半分」「右半分」「上半分」「下半分」「4 分割」「3 分割」「タブ化」）と `snap-preview`。候補の上で離すと配置。
- KPI/OKR（FR-153・154）: component key `kpi-okr`。button「OKR を定義」→ dialog「OKR の定義」（textbox「Objective」、button「Key Result を追加」、`key-result` ごとに textbox「Key Result 名」「KPI 名」「単位」、spinbutton「基準値」「目標値」「現在値」、button「保存」、検証エラーは role=alert）。達成度は `data-testid="kpi-achievement"`（「25%」または「算出できない」）。未定義は「未設定」。
- モーション（NFR-UX-008）: `document.getAnimations()` と計算済み transition/animation の所要時間で判定。停止は P と `animation-state`。

## 11. ユースケース登録・プレゼン用アニメーション（FR-155〜158・NFR-UX-010。usecase-animation.spec.ts が前提にする画面の探し方）
- 登録（FR-158）: ステッパーのボタン「ユースケース作成」→ `data-testid="usecase-editor"`。ボタン「ユースケースを追加」→ dialog「ユースケース」（textbox「名称」「概要」「対象ペルソナ」「期待する効果」、ボタン「手順を追加」、手順ごとに textbox「手順 n の見出し」「手順 n の説明」、ボタン「保存」、検証エラーは dialog 内の role=alert。Esc で閉じる）。一覧は `data-testid="usecase-list"` の listitem で、各 item にボタン「編集」「削除」「アニメーションを作成」「アニメーションを再生」（未作成のあいだ「再生」は無効）。削除に確認があれば alertdialog か dialog 内のボタン（名前に「削除」）。
- 導出の候補（FR-158 AC-289）: 同じ `usecase-editor` 内の `data-testid="usecase-candidates"`（登録済みの `usecase-list` とは別の要素）。候補は listitem で、各 item に表示「導出（未登録）」と、ラベルつきの名称・概要・対象ペルソナ・手順・期待する効果の値。候補は登録するまで保存されず、`usecase-list` の listitem にも数えない。導出元がないときは `usecase-candidates` 内に理由の文言（「導出の元がない」）を出し、listitem は 0 件。登録操作は候補 item 内のボタン「登録」（編集してから登録する場合は「編集して登録」）。登録すると候補は `usecase-candidates` から外れ、`usecase-list` に入る。
- 再生画面（FR-155〜157）: `data-testid="animation-player"`（ワークスペースのコンポーネント）。`data-animation-state="playing|paused|ended"`、`data-motion="running|stopped"`（P・動きを減らす設定で stopped）。`animation-position`（「n / 全体」）、現在のシーン `animation-scene`（見出しは heading）。ボタン「再生」「一時停止」「次へ」「前へ」「終了」。キー: `P`（動きの停止/再開）・`←`/`→`（前後）・`Esc`（終了）。動きを減らす設定のときは全シーンの見出し・説明が player 内に文字として表示される。
- 音声: `t.audio.isAudible()`（既存フック）。
