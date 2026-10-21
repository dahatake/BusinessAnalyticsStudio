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
- 作業先: 常に表示する `data-testid="work-target"`（「デモ」または「企業名 / Project 名」）。ボタン「作業先」で dialog「作業先の選択」を開く。候補は option（「デモ」「<企業名> … <Project 名>」「実際の Project を登録」）。起動直後はメイン画面（§15）で、選択画面は「Project を開く」で必ず出る（FR-144 AC-237・AC-239、Q-026 で改訂）。support/fixtures.ts の `skipOpening` は、メイン画面と選択画面を進めてデモ（なければ最初の Project）を選ぶ。選択画面そのものを確かめるテストは `skipOpening: false` で起動し `pressOpeningEscape`（オープニングだけ飛ばす）を使う。
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

## 12. 自由配置・拡大表示・ストーリー（FR-173〜180。workspace-free-layout.spec.ts・story.spec.ts が前提にする画面の探し方）
- 自由配置・拡大（FR-173〜175）: 移動は見出し（heading）のドラッグ。置いた位置は再読込後も維持され、`workspace` の外へ出ない。重なったときは、ぶつかられたものが押し出されて重ならない（§15。Q-025 で改訂。「手前に出す」は廃止）。ダブルクリックで拡大中のコンポーネントは `data-expanded="true"`（最大化は `data-maximized="true"` で別。拡大では付かない）。拡大の寸法は `workspace` の境界に対する割合（PARAM-058=75%）。
- 設定（FR-175）: 設定画面（`nav-settings`）の radiogroup「拡大表示の位置」に radio「上」「左」「右」「下」（既定: 上）。
- 作業先メニュー（FR-176）: `work-target-menu` とボタン「企業を登録」が最上段（ほかの `nav-*`・ペルソナ・編集モード・`stepper` より上端が上か同じ）。
- ストーリー（FR-177〜179）: ボタン「プレゼンテーションを開始」→ dialog「ペルソナの選択」（button 経営層・事業部門・IT・現場。Esc で閉じるとストーリーは始まらない）→ `data-testid="story"`。現在のシーン `story-scene`（見出し heading は 1 つ。`data-story-part`=1〜4（①解決策②理由③KPI/OKR④ユースケース）、①は `data-solution-id`、不足データのシーンは `data-no-data="true"` で本文に「データなし」・理由・補う入口）。`story-position`（「n / 全体」）。`→`/`←`/`Esc` で操作。
- ユースケース一覧（FR-180）: ステッパーの「ユースケース作成」→ `usecase-list` の listitem に `data-persona`（経営層・事業部門・IT・現場）、子に `usecase-name`・`usecase-summary`・`usecase-steps`・`usecase-effect`・`usecase-solution`・`usecase-kpi`。
- 優先順位（FR-177 の期待値の元）: `priority` 画面内の `data-entity-id`（`sol-` で始まる解決策 ID）の出現順。
## 15. メイン画面・ハンドル・押し出し・アニメーション（FR-183〜187。Q-025・Q-026 の改訂を含む。main-screen.spec.ts・workspace-handle.spec.ts・workspace-layout.spec.ts・workspace-free-layout.spec.ts が前提にする画面の探し方）
- 起動（FR-186・FR-144 AC-398。改訂）: オープニングの後、最初に `data-testid="main-screen"`（メイン画面）が出る。作業先の選択画面（dialog「作業先の選択」）は起動直後には出ない。`support/fixtures.ts` の `skipOpening` は、メイン画面が出ていれば main-screen 内のボタン「Project を開く」を押して選択画面へ進み、デモ（なければ最初の Project）を選ぶ。選択画面は Esc で閉じられ、閉じるとメイン画面に戻る（作業先が未定のまま `workspace` には入らない）。メイン画面から Project を開く（ボタン「Project を開く」）たびに、実 Project の件数によらず選択画面が必ず出る。
- メイン画面の中身: 案内 `data-testid="main-guide"`（listitem が 4 つ: 企業を登録・Project を作成・Project を開く・分析を開始、この順）と、各手順の button（名前は手順名と同じ）。企業は region「企業 <企業名>」（§8 と同じ。その中のボタン「Project を作成」）。メイン画面には `workspace`・`nav-*`・`component-*`・`work-target-menu` は出ない。企業・Project が 0 件で「分析を開始」を押しても分析画面へは進まず、role=alert か案内で示す。
- メイン画面へ戻る（FR-187）: 分析画面（Project を開いたとき）の上部に button「メイン画面へ戻る」。上端は `work-target-menu`・ボタン「企業を登録」より上にならない。メイン画面には出ない。
- ハンドル（FR-183）: すべてのコンポーネントの上部に `data-testid="panel-handle"`（コンポーネントの内側）。その内側に掴みの印 `data-testid="panel-handle-grip"`。本体は `data-testid="panel-body"`。ハンドルの背景色は本体の背景色と異なる（ハイコントラストを除く）。ドラッグ移動・ダブルクリック拡大（`data-expanded`）はハンドルで行い、本体では行わない。ドラッグなしの移動は §4 の `component-menu` のメニュー項目（名前に「移動」を含む）。
- 押し出し（FR-184）: コンポーネントを別のコンポーネントの位置へドロップしたとき、ぶつかられたものが重ならない位置へ移り、すべての `component-*`（最上位）の `boundingBox` が互いに重ならない（許容 4px²）。FR-173 の「重なる位置に置け、手前に出る」は廃止。
- アニメーション（FR-185）: 移動・リサイズ中に requestAnimationFrame ごとに `boundingBox` を記録し、位置・大きさが変わったフレーム数 ÷ 経過秒 ≥ 30（PARAM-065）。ドロップの前後で位置の飛び ≤ 24px。リサイズは §4 の `separator`（role）をドラッグする。

