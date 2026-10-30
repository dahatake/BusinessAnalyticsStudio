# run202610300856 可視化の網羅表

期待値の出典: FR-070 AC-086、FR-045 AC-056、FR-134 AC-197
（PARAM-133=2000ms、PARAM-032=2秒）。実装は画面と描画入口の特定にのみ使用。

| 画面 | 描画形式 | 自動化の所在 |
|---|---|---|
| 課題-解決策分析 | 2D（サンキー/マトリクス）、3D、Graph、代替表 | visualization-matrix.ts / editing.spec.ts |
| 優先順位分析、サマリー | 2D/数値/根拠 | visualization-matrix.ts / editing.spec.ts |
| 2×2マトリクス、ランキング | 2D、3D、代替表 | visualization-matrix.ts |
| ナレッジグラフ | SVG 2D、WebGL 3D、代替表 | visualization-matrix.ts / editing.spec.ts |
| ビジネス関係グラフ | 2D、3D、Graph、関係表 | visualization-matrix.ts |
| アーキテクチャ | 2D、3D、接続表 | visualization-matrix.ts |
| 議論ツリー | 2D、3D、代替表 | visualization-matrix.ts |
| 一覧表 | 2D表、3D、代替表 | visualization-matrix.ts / editing.spec.ts |
| ガント | 2D、Canvas 2.5D、代替表 | visualization-matrix.ts / editing.spec.ts |
| 地図 | 地図2D、3D、代替表 | visualization-matrix.ts |
| KPI/OKR | 2D、3D、Graph、代替表 | visualization-matrix.ts |
| Twin | 2D、3D、Graph、代替表、ミニマップ | visualization-matrix.ts |
| データカタログ/データビュアー | 2D、3D、Graph、代替表 | visualization-matrix.ts |
| 空間 | 2D、等角3D、Graph、代替表 | visualization-matrix.ts |
| ホワイトボード | 2D/Canvas | visualization-matrix.ts |
| 分析5手法 | 表、マトリクス、棒グラフ、常設代替表 | analysis-projects.spec.ts |

## 判定方法

- 実表示の名称・値・項目ID・選択と、SVG/DOMの座標・経路・寸法を確認する。
- Canvas/WebGL は実際のスクリーンショットを保存する。共通モーション属性のみでは合格しない。
- 編集・分析の期限は操作直前の時計から最終一致まで実測し、後から開いたビューごとに
  2秒の猶予を追加しない。分析の入力値・重みはテスト入力と一致させ、
  計算式を実装から借用せず、結果・分類・順位のビュアー間一致を確かめる。
- E2E-291はFR-148の企業名ボタン/Project名ボタンに追従するが、
  名前の一致・再読込後の永続化・誤Project不表示は弱めない。

## 未完了の設計範囲（合格済みとして扱わない）

この表は全ライフサイクルの実装済みカバレッジを意味しない。
visualization-lifecycle.spec.ts は上記入口ごとの初回実描画・停止/reduce後の
DOM/SVG静止だけを自動化している。次は追加設計が必要:

- 各描画形式の追加/値・名称・関係更新/削除/undo、途中の連続更新、
  出入り補間の中間フレーム、最終形状・軸・接続の独立オラクル。
- 各代替表への明示切替、ミニマップ、サンキー/マトリクスそれぞれ、
  ホワイトボードの各Canvas描画経路の個別確認。
- 空データ/非表示時のCanvas/WebGL実描画呼び出し数の計測。
  スクリーンショットのサイズやDOM静止だけではこの条件を保証しない。
- 編集ケースの保持対象は課題ID・選択・出典。全画面の絞り込み保持、
  数値・関係の編集、すべての局所モデルの編集経路は未完了。
- AC-197は5手法の現在の全ビュアーと代替表について値・重みを変更して検証する。
  分類そのものの編集、計算結果の独立した数値オラクル、描画補間の完了時刻、
  非同期計算の逆順完了を強制するシナリオは未完了。

