# カタログ

既存の機能・API・テーブル・共通部品の対応表です。1 行 1 項目の短い表にし、詳細はリンク先のファイルに任せます。
機能の表は rd-author（要求 ID・題名・決定状態）と implementer（実装ファイル・テスト・共通部品）が更新します。
未実装の要求は、実装ファイルとテストの欄を「未実装」とします。

## 機能

| 要求 ID | 題名 | 決定状態 | 実装ファイル | テスト | 使っている共通部品 |
|---|---|---|---|---|---|
| FR-001 | 課題の構造化表示 | 承認済み | src/screens/IssueSolutionScreen.tsx, src/analysis/model.ts (buildTreeRows, buildMeceGroups), src/schema/files.ts, examples/mono/public/data/issues.json | tests/unit/issues.test.ts (AC-001), tests/system/e2e/analysis.spec.ts (E2E-001) | デザイン基盤, 画面の登録, 課題-解決策分析 |
| FR-002 | 社内向け・社外向けの区分 | 承認済み | src/screens/IssueSolutionScreen.tsx, src/analysis/model.ts (filterIssues), src/schema/files.ts (AudienceSchema), src/schema/validate.ts | tests/unit/issues.test.ts (AC-002), tests/system/e2e/analysis.spec.ts (E2E-002) | デザイン基盤, 課題-解決策分析, 顧客パックのスキーマと検証 |
| FR-003 | 課題の評価属性 | 承認済み | src/analysis/DetailPanel.tsx, src/analysis/model.ts (evaluationItems), src/schema/files.ts (EvaluationSchema) | tests/unit/issues.test.ts (AC-003), tests/system/e2e/analysis.spec.ts (E2E-003) | 課題-解決策分析, 顧客パックのスキーマと検証 |
| FR-004 | 出典付きの実現手段 | 承認済み | src/analysis/DetailPanel.tsx (SourceCard), src/analysis/model.ts (safeHttpUrl) | tests/unit/issues.test.ts (AC-004), tests/system/e2e/analysis.spec.ts (E2E-004) | 課題-解決策分析 |
| FR-005 | Microsoft 製品と適合理由 | 承認済み | src/analysis/DetailPanel.tsx, src/analysis/model.ts (productFits), src/schema/files.ts (productFits) | tests/unit/issues.test.ts (AC-005), tests/system/e2e/analysis.spec.ts (E2E-005) | 課題-解決策分析, 顧客パックのスキーマと検証 |
| FR-006 | 生成 AI の価値の明示 | 承認済み | src/analysis/DetailPanel.tsx (SolutionDetail), src/analysis/model.ts (GENAI_VALUE_INFO, genAiValueItems), src/schema/files.ts (genAiValues), examples/mono/public/data/issues.json | tests/unit/issues2.test.ts (AC-006), tests/system/e2e/analysis.spec.ts (E2E-006) | 課題-解決策分析, 顧客パックのスキーマと検証 |
| FR-007 | Feature ごとの工程 | 承認済み | src/screens/GanttScreen.tsx, src/plan/model.ts, src/schema/files.ts (tasks の owner・work), examples/mono/public/data/plan.json | tests/unit/issues2.test.ts (AC-007), tests/system/e2e/analysis.spec.ts (E2E-007) | デザイン基盤, 画面の登録, ガント画面, 顧客パックのスキーマと検証 |
| FR-008 | サンプルデータの明示 | 承認済み | src/components/Panel.tsx (サンプル表示), src/data/sample.ts | tests/unit/issues2.test.ts (AC-008), tests/system/e2e/analysis.spec.ts (E2E-008。全主要画面の完成待ちで blocked) | サンプル表示, デザイン基盤 |
| FR-009 | 調査データの出典と確度の確認 | 承認済み | src/components/NumericValue.tsx, src/analysis/model.ts (sourceKindLabel), src/analysis/DetailPanel.tsx | tests/unit/issues2.test.ts (AC-009), tests/system/e2e/analysis.spec.ts (E2E-009。優先順位分析画面の完成待ちで blocked) | 数値の出典表示, 課題-解決策分析 |
| FR-010 | LLM 処理のローカル実行 | 承認済み | scripts/relay/relay.ts, scripts/relay/copilot-adapter.ts, scripts/relay/start.ts, src/ai/client.ts, src/ai/useAi.ts, src/ai/AiStatus.tsx, src/ai/AiSettings.tsx, src/ai/ChatScreen.tsx | tests/unit/relay.test.ts | AI 呼び出し口, Copilot SDK 中継プロセス |
| FR-011 | Copilot SDK 中継プロセスとモック | 承認済み | scripts/relay/relay.ts, scripts/relay/copilot-adapter.ts, scripts/relay/start.ts, src/ai/client.ts, src/ai/useAi.ts, src/ai/AiStatus.tsx, src/ai/AiSettings.tsx, src/ai/ChatScreen.tsx, .env.example | tests/unit/relay.test.ts, tests/system/e2e/analysis.spec.ts (E2E-010), tests/unit/secrets.test.ts | AI 呼び出し口, Copilot SDK 中継プロセス, デザイン基盤 |
| FR-012 | 議題間を移動できるキャンバス | 承認済み | src/screens/canvas/CanvasScreen.tsx, src/workspace/viewport.ts | tests/unit/workspace.test.ts, tests/system/e2e/layout.spec.ts | デザイン基盤, ワークスペース, テスト用フック |
| FR-013 | コンポーネントの最大化・通常表示・非表示 | 承認済み | src/components/Panel.tsx, src/components/panelKeys.ts, src/workspace/PaneContext.tsx, src/workspace/Workspace.tsx | tests/unit/workspace.test.ts, tests/unit/layoutStore.test.ts, tests/system/e2e/layout.spec.ts | デザイン基盤, ワークスペース |
| FR-014 | ドックからの再表示とペルソナ別レイアウトの保存 | 承認済み | src/store/layout.ts, src/workspace/Controls.tsx, src/workspace/layoutModel.ts | tests/unit/workspace.test.ts, tests/unit/layoutStore.test.ts, tests/system/e2e/layout.spec.ts | デザイン基盤, ワークスペース |
| FR-015 | ペルソナ別ビューの切替 | 承認済み | 未実装 | 未実装 | なし |
| FR-016 | プレゼンテーションモード | 承認済み | 未実装 | 未実装 | なし |
| FR-017 | 検索と Copilot 風チャット | 承認済み | 未実装 | 未実装 | なし |
| FR-018 | 中核オブジェクトの選定理由と変更 | 承認済み | 未実装 | 未実装 | なし |
| FR-019 | ビジネス⇔IT のレンズ切替 | 承認済み | 未実装 | 未実装 | なし |
| FR-020 | モノの表現（3D デジタルツインと 2D 図面） | 承認済み | 未実装 | 未実装 | なし |
| FR-021 | コトの表現（3D 地球儀/3D マップと流れの粒子） | 承認済み | 未実装 | 未実装 | なし |
| FR-022 | 工程管理の表現（ガントチャート 2D/2.5D） | 承認済み | 未実装 | 未実装 | なし |
| FR-023 | フライスルー遷移 | 承認済み | 未実装 | 未実装 | なし |
| FR-024 | 共通の選択状態とエンティティ関係グラフ | 承認済み | 未実装 | 未実装 | なし |
| FR-025 | クロスハイライトとカメラ移動 | 承認済み | 未実装 | 未実装 | なし |
| FR-026 | 選択に応じた自動の絞り込み | 承認済み | 未実装 | 未実装 | なし |
| FR-027 | ホバー・クリック・Esc の選択操作 | 承認済み | 未実装 | 未実装 | なし |
| FR-028 | 選択状態の URL への反映と復元 | 承認済み | 未実装 | 未実装 | なし |
| FR-029 | キーボード・スクリーンリーダーでの連動 | 承認済み | 未実装 | 未実装 | なし |
| FR-030 | 階層と LOD のメタデータ | 承認済み | 未実装 | 未実装 | なし |
| FR-031 | カメラ距離に応じた段階的な表示 | 承認済み | 未実装 | 未実装 | なし |
| FR-032 | ヒステリシスによるちらつき防止 | 承認済み | 未実装 | 未実装 | なし |
| FR-033 | パンくずリストとミニマップ | 承認済み | 未実装 | 未実装 | なし |
| FR-034 | アニメーション停止中の階層の切替 | 承認済み | 未実装 | 未実装 | なし |
| FR-035 | 2D の地図・ガント・表での段階的な表示 | 承認済み | 未実装 | 未実装 | なし |
| FR-036 | 表示中の階層だけを描画する負荷対策 | 承認済み | 未実装 | 未実装 | なし |
| FR-037 | ナレッジグラフ（2D/3D） | 承認済み | 未実装 | 未実装 | なし |
| FR-038 | 課題-解決策分析ビュー | 承認済み | src/screens/IssueSolutionScreen.tsx, src/analysis/FlowViews.tsx (SankeyView, MatrixView, SourceLinks), src/analysis/model.ts (buildFlow, buildMatrix, relatedFlowNodes, solutionIssueIds), src/schema/files.ts (causes, effects, issueIds), examples/mono/public/data/issues.json | tests/unit/issues2.test.ts (AC-046), tests/system/e2e/views.spec.ts (E2E-036) | 課題-解決策分析, 顧客パックのスキーマと検証 |
| FR-039 | 優先順位分析と重みの変更 | 承認済み | 未実装 | 未実装 | なし |
| FR-040 | アーキテクチャ図（2D/3D） | 承認済み | 未実装 | 未実装 | なし |
| FR-041 | エグゼクティブサマリー | 承認済み | 未実装 | 未実装 | なし |
| FR-042 | 議論ツリー（系統ツリー）ビュー | 承認済み | 未実装 | 未実装 | なし |
| FR-043 | ミニ・モックアプリ | 承認済み | 未実装 | 未実装 | なし |
| FR-044 | その場でのデータ編集 | 承認済み | 未実装 | 未実装 | なし |
| FR-045 | 編集の全ビューへの即時反映 | 承認済み | 未実装 | 未実装 | なし |
| FR-046 | 入力検証・元に戻す・変更履歴・インポート/エクスポート | 承認済み | 未実装 | 未実装 | なし |
| FR-047 | 編集モードの ON/OFF | 承認済み | 未実装 | 未実装 | なし |
| FR-048 | 議論テーマの選択と管理 | 承認済み | src/screens/ThemesScreen.tsx, src/store/discussion.ts, src/discussion/model.ts, src/discussion/usePackTarget.ts, src/screens/registry.ts | tests/unit/discussion.test.ts, tests/system/e2e/editing.spec.ts (E2E-049) | デザイン基盤, 画面の登録, 議論テーマのストア |
| FR-049 | テーマごとの議論の記録 | 承認済み | src/screens/ThemesScreen.tsx, src/store/discussion.ts, src/discussion/model.ts | tests/unit/discussion.test.ts, tests/system/e2e/editing.spec.ts (E2E-050) | デザイン基盤, 議論テーマのストア |
| FR-050 | 顧客の決定と AI の提案の区別 | 承認済み | src/screens/ThemesScreen.tsx, src/store/discussion.ts, src/discussion/model.ts | tests/unit/discussion.test.ts, tests/system/e2e/editing.spec.ts (E2E-051) | デザイン基盤, 議論テーマのストア, AI 呼び出し口 |
| FR-051 | 議論データの既定ファイル名での保存と復元 | 承認済み | src/discussion/FileActions.tsx, src/discussion/model.ts, src/discussion/memo.ts, src/discussion/restore.ts, src/app/App.tsx | tests/unit/discussion.test.ts, tests/system/e2e/export.spec.ts (E2E-052) | デザイン基盤, 議論メモの書き出しと復元 |
| FR-052 | 常設ボタンとショートカットからの全量エクスポート | 承認済み | 未実装 | 未実装 | なし |
| FR-053 | エクスポートの出力内容 | 承認済み | 未実装 | 未実装 | なし |
| FR-054 | 出力範囲・プレビュー・機密確認・形式の選択 | 承認済み | 未実装 | 未実装 | なし |
| FR-055 | フォローアップ文書の同時生成 | 承認済み | 未実装 | 未実装 | なし |
| FR-056 | エクスポートした Markdown からの復元 | 承認済み | src/discussion/memo.ts, src/discussion/restore.ts, src/discussion/FileActions.tsx | tests/unit/discussion.test.ts, tests/system/e2e/export.spec.ts (E2E-057) | 議論メモの書き出しと復元 |
| FR-057 | 演出の設定の保存と復元 | 承認済み | 未実装 | 未実装 | なし |
| FR-058 | Fluent 2 準拠のテーマ | 承認済み | src/theme/tokens.ts, src/theme/resolve.ts, src/theme/AppThemeProvider.tsx, src/screens/SettingsScreen.tsx | tests/unit/theme.test.ts | デザイン基盤, 画面の登録, 設定ストア |
| FR-059 | ブランドランプの生成と適用 | 承認済み | src/theme/brand.ts, src/theme/brandTheme.ts, src/theme/AppThemeProvider.tsx, src/theme/useBrand.ts | tests/unit/brand.test.ts, tests/system/e2e/brand-settings.spec.ts | デザイン基盤, ブランドテーマ |
| FR-060 | コントラストの自動検証と補正 | 承認済み | src/theme/brand.ts, src/theme/brandTheme.ts, src/screens/SettingsScreen.tsx | tests/unit/brand.test.ts, tests/system/e2e/brand-settings.spec.ts | ブランドテーマ |
| FR-061 | ロゴの利用条件とプレースホルダー | 承認済み | src/components/Brand.tsx, src/app/App.tsx, src/components/AppShell.tsx | tests/unit/brand.test.ts, tests/system/e2e/brand-settings.spec.ts | ブランド表示部品 |
| FR-062 | フォントのフォールバックと等幅数字 | 承認済み | src/theme/brandTheme.ts, src/components/Brand.tsx | tests/unit/brand.test.ts, tests/system/e2e/brand-settings.spec.ts | ブランドテーマ, ブランド表示部品（KpiValue） |
| FR-063 | ブランドトーンの演出への反映 | 承認済み | 未実装 | 未実装 | なし |
| FR-064 | 設定パネルでのブランドの確認と上書き | 承認済み | src/screens/SettingsScreen.tsx, src/store/settings.ts, src/theme/useBrand.ts, schema/brand-profile.json, src/schema/files.ts | tests/unit/brand.test.ts, tests/system/e2e/brand-settings.spec.ts | 設定ストア, ブランドテーマ |
| FR-065 | 3D 描画とフォールバック | 承認済み | src/screens/View3DScreen.tsx, src/three/SceneCanvas.tsx, src/three/presets.ts, src/store/view3d.ts, src/screens/SettingsScreen.tsx | tests/system/e2e/views3d.spec.ts | デザイン基盤, 画面の登録, 3D 基盤 |
| FR-066 | 必須の 3D シーン | 承認済み | src/screens/View3DScreen.tsx, src/three/SceneCanvas.tsx, src/three/presets.ts, src/store/view3d.ts, src/screens/SettingsScreen.tsx | tests/system/e2e/views3d.spec.ts | デザイン基盤, 画面の登録, 3D 基盤 |
| FR-067 | シネマティック表現 | 承認済み | 未実装 | 未実装 | なし |
| FR-068 | 3D アセットの権利 | 承認済み | CREDITS.md, src/three/presets.ts | tests/unit/assets-rights.test.ts | 3D 基盤 |
| FR-069 | 品質プリセットと自動の品質低下 | 承認済み | src/three/quality.ts, src/store/view3d.ts, src/screens/SettingsScreen.tsx | tests/unit/quality.test.ts, tests/system/e2e/views3d.spec.ts | 3D 基盤, 設定ストア |
| FR-070 | Fluent 2 のモーション | 承認済み | 未実装 | 未実装 | なし |
| FR-071 | グローバルのアニメーション停止 | 承認済み | 未実装 | 未実装 | なし |
| FR-072 | 動きを減らす設定での起動 | 承認済み | 未実装 | 未実装 | なし |
| FR-073 | BGM と効果音 | 承認済み | 未実装 | 未実装 | なし |
| FR-074 | ミュートと音量の操作 | 承認済み | 未実装 | 未実装 | なし |
| FR-075 | ナレーション中のダッキング | 承認済み | 未実装 | 未実装 | なし |
| FR-076 | オープニング | 承認済み | 未実装 | 未実装 | なし |
| FR-077 | 番組構成（チャプター） | 承認済み | 未実装 | 未実装 | なし |
| FR-078 | テロップ/ローワーサード | 承認済み | 未実装 | 未実装 | なし |
| FR-079 | Before/After・ランキング・ROI の演出 | 承認済み | 未実装 | 未実装 | なし |
| FR-080 | AI ナビゲーター | 承認済み | 未実装 | 未実装 | なし |
| FR-081 | ショート動画モード | 承認済み | 未実装 | 未実装 | なし |
| FR-082 | AI 成熟度クイズとリアクションボタン | 承認済み | 未実装 | 未実装 | なし |
| FR-083 | 演出強度の切替 | 承認済み | 未実装 | 未実装 | なし |
| FR-084 | ショーコントロールバー | 承認済み | 未実装 | 未実装 | なし |
| FR-085 | ショートカット一覧 | 承認済み | 未実装 | 未実装 | なし |
| FR-086 | 無限キャンバスと複数ボード | 承認済み | 未実装 | 未実装 | なし |
| FR-087 | ペン・タッチ・マウスの統一入力 | 承認済み | 未実装 | 未実装 | なし |
| FR-088 | インクの道具 | 承認済み | 未実装 | 未実装 | なし |
| FR-089 | フリーハンドの図形の整形 | 承認済み | 未実装 | 未実装 | なし |
| FR-090 | 手書き文字の認識と反映 | 承認済み | 未実装 | 未実装 | なし |
| FR-091 | フローティングツールバーとプレゼン中の注釈 | 承認済み | 未実装 | 未実装 | なし |
| FR-092 | PDF 出力 | 承認済み | 未実装 | 未実装 | なし |
| FR-093 | インクの Markdown 出力 | 承認済み | 未実装 | 未実装 | なし |
| FR-094 | Engagement サマリーパック | 承認済み | 未実装 | 未実装 | なし |
| FR-095 | 自動保存・クラッシュからの復旧・大量ストローク | 承認済み | 未実装 | 未実装 | なし |
| FR-096 | エクスポートのプレビューとキーボードだけでの作成 | 承認済み | 未実装 | 未実装 | なし |
| FR-097 | ホワイトボード | 承認済み | 未実装 | 未実装 | なし |
| FR-098 | アプリのデータのカード配置とリンク | 承認済み | 未実装 | 未実装 | なし |
| FR-099 | 付箋のクラスタリング・ドット投票・タイマー | 承認済み | 未実装 | 未実装 | なし |
| FR-100 | 顧客固有情報のコードからの分離 | 承認済み | src/data/loader.ts, src/store/pack.ts, vite.config.ts | tests/unit/foundation.test.ts | 顧客パックの読み込み, 顧客パックのスキーマと検証 |
| FR-101 | 顧客パックの差し替えだけで動くビルド成果物 | 承認済み | src/app/App.tsx, src/app/Opening.tsx, src/data/loader.ts | tests/system/e2e/brand-settings.spec.ts (AC-123) | 顧客パックの読み込み, オープニング |
| FR-102 | 顧客パックの検証と部分的な無効化 | 承認済み | src/schema/partial.ts, src/data/loader.ts, src/store/pack.ts, src/app/App.tsx | tests/unit/partial.test.ts (AC-124), tests/system/e2e/brand-settings.spec.ts | 顧客パックのスキーマと検証, 部分的な無効化 |
| FR-103 | 業種プリセット | 承認済み | src/three/presets.ts, src/three/presetIcons.tsx, src/three/SceneCanvas.tsx, src/screens/SettingsScreen.tsx | tests/unit/template.test.ts (AC-125) | 3D 基盤, 業種プリセット |
| FR-104 | お手本パックでの起動 | 承認済み | src/data/loader.ts, src/app/App.tsx, vite.config.ts | tests/unit/template.test.ts (AC-126), tests/system/e2e/brand-settings.spec.ts (AC-126) | 顧客パックの読み込み |
| FR-105 | オフラインで動く配布パッケージ | 承認済み | package.json, package-lock.json, scripts/make-package.ts, scripts/lib/package.ts, docs/distribution.md, docs/manual-tests.md | tests/unit/template.test.ts (AC-127), docs/manual-tests.md (AC-128) | なし |
| FR-106 | 雛形のバージョン | 承認済み | src/version.ts, src/app/App.tsx, src/screens/SettingsScreen.tsx | tests/unit/template.test.ts (AC-129), tests/system/e2e/brand-settings.spec.ts (AC-129) | 雛形のバージョン |
| FR-107 | セットアップスクリプト | 承認済み | 未実装 | 未実装 | なし |
| FR-108 | セットアップスクリプトの安全性 | 承認済み | 未実装 | 未実装 | なし |
| FR-109 | コンポーネントの移動・大きさの変更・タブ化 | 承認済み | src/workspace/Workspace.tsx, src/workspace/PaneContext.tsx, src/workspace/layoutModel.ts | tests/unit/workspace.test.ts, tests/system/e2e/layout.spec.ts | デザイン基盤, ワークスペース |
| FR-110 | 既定のレイアウトへの復元 | 承認済み | src/workspace/Controls.tsx, src/store/layout.ts | tests/unit/workspace.test.ts, tests/system/e2e/layout.spec.ts | デザイン基盤, ワークスペース |
| FR-111 | コマンドパレット | 承認済み | 未実装 | 未実装 | なし |
| FR-112 | ペルソナ別の既定の情報表現と既定のレイアウト | 承認済み | 未実装 | 未実装 | なし |
| FR-113 | 表現が成り立たないときの代替表示 | 承認済み | 未実装 | 未実装 | なし |
| FR-114 | 一意の ID と ID による参照 | 承認済み | src/schema/validate.ts、src/schema/common.ts | tests/unit/pack.test.ts | 顧客パックのスキーマと検証 |
| FR-115 | 数値・事実の出典 | 承認済み | src/schema/validate.ts, src/schema/files.ts | tests/unit/pack.test.ts (AC-141) | 顧客パックのスキーマと検証 |
| FR-116 | 作成者の種別 | 承認済み | src/schema/common.ts, src/schema/edit.ts | tests/unit/pack.test.ts, tests/unit/partial.test.ts (AC-142) | 顧客パックのスキーマと検証 |
| FR-117 | WorkIQ 由来情報の機密区分 | 承認済み | src/schema/anonymize.ts (anonymizeInternal), src/schema/files.ts (SourcesSchema), src/schema/common.ts | tests/unit/anonymize.test.ts, tests/unit/pack.test.ts (AC-143) | 顧客パックのスキーマと検証 |
| FR-118 | スキーマとお手本データの同梱 | 承認済み | schema/customer.json, schema/brand-profile.json, examples/mono/public/data/customer.json, examples/koto/public/data/customer.json, scripts/gen-schema.ts, scripts/check-pack.ts | tests/unit/foundation.test.ts | 顧客パックのスキーマと検証 |
| FR-119 | 顧客パックのファイル構成 | 承認済み | src/schema/validate.ts (validateLayout) | tests/unit/pack.test.ts (AC-145) | 顧客パックのスキーマと検証 |
| FR-120 | Skill のコマンド | 承認済み | scripts/pipeline/cli.ts, scripts/pipeline/pipeline.ts, scripts/pipeline/common.ts, scripts/pipeline/research.ts, scripts/pipeline/launch.ts, package.json (npm run pipeline)。Skill の定義は envisioning-dashboard フォルダーにある | tests/unit/pipeline.test.ts (AC-146) | 生成パイプライン |
| FR-121 | 事前調査と調査キャッシュ | 承認済み | 未実装 | 未実装 | なし |
| FR-122 | ブランド調査の出典の優先順位と既定テーマ | 承認済み | 未実装 | 未実装 | なし |
| FR-123 | 調査キャッシュの有効期限 | 承認済み | 未実装 | 未実装 | なし |
| FR-124 | 雛形の複製 | 承認済み | scripts/pipeline/clone.ts, scripts/pipeline/timing.ts | tests/unit/pipeline.test.ts (AC-151。リンク・コピー・機密の除外) | 生成パイプライン |
| FR-125 | 顧客パックの生成 | 承認済み | scripts/pipeline/generate.ts, scripts/pipeline/pipeline.ts | tests/unit/pipeline.test.ts (AC-152) | 生成パイプライン, 顧客パックのスキーマと検証 |
| FR-126 | エラー箇所だけの自己修正 | 承認済み | 未実装 | 未実装 | なし |
| FR-127 | verify（顧客パックの受け入れ判定） | 承認済み | 未実装 | 未実装 | なし |
| FR-128 | 起動 | 承認済み | 未実装 | 未実装 | なし |
| FR-129 | 工程ごとの時間計測 | 承認済み | 未実装 | 未実装 | なし |
| FR-130 | 入力変数の指定 | 承認済み | scripts/pipeline/inputs.ts, scripts/pipeline/cli.ts | tests/unit/pipeline.test.ts (AC-158) | 生成パイプライン |
| FR-131 | 雛形への改善要望の記録 | 承認済み | 未実装 | 未実装 | なし |
| FR-132 | AI 実接続の明示的な有効化（Q-001 回答までの暫定） | 承認済み | src/ai/AiSettings.tsx, src/ai/useAi.ts, scripts/relay/relay.ts | tests/unit/relay.test.ts | AI 呼び出し口, Copilot SDK 中継プロセス |
| NFR-PERF-001 | 顧客パックの生成から起動までの時間 | 承認済み | 未実装 | 未実装 | なし |
| NFR-PERF-002 | 4K 表示での描画性能 | 承認済み | src/three/quality.ts, src/three/SceneCanvas.tsx, src/screens/SettingsScreen.tsx | docs/manual-tests.md | 3D 基盤 |
| NFR-PERF-003 | 初回表示の時間 | 承認済み | 未実装 | 未実装 | なし |
| NFR-PERF-004 | インクの描画遅延 | 承認済み | 未実装 | 未実装 | なし |
| NFR-ENV-001 | 対応ブラウザーと端末 | 承認済み | 未実装 | 未実装 | なし |
| NFR-ENV-002 | 外部サーバーなし・オフラインでの動作 | 承認済み | src/data/loader.ts, src/ai/client.ts, vite.config.ts | tests/unit/template.test.ts (AC-167), tests/system/e2e/quality.spec.ts (AC-167) | 顧客パックの読み込み, AI 呼び出し口 |
| NFR-L10N-001 | 日本語の UI | 承認済み | 未実装 | 未実装 | なし |
| NFR-A11Y-001 | WCAG 2.2 AA・キーボード・スクリーンリーダー・字幕 | 承認済み | 未実装 | 未実装 | なし |
| NFR-A11Y-002 | 演出をすべて OFF にしたときの利用 | 承認済み | 未実装 | 未実装 | なし |
| NFR-A11Y-003 | 視覚的な表現の代替 | 承認済み | 未実装 | 未実装 | なし |
| NFR-A11Y-004 | ドラッグ以外の操作手段 | 承認済み | 未実装 | 未実装 | なし |
| NFR-SEC-001 | API キーの管理 | 承認済み | .env.example, tests/unit/secrets.test.ts | tests/unit/secrets.test.ts | なし |
| NFR-SEC-002 | 外部への通信の限定と明示 | 承認済み | src/ai/ChatScreen.tsx, src/ai/AiStatus.tsx, src/ai/client.ts | tests/system/e2e/quality.spec.ts (IT-010) | AI 呼び出し口 |
| NFR-SEC-003 | 調査キャッシュと顧客パックの保護 | 承認済み | 未実装 | 未実装 | なし |
| NFR-LEGAL-001 | 素材の権利と CREDITS | 承認済み | 未実装 | 未実装 | なし |
| NFR-LEGAL-002 | サンプル・AI 生成・モックの明示と商標 | 承認済み | 未実装 | 未実装 | なし |
| NFR-MAINT-001 | 型の厳格さと部品とスキーマの分離 | 承認済み | tsconfig.json, src/schema/index.ts | tests/unit/foundation.test.ts | 顧客パックのスキーマと検証 |
| NFR-MAINT-002 | 雛形の回帰テスト | 承認済み | 未実装 | 未実装 | なし |
| NFR-MAINT-003 | README | 承認済み | 未実装 | 未実装 | なし |
| NFR-UX-001 | レイアウト・表現の切替で状態を失わない | 承認済み | 未実装 | 未実装 | なし |
| NFR-UX-002 | 狭い画面と高い拡大率での縮退 | 承認済み | 未実装 | 未実装 | なし |
| NFR-UX-003 | 時間のかかる処理の進行表示 | 承認済み | 未実装 | 未実装 | なし |
| NFR-UX-004 | エラーの原因と次の行動 | 承認済み | 未実装 | 未実装 | なし |
| NFR-UX-005 | OS と利用者の表示設定への追従 | 承認済み | 未実装 | 未実装 | なし |