## 12. データカタログ（FR-159〜162・NFR-UX-011。data-catalog.spec.ts が前提にする画面の探し方）
- 画面: component key `data-catalog`（`nav-data-catalog`、`component-data-catalog`）。ユースケース一覧 `usecase-list` の各 listitem に `data-usecase-name`。
- 一覧・詳細（FR-159）: `entity-list` の listitem（`data-entity-name`・`data-entity-description`。表示と同じ値）。行を選ぶと `entity-detail` にラベル「名称」「説明」「導出元」「関連するユースケース」と値。0 件のときは `entity-list-empty-reason` に理由（「導出の元がない」または「顧客パックがない」）。
- 対応表（FR-160）: `entity-usecase-matrix`。セルは `data-kind="derived|explicit|none"`・`data-entity-name`・`data-usecase-name`。derived は文字「導出」、explicit は「明示」。none のセルに button「紐づけを追加」（名前は部分一致）、explicit のセルに button「削除」。derived には削除の操作がない。ユースケースが 0 件のとき `matrix-empty-reason` に理由（「ユースケース」を含む）。
- 取り込みと突合（FR-161）: file input（label「企業データカタログのファイル」）。突合は `reconcile-table` の `tr[data-entity-name][data-category="一致|差異|BASのみ|カタログのみ"]`（区分は行内にも文字で表示）。拒否は role=alert に原因（JSON・形式・読み込めない等）。
- ToDo 追加（FR-162）: button「未掲載を ToDo に追加」。結果と件数は `todo-add-result`（追加件数の数字。追加できないときは理由）。フック `t.plan.tasks()` は Project の plan の tasks を `{ id, title, description }[]` で返す。