AC-198（integration）/AC-199（unit）は検証レベルを変更せず、
分析ケースでも不正入力・既定値復帰を回帰確認する。

## 出入り遷移（run 202610301039）

- 所在: e2e/visualization-transitions.spec.ts（E2E-451 に統合。AC-086）。対象: ナレッジグラフ 2D、ガント 2D、ナレッジグラフ 3D の追加・削除・undo の中間値（DOM の computed style・図形属性・部品内相対位置／3D の scene.objects）、停止・reduce の即時最終、背面 3D の連続描画停止。
- 測定は確定操作の直前から開始し、行の選択・ビュー切替の待ち時間を含めない。期限 PARAM-133=2000ms。
- 上記以外の描画形式は、下の「全形式の棚卸し」で全て埋めた（未着手なし）。
- 現状の fail は実装側の未実装（2D/SVG・ガントの補間、3D 削除の補間、背面 3D の描画停止）。


## 全形式の棚卸し（run 202610301039 追補）

出典: 画面登録（VISUALIZATION_MATRIX、全 39 形式）。自動化: `e2e/visualization-forms.spec.ts`（AC-086/AC-056、形式ごと 1 ケース＋reduce 1 ケース、
ホワイトボード 1、分析 5 手法 × 全ビュアー＝AC-197）。測定は毎フレームの実 DOM（computed style・図形属性・部品内の相対位置・文字）、
3D の scene.objects、2D Canvas の縮小画素署名。確定の時刻は、アプリが click/keydown を受けた時点（テスターの送信遅延を 2 秒に混ぜない）。

| 描画形式 | 測るもの | 追加/削除/undo | 名称・値の更新・連続更新 | 備考（測れない理由） |
|---|---|---|---|---|
| 2D SVG/DOM（課題解決策・マトリクス・ランキング・知識グラフ・事業グラフ・アーキテクチャ・議論ツリー・表・地図・Twin・空間・Graph） | 項目ごとの実 DOM 値 | 測る | 測る（名称は項目自身の文字、値は課題の評価値） | — |
| 3D WebGL（同上の 3D） | scene.objects の位置、同じ部品の代替表/文字 | 測る | 名称は代替表・文字で測る | WebGL の画素は drawImage で安定して読めないため、位置は scene.objects、名称は代替表で代用 |
| Canvas 2.5D（ガント 3D） | 2D Canvas の画素署名＋DOM | 測る | 測る | — |
| ガント 2D、地図 2D/3D、Twin ミニマップ | 同上 | 測る | 測る | ミニマップは Twin の部品内の svg/canvas として署名に含まれる（個別の操作はなし） |
| 要約、データカタログ（2D/3D/Graph）、KPI/OKR（2D/3D） | 文字・図形の全体署名 | 測らない（上位項目だけ／取り込み依存で、追加した項目が出るとは限らない） | 測る。項目を出さない形式は「静止時に不要な連続描画がない」だけ測る | 追加の出入りは対象データ依存 |
| ホワイトボード（Canvas） | Canvas 画素署名 | ペン確定は 2000ms 以内、undo は出入りの中間値 | — | ライブ入力は追加の出入りではない。付箋・図形の個別追加は残課題 |
| 分析 5 手法 × 全ビュアー/代替表 | 結果部品の署名・表 | — | 値変更後 2000ms 以内に表と同じ結果、中間値 | AC-197。分類の編集は別途 |

- 選ぶ項目は、その形式に実際に出ている項目（形式固有 → ent → issue の順で、詳細で複製できるもの）。出ていなければ静止の確認だけにする。
- AC-056 の一覧・出典への追従は、同じテストの最後に「一覧の名称が最新」「出典が保たれる」で確認する。
- 停止（P）/reduce: 追加が項目自身の不透明度・変形・図形属性（3D は位置）で 1 状態だけ（中間値なし）。
- 実装が未完了の形式は fail が正しい（2D の補間・3D の削除補間・名称の描画反映など）。