## API・イベント

| 名前 | 定義ファイル | 関連する要求 ID |
|---|---|---|
| POST /ask（中継プロセス） | scripts/relay/relay.ts | FR-010, FR-011, FR-132 |
| POST /connection（中継プロセス） | scripts/relay/relay.ts | FR-132 |
| GET /health（中継プロセス） | scripts/relay/relay.ts | FR-011 |

## テーブル

| テーブル名 | 定義ファイル | 正本のシステム | 関連する要求 ID |
|---|---|---|---|
| 議論テーマ（localStorage `edb.discussion`） | src/store/discussion.ts, src/discussion/model.ts | ブラウザー（保存・復元は議論メモの Markdown が正本の写し） | FR-048, FR-049, FR-050, FR-051, FR-056 |

## 共通部品

| 部品名 | ファイル | 用途 | 使っている要求 ID |
|---|---|---|---|
| ブランドテーマ | src/theme/brand.ts, src/theme/brandTheme.ts, src/theme/useBrand.ts | ブランドランプ（16 段階）の生成、コントラストの検証と補正（補正は記録）、Light/Dark のテーマへの適用、フォントの順、Primary 色の上書き | FR-059, FR-060, FR-062, FR-064 |
| ブランド表示部品 | src/components/Brand.tsx | ロゴ（確認済みのみ）とプレースホルダー、「顧客名 × Microsoft」、等幅数字の KpiValue（KPI の数値はこれで表示する） | FR-061, FR-062 |
| デザイン基盤 | src/theme/tokens.ts, src/theme/resolve.ts, src/theme/AppThemeProvider.tsx, src/components/AppShell.tsx, src/components/Panel.tsx, src/components/panelKeys.ts, src/components/StateViews.tsx | Fluent UI v9 のトークン・4px グリッド・Light/Dark/ハイコントラスト、アプリの外枠、読み込み中/0 件/エラーの表示。以降の画面はこれを再利用する | FR-001, FR-002, FR-007, FR-008, FR-011, FR-012, FR-013, FR-014, FR-048, FR-049, FR-050, FR-051, FR-058, FR-059, FR-065, FR-066, FR-109, FR-110 |
| ワークスペース | src/workspace/layoutModel.ts, src/workspace/Workspace.tsx, src/workspace/PaneContext.tsx, src/workspace/Controls.tsx, src/store/layout.ts | レイアウトの木（分割とタブ）、ペルソナ別の保存、最大化/非表示/移動/タブ化、ドック、ペルソナ切替、既定に戻す。画面は Panel で包めば自動で対応する。registry に登録したキーが対象。画面はキーごとの描画先にポータルで描くので、移動・タブ切替でも状態が残る。既定が空なら登録済みの画面を並べる（暫定） | FR-012, FR-013, FR-014, FR-109, FR-110 |
| テスト用フック | src/testing/hook.ts | `?e2e=1` のときだけ window.__edbTest に名前空間ごとのフックを足す（registerTestHook。キャンバスと 3D が共通で使う 1 つの入口） | FR-012 |
| 画面の登録 | src/screens/registry.ts, src/screens/types.ts | 画面を足すときは registry に 1 行足す（nav-key / component-key） | FR-001, FR-007, FR-048, FR-058, FR-065, FR-066 |
| 設定ストア | src/store/settings.ts | Zustand と localStorage の利用者設定（テーマ、ブランドの Primary 色の上書き、3D 品質） | FR-058, FR-064, FR-069 |
| AI 呼び出し口 | src/ai/client.ts, src/ai/useAi.ts, src/ai/AiStatus.tsx, src/ai/AiSettings.tsx, src/ai/ChatScreen.tsx | askAi（5 種類の LLM 処理の唯一の入口。既定はモック、実接続は確認後のみ localhost の中継へ）、常時表示の AI 状態、設定の実接続切替、チャットの土台（FR-017 が拡張） | FR-010, FR-011, FR-050, FR-132, NFR-ENV-002, NFR-SEC-002 |
| Copilot SDK 中継プロセス | scripts/relay/relay.ts, scripts/relay/copilot-adapter.ts, scripts/relay/start.ts | 127.0.0.1 だけで待ち受ける Node.js の中継。`npm run relay` | FR-010, FR-011, FR-132 |
| 顧客パックのスキーマと検証 | src/schema/common.ts, src/schema/files.ts, src/schema/validate.ts, src/schema/anonymize.ts, scripts/lib/pack-fs.ts | zod のスキーマ、ID の一意・参照・出典の検証、internal の匿名化（anonymizeInternal、A-08）。画面の部品を参照しない。schema の JSON は npm run gen:schema で生成 | FR-002, FR-003, FR-005, FR-006, FR-007, FR-038, FR-100, FR-102, FR-114, FR-115, FR-116, FR-117, FR-118, FR-119, FR-125, NFR-MAINT-001 |
| 生成パイプライン | scripts/pipeline/cli.ts, scripts/pipeline/pipeline.ts, scripts/pipeline/common.ts, scripts/pipeline/inputs.ts, scripts/pipeline/research.ts, scripts/pipeline/clone.ts, scripts/pipeline/generate.ts, scripts/pipeline/launch.ts, scripts/pipeline/timing.ts | `npm run pipeline -- <research\|build\|all>`（Skill 定義は .github 配下の envisioning-dashboard の SKILL.md）。工程①〜⑦の実行、入力変数、雛形の複製、顧客パックの生成、`logs/timing.json`。接続点: Researcher（調査）・PackGenerator（生成）・Launcher（起動）は差し替え可能（既定は外部に接続しないサンプル・モック） | FR-120, FR-124, FR-125, FR-130 |
| 顧客パックの読み込み | src/data/loader.ts, src/store/pack.ts | 起動時に data・brand・runtime-config の JSON を読んで検証。`/data/` が空なら dist/example-pack/（vite.config.ts が examples/mono から同梱）のお手本パックで起動（isExample） | FR-100, FR-101, FR-104, NFR-ENV-002 |
| 部分的な無効化 | src/schema/partial.ts | エラーのある項目（と参照する項目）だけを取り除いて起動を続ける。画面とコンソールに出す | FR-102 |
| 議論テーマのストア | src/store/discussion.ts, src/discussion/model.ts, src/discussion/usePackTarget.ts | 議論テーマ・決定ステータス・次のアクションの型と Zustand ストア（顧客パックごとに localStorage `edb.discussion` へ保存。元に戻す・やり直し）。課題から作るには `createFromIssue(packKey, {id,title})`（鍵は `usePackTarget().key`）。課題-解決策分析の「議論テーマにする」はこれを呼ぶ | FR-048, FR-049, FR-050 |
| 議論メモの書き出しと復元 | src/discussion/memo.ts, src/discussion/restore.ts, src/discussion/FileActions.tsx | front matter＋人が読む節＋最初の ```json ブロック（`edb-discussion-memo` v1）。`buildMemoForPack` / `restoreFromMemo`。課題・解決策などのデータは `registerSnapshotSource({key,capture,validate,apply})` で登録するとエクスポートされ、復元される。全量エクスポート（FR-052〜）と編集（FR-044〜）の項目が使う。ヘッダーの「保存」「開く」 | FR-051, FR-056 |
| オープニング | src/app/Opening.tsx | 顧客名とプロジェクト名の導入画面（Esc で飛ばす） | FR-101 |
| 課題-解決策分析 | src/screens/IssueSolutionScreen.tsx, src/analysis/model.ts, src/analysis/DetailPanel.tsx, src/analysis/FlowViews.tsx | 課題のイシューツリー／MECE 表／サンキー図／マトリクス、区分の絞り込み、解決策と出典リンク、詳細パネル（原因・効果・生成 AI の価値・評価属性・出典カード・製品と適合理由）。純粋なロジックは model.ts。後続の画面（優先順位分析など）が課題・解決策・出典を扱うときはここを再利用する | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-009, FR-038 |
| 数値の出典表示 | src/components/NumericValue.tsx | 数値を包むと、ホバー／フォーカスで出典の種別（WorkIQ・Web・推定）・取得日・確度のツールチップを出す（data-testid="numeric-value"）。数値を表示する画面（優先順位分析・KPI など）はこれで包む | FR-009 |
| サンプル表示 | src/components/Panel.tsx, src/data/sample.ts | パネルの見出しの横に「サンプル」を出す（顧客パックに createdBy が sample の項目があるとき）。Panel で包んだ画面は自動で対応する。Panel を使わない画面は hasSampleData で判定して同じ表示を出す | FR-008 |
| ガント画面 | src/screens/GanttScreen.tsx, src/plan/model.ts | Feature ごとの工程のガントチャート（選択の強調、開始日・終了日・担当・作業内容の表示）。純粋なロジックは plan/model.ts。2D/2.5D 切替などの後続の要求はここを拡張する | FR-007 |
| 3D 基盤 | src/three/quality.ts, src/three/presets.ts, src/three/SceneCanvas.tsx, src/store/view3d.ts, src/store/animation.ts, src/testing/hook.ts | R3F + drei の描画（WebGPU 優先・WebGL2 フォールバック）、手続き生成の 4 シーン、品質プリセットと FPS 監視、テスト用フック登録（registerTestHook） | FR-065, FR-066, FR-068, FR-069, FR-103, NFR-PERF-002 |
| 業種プリセット | src/three/presets.ts, src/three/presetIcons.tsx | 5 業種（金融・製造・小売・物流・公共）の 3D シーン・カメラパス・アイコン・中核オブジェクトの表現。resolvePreset(customer.industryPreset) で選ぶ | FR-103 |
| 雛形のバージョン | src/version.ts | TEMPLATE_VERSION（package.json の version）と、顧客パックの templateVersion との互換の判定（checkTemplateVersion） | FR-106 |