## 13. ストーリーボード・スタイル・音声読み上げ（FR-163〜167。storyboard.spec.ts が前提にする画面の探し方）
- 作成（FR-163）: ユースケース一覧の各 item にボタン「ストーリーボードを作成」「ストーリーボードを編集」「ストーリーボードを再生」（未作成のあいだ再生は無効）。手順 0 件の作成は role=alert（文言に「手順を 1 つ以上追加する」）で拒否。編集は `data-testid="storyboard-scenes"` の listitem（シーン n）に textbox「シーン n の見出し」「シーン n の字幕」「シーン n の強調テロップ」とボタン「保存」。対象ペルソナが scenes 内に文字で出る。Esc で閉じる。
- 再生（FR-164）: `data-testid="storyboard-player"`。`data-storyboard-state="playing|paused|ended"`、`data-motion="running|stopped"`、`storyboard-position`（「n / 全体」）。ボタン「再生」「一時停止」。キー: `P`・`←`/`→`・`Esc`。再生開始で `document.fullscreenElement` が設定される。全画面にできないときは `storyboard-fullscreen-fallback`（旨の表示）で画面全体を覆う。再生開始から ended まで実時間 25〜35 秒（手順 3 件・6 件とも）。
- 演出強度（AC-320）: 再生中の `storyboard-player` 内の `data-testid="storyboard-intensity"` に現在の演出強度名（Executive / Showcase / Entertainment）を文字で表示する。再生の既定は Entertainment。
- 字幕・テロップ（FR-165）: 現在のシーンの `storyboard-caption`（字幕。不透明な背景色を自身に持つ）・`storyboard-telop`（強調テロップ。最初のシーン冒頭。20 文字以内）・その中の強調語 `storyboard-emphasis`。
- スタイル（FR-166）: ユースケース作成画面の radiogroup「スタイル」に radio 5 つ（3D・アニメ・Geometric 3D・Isometric 3D・Whimsical 3D。既定 Isometric 3D）。再生中の `storyboard-style-name` に現在名。WebGL なしでは `storyboard-style-notice`（「2D」を含む理由）。保存先は端末内。
- 音声（FR-167）: `runtime-config.json` の `speech: { endpoint, key }`（モック。テストは endpoint を `page.route` で受ける。実際の Azure は呼ばない）。設定画面（`nav-settings`）に region「音声設定」: `speech-status`（「設定済み」/「未設定」）、switch「字幕の読み上げ」、未設定で有効にすると role=alert。再生中: 送信中は `speech-sending-notice`、失敗・未設定・タイムアウト・オフラインは `speech-error`（原因と直し方）で、再生は字幕だけで最後まで進む。ミュート（button「ミュート」, aria-pressed。既定 true）のままでは要求を送らない。送信本文に字幕の文言を含む。

## 14. データビュアー（FR-169。data-viewer.spec.ts が前提にする画面の探し方）
- データカタログ画面（`openScreen(page,'data-catalog')`）の `data-testid="data-viewer"`。`data-view-mode="2d|3d"`、`data-detail-level="bird|entity|column"`（表示している詳細度。文字でも表示）。radiogroup「表示モード」の radio「2D」「3D」。ボタン「拡大」「縮小」「全体表示に戻す」。
- 列の詳細度では、各エンティティ要素 `[data-viewer-entity="<名称>"]` の中に `[data-viewer-column]`（列名の文字）が出る。選択中は `aria-selected="true"`。
- 列を含む企業データカタログは、`entities[].columns: [{name,type}]` の JSON（FR-172）で取り込む（file input は §12 と同じ）。

## 20. Project の外部連携選択（FR-201 AC-440。project-integrations.spec.ts が前提にする画面の探し方）
- Project 画面（stepper が見える）に region「外部連携」。外部連携カタログの各連携が checkbox（aria-label は連携の名称。状態が「廃止」のものは disabled）。button「連携の選択を保存」で保存（端末内。開き直しても残る）。保存しない選択は残らない。
- 入口: メイン画面の Project 名のリンク（role=link、名前は Project 名）をクリックすると、その Project 画面（stepper が見える）が開く。ブラウザーの戻る（history back）でメイン画面に戻る。

