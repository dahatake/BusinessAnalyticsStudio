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