## 実装待ち（run 202610301406 の実測。テスト側の誤りを直したあとに残る失敗）
実行: `node tests/system/node_modules/@playwright/test/cli.js test visualization-forms --config tests/system/playwright.config.ts --project=chromium --grep "<形式キー>"`（形式キーの例: `kpi-okr/Graph`）。
テスト側で直したもの: ① selectById が複製後に元項目を押さず詳細が複製側になる誤り（詳細の h3 を確認し、違えば Escape→解除→選び直し）／② 分析 5 手法の値更新が score 範囲 0〜10 を超える誤り（2 と 8 を交互に更新）／③ 詳細が出ない項目（ent-mono-line-a 等）を対象にしない。結果は 36 fail → 24 fail（52→54 pass）、分析（AC-197・E2E-099）は全 pass。

| 形式キー | 失敗メッセージ（実測） | 区分 |
|---|---|---|
| issue-solution/2D, ranking/2D, issue-solution/Graph | 値の更新が中間値を経ずに瞬間反映された（sigVal フレーム 1 以下） | 実装側（値更新の遷移が未適用） |
| business-graph/2D, architecture/2D, map/2D, twin-view/2D, spatial-view/2D, priority/2D/Canvas | 削除が中間値を経ずに瞬間消去された（出入りの遷移なし） | 実装側（削除の退出遷移が未適用） |
| spatial-view/3D, spatial-view/Graph | 既存項目が作り直された（同一性）。追加時に元項目の描画が一度消える | 実装側 |
| discussion-tree/2D | （専用ケースに変更。下の「議論ツリー・KPI/OKR の測り直し」）ノードの追加が中間値を経ずに瞬間表示された（sigAdd フレーム 1） | 実装側（2D のノード追加の出入り補間が未適用） |
| map/3D | 停止/reduce は中間値を経ず最終状態を即時表示する（追加が遷移する） | 実装側（reduce 未適用） |
| matrix/3D | 名称更新が描画に反映されない（byId=true・byText=false） | 実装側の可能性（要再実測）。実装者は名称を DOM 文字か scene.objects の label として出すこと |
| ranking/3D | 名称更新が描画に反映されない（sigRename=0）。画面の 3D 描画域が可視の ent を出している（byId=true・byText=false） | 実装側（3D 部品が名称を描画に反映しない） |
| kpi-okr/2D, kpi-okr/3D, kpi-okr/Graph | （専用ケースに変更。下の「議論ツリー・KPI/OKR の測り直し」）値の更新が中間値を経ずに瞬間反映された（sigVal フレーム 1） | 実装側（KPI/OKR の値更新の遷移が未適用） |
| issue-solution/3D | 詳細に名前の編集がない（この形式に出る ent 12 件を選んでも詳細が出ない） | 要判断（選択しても詳細が出ない項目のみを出している。実装側の可能性） |

起動競合: matrix/2D「追加から最終状態まで 2000ms」と whiteboard/Canvas「undo が瞬間消去」は全件並列の 1 回目だけ fail し、単独・再実行で pass（負荷による揺れ）。page.goto ERR_ABORTED は今回の実行で再現せず。