## 21. Fluent 2 の全画面適用・ピン止め・ビュー切替（NFR-UX-015〜017・NFR-A11Y-009・FR-215〜218。fluent-design.spec.ts・a11y-all-screens.spec.ts・pin.spec.ts・view-switch.spec.ts が前提にする画面の探し方）
- 全画面（画面の登録）: 左メニュー navigation「画面」の `nav-<key>`（`nav-toggle` を除く）を表示の順に走査し、左メニューに項目を持たない画面（FR-220 AC-590: `view3d`「3D ビューと 2D 図面」・`drawing2d`「2D 図面」。`support/fixtures.ts` の `OFF_MENU_SCREENS`）を末尾に足す（`support/screens.ts` の `listScreenKeys`）。§4 の主要画面がすべて含まれること。表示幅が狭く左メニューが隠れるときは button「メニュー」から開く。
- 左メニューにない画面の開き方（FR-220 AC-590。AC の期待値は変えない）: `openScreen`・`gotoScreen` は、`OFF_MENU_SCREENS` か `nav-<key>` が無い画面を、コマンドパレット（`Ctrl+K`。dialog「コマンドパレット」）に「show <key>」と入れ、option `id="command-view.show.<key>"`（「<画面名>を表示する」。FR-111）を押して開く（`openScreenByCommand`）。テストは `nav-view3d`・`nav-drawing2d` を使わない。
- カード: Fluent のカードの面に `data-surface="card"`（影の段 4 の判定に使う。ハイコントラストでは 4 辺の境界線か輪郭線の判定に使う。AC-476）。メニューは role=menu、ツールチップは role=tooltip、ダイアログは role=dialog（コマンドパレット）。
- 拡大・縮小できる面（AC-483。A-51）: ビュアー・グラフ・キャンバス・ホワイトボード・地図・3D の、拡大・縮小する描画領域の要素に `data-zoom-surface`（値は `viewer`／`graph`／`canvas`／`whiteboard`／`map`／`3d`）。見出し・ハンドル・ツールバーなど面の外の部品には付けない。この中の文字は文字 200% の切れ・重なりの数え方から除き、表示しきれない文字は省略記号（text-overflow: ellipsis か line-clamp）＋全文のアクセシブルな名前（aria-label・title・aria-labelledby）かツールチップ（role=tooltip）、または面の中のスクロール（overflow: auto/scroll）で読めることを判定する。3D と地図のラベルは NFR-A11Y-003 AC-173 と同じ button「表で見る」の表で読めることを判定する。
- ピン止め（FR-215）: フォーカスしたコンポーネントの `component-actions` に button 1 つ。名前は「ピン止めする」（固定なし）／「ピン止めを外す」（固定中）。`aria-pressed`（false／true）と `data-icon-variant`（`regular`／`filled`）を持ち、ツールチップ（role=tooltip）の文言も名前と同じ。状態は端末内のレイアウトとして保存され、再読込で復元される。
- ビュー（FR-217・FR-218・NFR-UX-018）: `component-actions` に button 1 つ。名前は「ビュー」で始まり、見える文字に現在の表示モード（「2D」か「3D」）と世界の表示（「現実世界」「デジタル世界」「両方」）を含む。押すと role=menu が開き、menuitemradio「2D」「3D」「現実世界」「デジタル世界」「両方」（選べないものは disabled と理由の文字）。Esc で何も変えずに閉じる。
- フック `t.view.state(key)`（§6 に追加）: そのコンポーネントが表示している状態 `{ mode: '2d'|'3d', world: 'real'|'digital'|'both', itemIds: string[], selectedIds: string[], twinLinks: [realId, digitalId][] }`。itemIds は表示中の項目（非表示の世界の項目を含めない）、twinLinks は線か印で表示中のツイン関係。
- 3D の表現を新しく作る 6 画面（FR-217 AC-501。key は `table`・`matrix`・`ranking`・`issue-solution`・`discussion-tree`・`kpi-okr`）: 3D の表示中は、コンポーネントの中に `data-zoom-surface="3d"` の面があり、`t.view.state(key)` の `items3d`（3D の面に描いた項目の ID）が `itemIds` と同じ集合になる。2D のときは `items3d` が空（または未定義）。同じ情報を表・テキストで読める button「表で見る」（NFR-A11Y-003）が 3D の表示中も残る。3D を描画できない環境では「ビュー」のメニューの「3D」が disabled と理由の文字を持つ（AC-500）。
- ピン止めしたコンポーネント（Q-036 B。AC-510）: 画面の見出しの 2D/3D・世界の表示の切替の対象外で、そのコンポーネントの見出しの「ビュー」だけで変わる（統合テストの範囲で、この契約の spec では扱わない）。
- 顧客パックの世界区分（FR-213・FR-214。§3 の項目名）: `entities.json` の `entities[].world`（`"real"`／`"digital"`。ないときは区分なし）と `entities[].kind`（種別）、ツイン関係は `entities.json` の `twins: [{ realId, digitalId, relation, sourceIds }]`。お手本パック（mono・koto）は全エンティティに world を持ち、設備（エンティティの階層の「設備」のレベル）のツイン関係を含む。区分なしの項目は「両方」で文字「区分なし」を示す。
- 選択・絞り込み・時刻: `selection-indicator`（選択中の対象の文字）、一覧表（`component-table`）の textbox「絞り込み」、slider「時間軸」（§15 の AC-185 と同じ）。

## 22. 種別「人」を含むパックのエクスポート前の確認（FR-219 AC-514。export-person-confirm.spec.ts が前提にする画面の探し方）
- 入口: §21 までと同じエクスポートの画面（Ctrl+Shift+E、role=dialog「エクスポート」）の button「エクスポート」。種別「人」（`entities[].kind` が `person`）を 1 件以上含むパック（お手本 mono）では、プレビューの後・出力の前に確認（role=alertdialog か role=dialog）が出る。
- 確認の文字: 「種別「人」」の語、「<件数> 件」、了承の記録の有無（なし: 「了承の記録なし」／あり: 確認日 YYYY-MM-DD か YYYY年M月D日）。個人名・連絡先の値は出さない。
- 操作: button「中止」（またはキャンセル）と button「続行」（出力する）。了承の記録がないときは「続行」がないか disabled。Tab だけで両方へ到達でき、Enter で押せる。確認を開いた直後のフォーカスは確認の中。
- 了承の記録は設定画面（§ FR-181 AC-375 と同じ入力欄・button「了承を保存」）で入力する。中止したときと了承なしのときは、ダウンロード（download イベント）が 0 件。
- 既存のエクスポート系ケース（FR-052・054・055・056・071・094、NFR-ENV-002・NFR-A11Y-002・NFR-UX-004 など）は、手順の冒頭で `recordExportConsent(page)`（support/fixtures.ts）で了承の記録を先に入力し、確認が出たら `captureDownload` / `continuePersonConfirm` が続行まで進める（出力範囲・内容の判定は変えない）。

## 23. 情報の階層に基づく自動配置・階層の分類（FR-243・FR-244 AC-584〜589。autolayout.spec.ts が前提にする画面の探し方）
- 各コンポーネント（component-<key>）に data-tier="primary|supporting|detail"（主役・補助・詳細）。階層は文字か形でも示す（色だけにしない。data-testid="tier-label" に「主役」「補助」「詳細」）。
- 見出しのメニュー（component-menu。右クリックかキーボード）の menuitem「情報の階層」→ data-testid="tier-reason"（階層名と理由の文）。同じメニューで階層を選べる（menuitemradio「主役」「補助」「詳細」）。
- 役割を持たないコンポーネントは data-tier="supporting"。同じ対象を示すコンポーネントは data-group の値が同じ。自動配置は menuitem「自動配置を実行」「自動配置を停止」「自動配置を取り消す」（メニューかコマンドパレット）。