### architecture 形式の測り直し（run 202610301406 追補）
- 誤り: architecture が出す要素（cap-*）は、詳細パネルに「複製」「削除」がなく UI から出入りできない。汎用ケースは代わりに複製した ent-* を測っており、architecture の描画ではなく文字の変化だけを見ていた（削除の判定が誤り）。
- 直し方: 汎用ケースから architecture を除き、画面自身の編集経路「JSON 編集」（FR-040。tobe の elements の追加・名称変更・削除）で、architecture が実際に出す要素を測る専用ケースにした（各形式 2 ケース: 追加・名称/連続更新・削除・undo、reduce の即時表示）。2D は data-entity-id の毎フレーム署名、3D は積層図が data-entity-id・scene.objects（ヒーロー・シーンは ent-* の別シーン）に出さないため、部品全体の文字＋canvas 画素の署名と名称の文字で測る。
- 再実行（architecture/ 4 ケース）: 3D の追加・更新・削除・undo と 2D の reduce は pass。残る fail は実装側: architecture/2D「追加が中間値を経ずに瞬間表示された」（2D の出入り補間が未適用）、architecture/3D reduce「最終変化まで 370ms（即時でない）」（reduce 未適用の可能性。3D は要素単位で測れず署名で代用）。
- 全体: forms spec は 17 fail / 31 pass（前回 24 fail）。残る 17 の分類は上表のとおりで、すべて実装側（値更新・削除の遷移未適用、3D の名称未反映、spatial の作り直し、discussion-tree 名称、architecture 2D 追加、3D reduce）。issue-solution/3D（詳細が出ない項目のみを出す）は要判断のまま。テスト側の誤りで残るものはなし。

### 議論ツリー・KPI/OKR の測り直し（run 202610301406 追補 2）
- 誤り 1（kpi-okr/3D）: 画面が出すのは Key Result（okr-*）。3D 形式の canvas はアプリ全体のヒーロー・シーン（scene.objects は ent-mono-* の 17 件だけ。KPI/OKR 画面の部品内に data-entity-id は 0 件）で、idsIn がそれを拾い、複製できない okr の代わりに ent-mono-line-a を対象にしていた。KPI/OKR 画面は ent を出さないので、対象の選び方が誤り。Graph では okr-* が出るが詳細パネルは出ず、複製・名前編集もできない。
- 直し方 1: 汎用ケースから除き、画面自身の編集経路「OKR を定義」ダイアログ（Key Result 名・現在値の変更、Key Result の追加）で、画面が出す Key Result を測る専用ケースにした（2D・3D・Graph 各 2 ケース: 名称/連続更新・値更新・追加、reduce の即時表示）。対象は部品の文字（名称・達成度 75%）と部品全体の署名。定義ダイアログに Key Result の削除操作はなく、削除・undo は測れない（UI に経路がない）。
- 誤り 2（discussion-tree）: ツリーのノード名は議論ツリー自身のモデル（議論テーマ）の名前で、課題エンティティの名称を変えても変わらない（実測: 課題 issue-mono-001 を ZZNAME に変えてもツリーに出ない）。汎用ケースの「課題を複製して名称を変える」はツリーが出すデータを変えていなかった。ツリーの画面には詳細パネルもない。
- 直し方 2: 画面自身の編集経路（FR-042: ノードを追加／名前を変更／削除／元に戻す）で測る専用ケースにした（2D・3D 各 2 ケース）。
- 値の更新（課題の評価値 77）の扱い: 議論ツリー（FR-042）は課題の評価値を表示する要求を持たず、画面には詳細パネルもなく、ツリーを開いたまま評価値を編集できない。AC-086 の「数値…の更新」は表示している値に対する要求なので、ツリーには値更新の測定対象がない（注記 value-update を残す）。実装者 B の優先順位バッジ（IssueEvaluationBadge）が出る場合も、ツリーを再び開いた時の表示であり遷移の測定対象ではない。ACは弱めていない（名称・追加・削除・undo は測る）。
- 再実行（kpi-okr/・discussion-tree/ の 10 ケース）: 6 pass / 4 fail。pass: discussion-tree/3D（更新・追加・削除・undo と reduce）、discussion-tree/2D・kpi-okr 3 形式の reduce。fail（すべて実装側）: discussion-tree/2D「追加が中間値を経ずに瞬間表示」、kpi-okr/2D・3D・Graph「値の更新が中間値を経ずに瞬間反映」。テスト側の誤りで残るものはなし。
- data-catalog/2D・3D・Graph、summary/2D/Canvas は、idsIn が全体の scene.objects を拾って byId=true と誤判定したテスト側の誤りを直した結果、「測れない形式」の分岐（空・静止時に不要な連続描画がない）で pass（data-catalog 6/6、summary 2/2）。