## 23. グラフ・Twin・空間・意味的ズーム・Graph 切替（FR-235〜241。semantic-zoom.spec.ts・graph-twin-b.spec.ts・graph-view-switch.spec.ts が前提にする、3 spec 共通の契約）
- 画面の key（`nav-<key>`・`component-<key>`）: `business-graph`（ビジネス関係グラフ）・`twin-view`（Twin ビュー）・`spatial-view`（空間ビュー）。データビュアーは既存の `data-catalog` の中の `data-testid="data-viewer"`（お手本パックの data-catalog は「Project を開くと…」の空表示で出ない。Project を開き、ユースケースを登録し、列つきの企業データカタログを取り込むと出る＝FR-104・data-viewer.spec.ts と同じ手順。項目 ID は名称キー）。上限では「拡大」は aria-disabled（FR-237）なので、再クリックせず toBeDisabled で確かめる。左メニューの文字は画面名と同じ。
- 表示形式: §21 の「ビュー」メニューに menuitemradio「2D」「3D」「Graph」。フック `t.view.state(key)` の `mode` は `'2d'|'3d'|'graph'`（Graph を持たない画面は `'2d'|'3d'`）。面は `data-zoom-surface="3d"`（3D）・`data-zoom-surface="graph"`（Graph）。3D を描画できない環境では「3D」が disabled で、メニューに理由（「描画できません」「使えません」または WebGL・WebGPU の語）。
- グラフ（FR-236）: ノード `[data-testid="graph-node"][data-entity-id]` は `data-kind`（= `data-node-type`。種別）・`data-shape`（形かアイコンの名前）を持ち、名称と種別名を文字で含む。エッジ `[data-testid="graph-edge"]` は `data-from`・`data-to`・`data-meaning`（意味の種類）・`data-direction="forward"`（矢印）を持ち、意味ラベルの文字を含む（意味ラベルのない関係は線だけ）。絞り込みは group「種別」「意味の種類」内の checkbox（`data-filter-value`）。
- Twin（FR-239）: 流れ `[data-testid="twin-flow"]` は `data-flow-kind="data|control"`・`data-from`・`data-to`・`data-line-style` を持ち、文字「Data」または「Control」と件数を含む。層 `[data-testid="twin-layer-<operations|experience|insights|none>"]`。注記「表示のみ（実機へは送信しません）」「パックの値（リアルタイムではありません）」。
- 空間（FR-240）: 項目 `[data-entity-id]` は `data-kind`（site|floor|room）を持つ。3D のフロアは `data-floor-state="selected|dimmed"`、カメラは `t.scene.camera()` の `projection==='orthographic'`。
- パックの任意項目（FR-241）: `entities[].layer`（operations|experience|insights）、`flows[]`（`id`・`from`・`to`・`kind`=data|control・`label`・`sourceIds`）、空間は `entities[].kind`=floor|room と `parentId` の階層。
- 意味的ズーム（FR-237）: ズームの対象の面（`component-<key>`、データビュアーは `data-viewer`）に `data-zoom-level="overview|element|detail"`。面の中の `[data-testid="zoom-level"]` は `data-depth`（0=全体、最後=詳細。階層の数 D+2 のとき 0..D+1。中間は element で、データビュアーは従来の `data-detail-level="bird|entity|column"` も保つ）。
- 操作: button「拡大」「縮小」「全体表示に戻す」「一つ上の階層へ」（上限・下限・全体では該当の操作が disabled）。塊・ノードのダブルクリック、フォーカス中の Enter で一つ下の階層へ。パンくずは navigation「パンくず」で、現在の階層の項目が `aria-current="location"`（文字は「全体」「要素」「詳細」で始まる）、上位の項目は link か button。
- 全体: 塊 `[data-zoom-cluster="<塊の名前>"]`（文字に「<n> 件」）。要素: ノード `[data-zoom-node][data-entity-id]`（`data-entity-name`・`data-kind`、見える文字に名称と種別。グラフではノードが `graph-node` を兼ねる）。詳細: `data-testid="zoom-detail"` の中に heading「属性」「出典」「関係」と、選んだ項目の `data-entity-id`。
- 選択はフック `t.view.state(key).selectedIds` で読む。一覧表（`table`）で選んだ項目が各画面で選択されている。