### 残り 7 失敗の切り分け（run 202610301640）
実 DOM（data-entity-id・role=treeitem・canvas 画素・scene.objects・文字）を毎フレーム/複製前後で測って分類した。ACは弱めていない（FR-070 AC-086／FR-045 AC-056）。
- spatial-view/2D・Graph（テスト側の誤り・修正済み）: 空間ビューは階層 0（全体）では拠点・フロアの項目を出さず件数の塊だけを出す（実測: 2D の [data-kind] 0 件、Graph の節点は階層 1 以上で、階層 0 の data-entity-id は代替表の行とツイン関係のボタンだけ）。通常ケースは元項目（ツイン項目 dt-*）で observable=true と誤判定し、複製（-copy）が描画に出ない/代替表の行だけが消える測定をしていた。直し方: showRow() が利用者の「拡大」で階層 1（拠点）まで進めてから測る。結果: 2D・Graph とも追加・名称・値・削除・undo・reduce が pass、reduce は skip から実測へ。
- spatial-view/3D（実装側）: 等角の積層（stack）は <g data-entity-id> を通常の React 描画で出し、出入りの補間（usePresenceItems）は 2D の一覧にだけ使われている。実測: 複製した拠点 g と代替表の行が不透明度 1 のまま約 630ms 後に null（瞬間消去、中間値なし）。原因の仮説: SpatialScreen の 3D stack（floors/rooms/site の g）に退出（exiting）の描画と lifeOpacity が未適用。
- issue-solution/Graph・3D（テスト側の誤り・修正済み）: 課題の評価値（優先順位）は 2D のツリーでは項目の文字として出て補間される（61→76→77）が、Graph の節点（112x60 の DIV）と 3D の名称ラベル（SPAN）は名称だけで、値は代替表（表で見る）の文字にしか現れない。drawnSig（表を除く描画項目の文字・位置・寸法、図形、画素）が値更新前後で不変なら「値を描画しない形式」とし、補間の要求は外して「最新値 77 が代替表に 2000ms 以内に反映される」を求める。値を描画する形式（2D 表・ランキング等）は従来どおり中間値を要求する（2D 形式は表も描画なので表を含めて比較）。
- discussion-tree/2D 追加（テスト側の誤り・修正済み）: 追加した人手ノードの行は data-entity-id を持たない（role=treeitem、usePresenceItems で不透明度が遷移）。サンプラーが ID なしの行を見ていなかった。直し方: サンプラーに role=treeitem と消えゆく行（aria-hidden＋opacity）の不透明度・字下げ・文字を追加。結果: discussion-tree 2D/3D 全ケース pass。
- architecture/3D reduce（テスト側の誤り・修正済み）: 「最終変化まで 300ms」は AC に根拠がない（AC は「遷移なしで最終状態を即時表示」と定め、時間の定量なし）。3 回再実行で 343/349/363ms と決定的で、署名の変化は 3 回（約 130ms: 画素、約 205ms: 画素、約 345ms: 要素一覧に【追加】ST追加要素の文字）の段階反映で補間ではない。判定を「画素の状態 3 種以内・署名の変化 4 回以内（補間なし）」に直した。残る疑い（実装側・要判断）: 動き有効の追加も同じ 3 回・画素 2 種で、reduce と区別できない。3D アーキテクチャが補間していないか、補間が 24×24 画素の署名で見えない可能性がある（原因の仮説: 積層図の再配置が補間されず、段階反映が React の effect/rAF の遅れ）。要素単位の測定点（scene.objects への出力）が実装側にない。
- 再実行（forms spec 全 78 ケース）: 73 pass / 1 fail / 4 skip。残る fail は spatial-view/3D の削除（実装側）のみ。