## 24. 画面の操作性の刷新（FR-220〜228。ux-refresh.spec.ts が前提にする画面の探し方。run 202610192037）
- 画面の見出し（FR-220 AC-515）: `data-testid="screen-heading"` の中の button「ビュー」（名前は「ビュー」で始まる。§21 のコンポーネントの「ビュー」と同じメニュー）。左メニュー navigation「画面」に 2D/3D の切替の項目（menuitemradio「2D」「3D」・switch・名前が「3D ビュー」だけの項目）を置かない（FR-220 の改訂で、画面「3D ビューと 2D 図面」「2D 図面」の項目は左メニューに置かない＝AC-590。§21 の開き方で開く）。
- 操作アイコン（FR-222 AC-518）: §10 の `component-actions` の button「最小化」「最大化」（最大化中は「通常表示」か「元に戻す」）が見出しの右上に並び、図（svg か img）を持つ。名前はホバー・フォーカスで role=tooltip に出る。最大化中は `data-maximized="true"`、最小化中は `data-minimized="true"`。常設ボタン（「その他の操作」を除く）は 6 個以下（PARAM-073）。
- 設定のモーダル（FR-223 AC-519）: 左メニューの `nav-settings` で role=dialog「設定」（`aria-modal="true"`、button「閉じる」）が開く。背面の覆いは `data-testid="modal-backdrop"`（透明でない背景色）。設定は `component-settings` としてワークスペースに並ばない。
- サイズ変更（FR-224 AC-521）: コンポーネントの縁・角のつまみ `data-testid="resize-e"`（右の縁）・`resize-s`（下の縁）・`resize-se`（右下の角）。ホバーで利用できる。ドラッグで縦だけ・横だけ・両方が変わる。
- 作業先（FR-226 AC-525）: 「[顧客名] - [プロジェクト名]」の見える文字は `work-target-menu`（§10）だけ。`work-target` を残す場合は見える同じ文字を持たず、アクセシブルな名前に作業先を含む。
- 強調（FR-227 AC-526）: 各コンポーネントの項目 `[data-entity-id]` の `data-highlight`（selected・related・dimmed。強調なしは属性なしか空）。選択中は、項目を持つすべてのコンポーネントで、各項目が selected/related か dimmed のどちらか一方になる。解除は Esc か同じ項目の再クリック。
- ステップ（FR-228 AC-528・529）: `stepper` の各 listitem は番号（先頭の数字）か svg/img/`data-step-icon` を持ち、ステップ間に `data-testid="step-flow"`（4 個以上）、現在のステップは `data-step-state="current"` と `aria-current="step"`。ステップの button は高さ・幅とも 44 CSS px 以上。再配置の対象のコンポーネントは `data-step-relevant="true|false"`（そのステップへの関連）、`data-step-rank`（工程の順の整数。小さいほど先）、`data-step-importance="high|normal"`、非表示のものは `data-hidden="true"`（関連しないものは非表示にしない）を持つ。
- 既存の spec への影響（実装工程の注意）: 設定がモーダルになるため、`openScreen(page, 'settings')` と `component(page, 'settings')` を使う既存の spec（brand-settings・consent-settings・workspace-layout など）は、設定画面の探し方を role=dialog「設定」に合わせて見直す必要がある（AC の期待値は変わらない。conductor が競合として扱う）。
- 設定の探し方（FR-223。共通 helper `support/fixtures.ts`。AC の期待値は変えない）: `openScreen(page,'settings')` は `nav-settings` を押して role=dialog「設定」（`settingsDialog(page)`）を開き、その中の `component-settings` を返す（すでに開いていれば押さずに返す）。`component(page,'settings')` も同じ dialog 内の `component-settings`。設定以外の `openScreen` は、開いている設定を先に button「閉じる」で閉じる（背面の覆いが操作を遮るため）。画面を直接操作する前は `closeSettings(page)` で閉じる。音声設定などの region は `settingsDialog(page)` の中で探す。`workspace` の中には `component-settings` が無い。
- 仕様変更後の探し方の追補（FR-222・223・227。AC の期待値は変えない）: (1) `recordExportConsent` は了承の保存後に `closeSettings` で設定のモーダルを閉じる（呼んだ後は背面の画面を直接操作できる）。(2) 設定のモーダルの中でしか見えないもの（背面の primary-action など、モーダルが開いている間の画面の状態）は、`openScreen` で別の画面へ移る前に探す。(3) ワークスペースのコンポーネントの一覧（`keys`・`visibleComponents`・`topKeys`）は `:not([data-testid="component-menu"]):not([data-testid="component-actions"])` で `component-actions` を除く。(4) 全画面の走査（`support/screens.ts` の `listScreenKeys`・`gotoScreen`）は設定のモーダルを先に閉じる。設定は `component-menu`・`component-actions`・「ビュー」を持たないので、メニュー・ツールチップ・ビューの走査では設定を対象から外し、設定は `settingsDialog(page)` の中（文字の段・角丸・影・フォーカスの戻り）で判定する。(5) 選択中の項目の再クリックは選択解除（FR-227）。同じ項目を 2 つの画面で続けて押すテストは、すでに選択済みなら押さない（関連の表示などの状態を見て判定する）。(6) インクのボードのように画面下端に show コントロールバーが重なる面では、固定座標を 200px 程度の範囲に収め 2 列に並べる（ヘッダーの折り返しでボード面が下がっても重ならない）。

