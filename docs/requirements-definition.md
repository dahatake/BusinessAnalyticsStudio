# 要求定義書

<!--
この文書は、このアプリの要求の唯一の正本です。編集できるのは rd-author だけです（hook G-1）。
書式の規則は .github/skills/requirement-definition/SKILL.md を参照します。
ID（FR・NFR・AC・Q・PARAM）は `python scripts/next-id.py <種別>` でだけ採番します（G-3）。
要求の本文は業務の境界ごとに docs/requirements/ に分けています（構成要素が A・B・C の 3 つで、要求が 150 件を超えるため）。
-->

| 項目 | 内容 |
|---|---|
| 文書名 | Envisioning Dashboard Builder（高速生成版）要求定義書 |
| 版 | 1.0（2026-10-09、run 202610090557 で初版を作成） |
| 最終更新 | 2026-10-10 |
| 元の資料 | リポジトリ直下の `要求定義書.md`（ドラフト v1.0、SRC-001）。原本は変更しない |
| 本文の分割 | [A 共通アプリ本体（分析・UI・連動・保存）](requirements/app-core.md)、[A 共通アプリ本体（ブランド・演出・インク・雛形・ワークスペース）](requirements/app-experience.md)、[B 顧客パック](requirements/customer-pack.md)、[C 生成パイプライン](requirements/pipeline.md)、[非機能要求](requirements/quality.md) |

## 変更履歴

| 日付 | 依頼の要約 | 行き先（要求 ID・Q・不採用の理由） | 反映した回答 | 監査で直した不整合 |
|---|---|---|---|---|
| 2026-10-09 | `要求定義書.md`（ドラフト）のアプリを実装する（run 202610090557） | ドラフト §4 FR-AN-01〜11 → FR-001〜FR-011／§5.1 FR-UI-01〜08 → FR-012〜FR-019／§5.2 FR-UI-10〜13 → FR-020〜FR-023／§5.3 FR-LK-01〜06 → FR-024〜FR-029／§5.4 FR-LD-01〜07 → FR-030〜FR-036／§5.5 FR-VW-01〜05・07・06 → FR-037〜FR-043（VW-07 は FR-042、VW-06 は FR-043）／§5.6 FR-ED-01〜04 → FR-044〜FR-047／§6 FR-DS-01〜03 → FR-048〜FR-050、FR-SV-01〜07 → FR-051〜FR-057／§7.1 FR-BR-01〜07 → FR-058〜FR-064／§7.2 FR-3D-01〜05 → FR-065〜FR-069、FR-AM-01〜03 → FR-070〜FR-072、FR-AU-01〜03 → FR-073〜FR-075／§7.3 FR-SH-01〜10 → FR-076〜FR-085／§8 FR-IK-01〜11 → FR-086〜FR-096、FR-WB-01〜03 → FR-097〜FR-099／§9 FR-TP-01〜09 → FR-100〜FR-108／§10.2 DR-01〜05 → FR-114〜FR-118、§10.1 → FR-119／§11 FR-PL-01〜12 → FR-120〜FR-131／§12 NFR-PF-01〜04 → NFR-PERF-001〜004、NFR-EN-01〜02 → NFR-ENV-001〜002、NFR-EN-03 → NFR-L10N-001、NFR-AC-01〜02 → NFR-A11Y-001〜002、NFR-SC-01〜03 → NFR-SEC-001〜003、NFR-RT-01〜02 → NFR-LEGAL-001〜002、NFR-MT-01〜03 → NFR-MAINT-001〜003／§13.1 → 各要求の受入基準（manual を含む）／§13.2 AC-01〜09 → FR-127 の判定項目と FR-114・FR-115・FR-008・NFR-PERF-001 などの受入基準／§1 背景・目的・KPI → G-001〜G-004／§17 Q-1〜Q-6 → Q-003・Q-004・Q-005・Q-002・Q-001・Q-006／§14 → 既定制約 C-03〜C-06／§15・§16 → §10.5 提案・仮説（R0 の `c:\Work4` は Q-007）／ui_policy の具体化として FR-109〜FR-113、NFR-A11Y-003〜004、NFR-UX-001〜005 を追加（AI提案・包括承認） | なし | 新規作成のため該当なし（ドラフトの ID 体系 FR-AN-01 などは、検査の ID 形式に合わないため新しい ID に採番し直し、出典欄に元の ID を残した） |
| 2026-10-09 | 監査（work/runs/202610090557/audit/20261009-0640-run1.md）の直接矛盾と疑いを解消する（conductor の依頼） | D-01 → AC-073・AC-155 を変更、A-18／D-02 → AC-166 を変更、指で描くモードは §10.5／C-01 → FR-132・AC-190〜AC-191 を追加、A-15、§3.5・§8・Q-001 の回答までの扱いを更新／C-02 → AC-192、A-16／C-03 → AC-193、A-17／G-01 → §7 の本文と表／G-02 → §3.4 の用語、§3.5、A-19／Q-01 → FR-119・AC-144 の参照を訂正／C-04・M-01・M-02・L-01〜L-03・L-05・L-06 → §10.4 AUD-04〜AUD-07（今回の依頼の範囲外）／L-04 → §10.3 に注記／| L-07 → 工程 3 で解消（対象外） | なし | FR-119「要求定義書 §8」と AC-144「§10.1」がドラフトの節番号を指していた参照のずれ（意味は変えない） |
| 2026-10-09 | 実装者 I27 の報告（AC-122 と AC-126 の競合）を整理する（conductor の依頼、run 202610090557） | AC-122 の対象をコードに限定、[ASSUMPTION] A-20 を追加（AC-126・FR-100・FR-104 の本文は変更なし。AC-126 は A-20 と矛盾しない）。影響確認: `rdcheck trace AC-122`（unit: tests/unit/foundation.test.ts）、`trace AC-126`（E2E-097、tests/system/e2e/brand-settings.spec.ts） | なし | なし |
| 2026-10-10 | 実装者の報告（要求定義書との食い違い・未定義 10 件）を整理する（conductor の依頼、run 202610090557） | ① → FR-124 の本文・AC-151 を明確化、A-21／② → FR-084 の本文を明確化（AC-102 は台帳の都合で本文を変えない）、A-22／③ → FR-102 の本文を明確化（AC-124 は同上）、A-23／④ → FR-131 の本文・AC-159 を明確化、A-24／⑤ → §3.6 を追加、FR-018・FR-019 から参照、A-26／⑥ → FR-026・FR-047 の本文、AC-194 を追加（integration）、A-27／⑦ → FR-079 の本文を明確化（AC-096 は同上）、A-25／⑧ → 変更なし（A-20 で整理済みを確認）／⑨ → A-04 を補足／⑩ → 変更なし（UI の詳細） | なし | なし |
| 2026-10-10 | 最終監査（work/runs/202610090557/audit/202610090557-final-aggregate.md。HIGH 3・MEDIUM 8・LOW 6 と要確認）の転記と、確度高の HIGH の解消（conductor の依頼、run 202610090557） | F-01 → §3.5、A-28／F-02 → FR-102 の本文、A-23／F-03 → FR-132 の本文、FR-010・FR-011 の関連欄、§3.4 に用語「接続済み」、§3.5、A-29／F-04 の一部・F-12 → §3.5 の 3D 品質・3D シーン／F-15 → §10.3 の注記／全指摘 → §10.4 AUD-04〜AUD-24／未回答の質問票 Q-001〜Q-008 → §10.2 に整理。AC の本文は変更なし（tests/system/ledger.json の ac_digests を動かさない） | なし | 3D 品質の自動の引き下げが {PARAM-028}（継続時間）をしきい値のように参照していた誤りを {PARAM-027}／{PARAM-028} の組に直した |
| 2026-10-10 | 実装者 J03 の報告: 事業部門の既定のレイアウトに表（table）を追加（conductor の依頼、run 202610090557） | FR-112 の本文・§7 の事業部門の行 → 表を含める明記、A-30。AC の本文は変更なし。最終監査の転記は AUD-04〜AUD-24 で漏れなし | なし | なし |
| 2026-10-12 | 業務・組織の分析（手法・ビュアー・パラメーター編集・結果確認）、改善プロセスのステッパー、企業ごとの複数 Project 管理（run 202610121323） | FR-133〜FR-137（依頼原文）、FR-138〜FR-140・NFR-UX-006・NFR-SEC-004（AI提案・承認待ち）、NFR-A11Y-005・PARAM-030〜032（AI提案・包括承認）、G-005〜G-007、Q-009〜Q-011、SRC-010〜SRC-012。本文は [analysis-projects.md](requirements/analysis-projects.md)。新 ID は旧 ID と衝突しないよう FR-133・AC-195 などから採番（間は欠番） | なし | 削除されていた旧要求定義書の本体とカタログを履歴（2765e64 の前）から復元して統合した（コード・テストが旧 ID を参照しており CHK-19 が失敗していたため） |

## 1. 概要

### 1.1 事業背景

法人顧客との商談で、顧客の課題と ToBe 像を具体的に示し、経営層の意思決定を支援するローカル Web アプリを、顧客ごとに用意している。従来は毎回ゼロからアプリを生成しており、2026-10-08 の実行結果の分析（2026-10-09、SRC-001 §0・§1.1）で次の課題が分かった。

| # | 課題 | 根拠（SRC-001 §1.1 の記載） |
|---|---|---|
| P-1 | 1 件あたりの生成に 60 分以上かかる | 調査 約 25 分以上（推定）、`npm install` 約 5 分、コード生成 約 11 分、検証 約 17 分（1 回の実行の観察） |
| P-2 | 時間をかけても要件の一部しか実装されない | 前回の成果物に、インクキャンバスと PDF 出力、ナレッジグラフ、LOD、URL 状態復元、ホワイトボード、モックアプリ、アーキテクチャ図、`customer-research.md` がなかった |
| P-3 | 毎回コードを生成するため、品質と見た目が安定しない | 生成のたびに実装が変わり、検証もやり直しになる |
| P-4 | 工程ごとの所要時間を計測していない | 改善の効果を定量的に評価できない |

このため、仕組みを A. 共通アプリ本体（雛形。全機能を実装したビルド済みの Web アプリ）、B. 顧客パック（顧客ごとのデータ）、C. 生成パイプライン（Copilot Skill）の 3 つに分け、顧客ごとには B だけを作る。

### 1.2 目的

| ID | 目的 | 成功指標 | 測定方法 |
|---|---|---|---|
| G-001 | 法人顧客のビジネス課題を整理し、ToBe 像を具体的に想起させることで、経営層の意思決定を支援する | 依頼に数値の目標はない（議論テーマごとの決定事項・次のアクションが記録され、エクスポートされること） | エクスポートした Markdown の決定事項・次のアクションの件数（目標値は未設定） |
| G-002 | アプリが「アプリ」「プレゼンテーション」「ディスカッションボード」「ショー体験」を兼ね、演出が論理・数値・出典の読みやすさを損なわない | KPI-5: 4K・High 品質・GPU 搭載 PC で {PARAM-007} | NFR-PERF-002 の手動の計測 |
| G-003 | 調査を事前に済ませている場合、顧客 1 件あたりの準備時間を 3〜6 分にする | KPI-1: 顧客パック生成から起動まで {PARAM-001}（中央値 {PARAM-002}）。KPI-2: 事前調査 {PARAM-003} | `logs/timing.json`（FR-129） |
| G-004 | 雛形と自動検証で、全要件を満たす品質を案件ごとに安定させる | KPI-3: verify の合格率 100%（全 Must 項目）。KPI-4: ドラフトの要件の網羅率 Must 100%、Should 80% 以上 | verify の結果（FR-127）、カタログの実装状況 |
| G-005 | 利用者が、一般的な組織・業務分析の手法に沿って業務や組織を分析し、パラメーターを編集しながら結果を確認できる | 手法を選んで結果を確認するまでを、案内なしで完了できた利用者の割合（目標値は未定。導入後に決める） | 利用者テスト（manual） |
| G-006 | 利用者が、業務改善プロセスの現在のステップを常に把握できる | ステッパーで現在のステップを正しく答えられた割合（目標値は未定） | 利用者テスト（manual） |
| G-007 | 特定の企業について複数の Project を取り違えなく管理できる | Project 間のデータ混在の発生件数 0 | System Test（AC-209 の受入基準） |

受益者: ファシリテーター（準備時間の短縮）、顧客の経営層・参加者（意思決定の材料）。費用負担者・決定権者: 依頼に記載がない（[ASSUMPTION] A-14）。

### 1.3 事業妥当性の判定

条件付き。根拠: P-1〜P-4 は 1 回の実行の観察（SRC-001）で、顧客パックの差し替えで再生成を避ける方式は P-1・P-3 を直接解消する。条件: (1) Copilot に顧客情報を送る条件（Q-001）が決まること（実際の LLM での生成と KPI-1 の実測ができないため）、(2) R2 の 2 社分の実測で KPI-1 を確かめること。

2026-10-12 追加分（FR-133〜FR-140）: 条件付き。根拠: 依頼原文と既存アプリの目的との整合。利用者数・効果の数値は入力にない。条件: Q-009（保存先・権限）、Q-011（外部送信）の決定。

## 2. 対象と対象外

対象: A. 共通アプリ本体の全機能（FR-001〜FR-113、FR-132）、B. 顧客パックのデータスキーマと検証（FR-114〜FR-119）、C. 事前調査・データ生成・検証・起動の自動化（FR-120〜FR-131）、非機能要求（NFR-*）。

対象外（SRC-001 §2.2）:
- 顧客の本番システムとの連携、および実データの取り込み
- クラウドへのデプロイ（独自のクラウドアプリ/サーバーの構築を含む）と、複数の利用者による同時編集
- SaaS 型アプリ生成ツールの利用（ローカル完結と顧客情報保護の要求に反するため）
- 利用者の認証・権限管理（ローカルで 1 人が使うアプリのため。§3.1 C-01）

2026-10-12 追加の対象: 組織・業務の分析手法の選択・ビュアー切替・パラメーター編集・結果確認（FR-133〜FR-135）、改善プロセスのステッパー（FR-136）、企業と複数 Project の管理（FR-137〜FR-139）。対象外: HBR 等の本文の複製（手法の名称と一般的な枠組みの参照のみ）、外部システムとの連携（Q-010 の決定まで）。

## 3. 前提・制約

### 3.1 既定制約

#### 既定制約（要求定義プロンプトの常設方針）

- ui_policy-1 利用者がレイアウトを変更できるモダンな UI（決定状態: 承認済み・既定制約）。具体化: FR-013、FR-014、FR-109、FR-110、FR-111、NFR-A11Y-004、NFR-UX-001、NFR-UX-002。参照例: SRC-003。
- ui_policy-2 ペルソナごとの既定の情報表現（決定状態: 承認済み・既定制約）。具体化: FR-015、FR-112、FR-113、NFR-A11Y-003、§7 の表。

#### 依頼で必須とされた制約

| ID | 制約 | 根拠 |
|---|---|---|
| C-01 | ローカル完結: アプリと生成パイプラインは利用者の PC 上で動き、外部サーバーなしで起動でき、クラウドに独自のアプリ/サーバーを作らない。アプリに利用者の認証はない（ローカルの 1 人の利用） | SRC-001 §2.2・§2.3・§12 NFR-EN-02 |
| C-02 | 顧客情報の保護: 調査キャッシュと顧客パックをコミットしない。外部への送信は Copilot SDK と設定した AI API に限る。WorkIQ 由来の情報は機密区分を持つ | SRC-001 §2.2・§12 NFR-SC-01〜03 |
| C-03 | LLM の利用は GitHub Copilot SDK に限り、呼び出しは中継プロセスの 1 か所に集約する | SRC-001 §4 FR-AN-10/11・§14、SRC-009 |
| C-04 | デザインシステムは Fluent 2 / Fluent UI React v9（利用者の指定） | SRC-001 §7.1 FR-BR-01、SRC-008 |
| C-05 | 推奨の技術構成: Vite + React + TypeScript、Fluent UI React v9、React Three Fiber/drei/postprocessing、GSAP または Motion、Tone.js/Howler.js、Zustand、zod。要求の本文には目的だけを書き、技術名は「依頼原文の技術指定」として添える。後続の工程で変える場合は決定記録に残す | SRC-001 §14 |
| C-06 | ライブラリ（インク・PDF など）はライセンスを確認してから採用し、`CREDITS.md` に記録する。tldraw は商用利用にライセンスが必要な場合があるため、採用前に確認する（Q-003） | SRC-001 §14 |
| C-07 | この run（202610090557）では外部の有料サービスを使わず、外部公開・デプロイをしない。LLM・WorkIQ・Web・音声・手書き認識を使う部分は、モックと差し替え部品で検証できる受入基準にし、実際の接続での確認は manual（BLOCKED）とする | conductor の依頼（2026-10-09） |

### 3.2 対象の利用者・環境

- 利用者: §4 のペルソナ。言語は日本語（NFR-L10N-001）。地域・タイムゾーン: 日本（Asia/Tokyo）。時刻の記録はタイムゾーン付きで行う。
- 端末: Windows / macOS の最新の Microsoft Edge・Chrome。iPad の Safari ではインクとタッチの主要機能（NFR-ENV-001）。開発・生成には Node.js LTS。
- 利用者は GitHub Copilot のライセンスを持ち、Copilot CLI にサインインできる（SDK の実行に必要）。GitHub Copilot（CLI/VS Code）で Skill を実行できる。WorkIQ は使えない場合がある（SRC-001 §2.3）。

### 3.3 パラメータ（PARAM）

閾値・期間・件数などの値は、要求と受入基準に直接書かず、ここで定義して `{PARAM-xxx}` の形で参照します。

| ID | 名前 | 値 | 単位 | 根拠 | 決定状態 |
|---|---|---|---|---|---|
| PARAM-001 | 顧客パックの生成から起動までの上限（調査済み） | 6 | 分 | SRC-001 KPI-1・NFR-PF-01 | 承認済み（依頼 2026-10-09） |
| PARAM-002 | 顧客パックの生成から起動までの中央値の目標 | 4 | 分 | SRC-001 KPI-1 | 承認済み（依頼 2026-10-09） |
| PARAM-003 | 事前調査の上限 | 10 | 分 | SRC-001 KPI-2・FR-PL-02 | 承認済み（依頼 2026-10-09） |
| PARAM-004 | 調査キャッシュの有効期限 | 30 | 日 | SRC-001 FR-PL-04 | 承認済み（依頼 2026-10-09） |
| PARAM-005 | 雛形の複製の上限 | 30 | 秒 | SRC-001 FR-PL-05 | 承認済み（依頼 2026-10-09） |
| PARAM-006 | 自己修正の最大回数 | 3 | 回 | SRC-001 FR-PL-07 | 承認済み（依頼 2026-10-09） |
| PARAM-007 | 4K・High 品質の目標フレームレート | 60 | fps | SRC-001 KPI-5・NFR-PF-02 | 承認済み（依頼 2026-10-09） |
| PARAM-008 | 初回表示（オープニング開始）の上限 | 3 | 秒 | SRC-001 NFR-PF-03 | 承認済み（依頼 2026-10-09） |
| PARAM-009 | インク描画の 1 フレームの目標時間 | 16 | ms | SRC-001 NFR-PF-04 | 承認済み（依頼 2026-10-09） |
| PARAM-010 | 描画性能を保証するストローク数 | 20000 | 本 | SRC-001「数万」の下限側を採用（[ASSUMPTION] A-10） | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-011 | オープニングの最短 | 15 | 秒 | SRC-001 FR-SH-01 | 承認済み（依頼 2026-10-09） |
| PARAM-012 | オープニングの最長 | 30 | 秒 | SRC-001 FR-SH-01 | 承認済み（依頼 2026-10-09） |
| PARAM-013 | ショート動画の長さ（約） | 60 | 秒 | SRC-001 FR-SH-06 | 承認済み（依頼 2026-10-09） |
| PARAM-014 | ナレッジグラフのホップ数の範囲 | 1〜3 | ホップ | SRC-001 FR-VW-01 | 承認済み（依頼 2026-10-09） |
| PARAM-015 | エグゼクティブサマリーの文の数 | 2〜3 | 文 | SRC-001 FR-VW-05 | 承認済み（依頼 2026-10-09） |
| PARAM-016 | 業種プリセットの最低数 | 5 | 種 | SRC-001 FR-TP-04 | 承認済み（依頼 2026-10-09） |
| PARAM-017 | ブランドランプの段階数 | 16 | 段階 | SRC-001 FR-BR-02 | 承認済み（依頼 2026-10-09） |
| PARAM-018 | 本文のコントラスト比の下限（AA） | 4.5:1 | 比 | SRC-001 FR-BR-03、SRC-004（1.4.3） | 承認済み（依頼 2026-10-09） |
| PARAM-019 | 大きな文字・UI 部品のコントラスト比の下限（AA） | 3:1 | 比 | SRC-001 FR-BR-03、SRC-004（1.4.3・1.4.11） | 承認済み（依頼 2026-10-09） |
| PARAM-020 | 顧客パックの受け入れ判定の上限 | 1 | 分 | SRC-001 §13.2 | 承認済み（依頼 2026-10-09） |
| PARAM-021 | 点滅の上限 | 3 | 回/秒 | SRC-001 NFR-AC-01 | 承認済み（依頼 2026-10-09） |
| PARAM-022 | ミニ・モックアプリの画面数 | 1〜3 | 画面 | SRC-001 FR-VW-06 | 承認済み（依頼 2026-10-09） |
| PARAM-023 | LOD のヒステリシスの幅（しきい値に対する割合） | 10 | % | [ASSUMPTION] A-11 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-024 | 元に戻すの履歴の上限 | 100 | 回 | [ASSUMPTION] A-11 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-025 | インクの自動保存の間隔 | 2 | 秒 | [ASSUMPTION] A-11 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-026 | ショーコントロールバーが自動で隠れるまでの時間 | 3 | 秒 | [ASSUMPTION] A-11 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-027 | 品質を自動で下げる FPS のしきい値 | 45 | fps | [ASSUMPTION] A-03 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-028 | 品質を自動で下げる判定の継続時間 | 2 | 秒 | [ASSUMPTION] A-03 | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-029 | 縮退の確認に使う表示幅 | 320 | CSS px | SRC-004（1.4.10 Reflow） | 承認済み（包括承認 2026-10-09・approval_policy） |
| PARAM-030 | 業務改善ステップ数 | 5 | 個 | AI提案（課題定義→現状分析→KPI 測定→ユースケース作成→施策計画）。[ASSUMPTION] A-32 | 承認済み（包括承認 2026-10-12・approval_policy） |
| PARAM-031 | 企業ごとの Project 数の上限 | 50 | 件 | AI提案。一覧の操作性の仮の上限。変更で戻せる。[ASSUMPTION] A-33 | 承認済み（包括承認 2026-10-12・approval_policy） |
| PARAM-032 | パラメーター変更から結果反映までの上限時間 | 2 | 秒 | AI提案。通常規模のデータ（お手本パック相当）での目安。[ASSUMPTION] A-33 | 承認済み（包括承認 2026-10-12・approval_policy） |

### 3.4 用語

| 用語 | 定義 | 禁止同義語 |
|---|---|---|
| 雛形 | 全機能を実装したビルド済みの共通アプリ本体（構成要素 A）。顧客固有の情報を含まない | テンプレートアプリ |
| 顧客パック | `public/data/`・`public/brand/`・`assets/` などに置く顧客固有のデータ一式（構成要素 B、FR-119） | 顧客データセット |
| お手本パック | 雛形に同梱する架空企業の顧客パック。種別モノ（製造業）とコト（物流）の 2 件で、`public/data/` が空のときと標準の検証条件ではモノを使う。デモと回帰テストに使う（FR-104、FR-118、[ASSUMPTION] A-19） | サンプルパック |
| お手本パックの変種 | 検査のために、お手本パックの一部を変えたパック（位置情報のない拠点、`internal` の項目、コントラスト不足の Primary 色、`sourceIds` のない数値など）。雛形の配布物には含めず、テストの入力として使う。受入基準の「〜を含むお手本パック」「〜にしたパック」はこれを指す（[ASSUMPTION] A-19） | なし |
| 生成パイプライン | 雛形の複製 → 事前調査の取り込み → 顧客パック生成 → 検証 → 起動を行う Copilot Skill（構成要素 C） | なし |
| 調査キャッシュ | 事前調査の結果を保存した `research-cache/<顧客名>/` | なし |
| 中継プロセス | Copilot SDK の呼び出しを集約する、localhost だけで待ち受けるローカルの Node.js のプロセス（FR-011） | 中継サーバー |
| エンティティ関係グラフ | 製品/部品/拠点/課題/テーマ/工程/KPI/出典などを ID で相互参照するデータモデル。全ビューが使う唯一の情報源 | なし |
| 中核オブジェクト | キャンバスの中心に置く、議論の核となるモノ/コト（FR-018） | なし |
| 演出強度 | Executive／Showcase／Entertainment の 3 段階（FR-083） | なし |
| 業種プリセット | 業種ごとの 3D シーン・カメラパス・アイコン・中核オブジェクトの表現の定義（FR-103） | なし |
| ペルソナ別ビュー | 経営層・事業部門・IT・現場のペルソナごとの既定の表示（FR-015、FR-112）。アクセス制御ではない | なし |
| 作成者の種別 | 値を作ったものの区別（`ai`／`human`／`sample`、FR-116） | なし |
| 機密区分 | WorkIQ 由来の情報の区分（`internal`／`shareable`、FR-117） | なし |
| 縦串 | 最小の動作単位（キャンバス+1 テーマ+Markdown 保存+ブランド適用+ヒーロー 3D+ミュート/アニメ停止+インク）。実装の順序の目安（§10.5） | なし |
| キャンバス | 議論の全体を置く、拡大・縮小・移動ができる作業面（FR-012） | なし |
| 議題 | 議論の単位となる項目（議論テーマに対応する） | なし |
| チャプター | 番組構成を区切る単位（FR-016） | なし |
| 出典 | 値の根拠となる資料・情報源（`sourceIds` が参照する） | なし |
| 課題 | 顧客の業務上の問題。解決策と対応付ける | なし |
| 用語集 | 顧客の業界・業務の用語とその定義の一覧（FR-019） | なし |
| 拠点 | 地図上に置く場所（工場・倉庫・店舗など。位置情報を持つ） | なし |
| 流れ | モノ・情報・人が拠点や工程の間を移動する経路（FR-021） | なし |
| 工程 | 業務や生産の手順の 1 段階（FR-022） | なし |
| 選択状態 | いま選択している対象。ビューが替わっても保たれる | なし |
| フィルター | 表示する対象を絞る条件 | なし |
| 解決策 | 課題に対する施策。原因・効果と対応付ける | なし |
| 原因 | 課題を生じさせている要因 | なし |
| 効果 | 解決策で期待する成果（ROI・KPI を含む） | なし |
| Microsoft 製品 | 解決策や ToBe のアーキテクチャで使う Microsoft の製品・サービス | なし |
| アーキテクチャ | システム構成図。AsIs（現状）と ToBe（将来）がある | なし |
| エグゼクティブサマリー | 経営層向けに要点をまとめた 1 画面の要約 | なし |
| 議論ツリー | 議題を親子に分けて並べた階層 | なし |
| 次のアクション | 議論の結果として決めた、次に行う作業 | なし |
| エクスポート | 議論の記録や画面を、ファイルとして書き出すこと | なし |
| 変更履歴 | 値の変更の記録 | なし |
| ブランドプロファイル | 顧客のブランド（色・ロゴ・書体）を表すデータ（顧客パックの `public/brand/`） | なし |
| Feature | 雛形の機能の単位（機能の有効/無効を切り替える対象、FR-007） | なし |
| 3D アセット | 3D シーンに置くモデルなどの素材（FR-068） | なし |
| ショート動画 | 画面の動きを書き出した短い動画（FR-081） | なし |
| ショーコントロールバー | ショーの再生・停止・ミュートなどを操作する部品（FR-084） | なし |
| ショートカット | キー操作に割り当てた機能（FR-085） | なし |
| ボード | 手書きや付箋を置くホワイトボードの面（FR-096） | なし |
| セットアップ | 雛形を顧客向けに準備する手順（FR-107） | なし |
| コマンド | コマンドパレットから実行できる操作（FR-111） | なし |
| 作業フォルダー | 顧客パックと調査キャッシュを置く作業用のフォルダー（FR-124） | なし |
| 時間計測 | 生成や描画などの所要時間の計測（FR-129） | なし |
| 改善要望 | 利用者が出した、アプリの改善の希望（FR-131） | なし |
| モック | AI（LLM・音声・手書き認識）に接続できないときに、決まった応答を返す代わりの処理。画面に明示する | なし |
| 接続済み | AI 接続状態の一つ。利用者が設定で実接続を明示的に有効にして確認した後に、実際に接続している状態（FR-132）。有効にしていなければ、SDK を使える状態でもモックである | なし |
| 企業 | Project をまとめる単位。利用者が分析対象として登録する特定の会社・組織（FR-137） | なし |
| Project | 企業の下で、業務改善の取り組み 1 件を表す単位。分析とステッパーの位置を持つ（FR-137） | なし |
| 分析 | 分析手法とパラメーターを選び、結果を得る 1 回の取り組み（FR-133） | なし |
| 分析手法 | SWOT 分析、ファイブフォース分析、バリューチェーン分析、3C 分析、バランスト・スコアカードなどの一般的な枠組み（FR-133） | なし |
| ビュアー | 分析結果を表示する見せ方（表、マトリクス、図、グラフ）（FR-135） | なし |
| 業務改善ステップ | 業務改善プロセスの段階。ステッパーで表示する（FR-136） | なし |

### 3.5 状態と標準の検証条件

| 対象エンティティ | 状態 | 遷移の条件 |
|---|---|---|
| AI 接続 | AI 接続状態（接続済み／モック） | 既定はモック。中継プロセスが Copilot SDK を使える状態で、かつ利用者が設定で実接続を明示的に有効にしたとき（起動中の顧客パックに限る）だけ接続済み（FR-132。Q-001 の回答まで）。本書の「接続済み」「実際の SDK 経由」は、すべてこの明示的な有効化の後の状態を指す（AC-011・AC-176 を含む。[ASSUMPTION] A-29）。未サインイン・オフライン・中継プロセスの停止では、有効にしていてもモック（FR-011） |
| コンポーネント | コンポーネントの表示状態（最大化／通常／非表示） | `Shift+F`・ダブルクリックで最大化、`Esc` で通常、`H` で非表示、ドックから再表示（FR-013、FR-014） |
| レイアウト | コンポーネントの表示状態（各コンポーネントの最大化／通常／非表示を保持する） | コンポーネントの表示状態の変更に従う。保存・復元・既定への復元の対象（FR-014） |
| エンティティ関係グラフ | AI 接続状態（接続済み／モック）、LOD の表示状態 | AI 接続状態は AI 接続に従う。LOD の表示状態は表示の詳細度で決まる（FR-032） |
| 出典 | AI 接続状態（接続済み／モック） | AI 接続に従う。モックのときの応答に出典が付かないことを示す（FR-017） |
| 選択状態 | アニメーションの状態（再生中／停止中） | アニメーションの状態に従う（FR-029、FR-071） |
| 議論テーマ | 値の作成者の種別（sample／ai／human） | 値の作成者の種別の遷移に従う（FR-116） |
| 課題 | 値の作成者の種別（sample／ai／human） | 同上（FR-039、FR-116） |
| 変更履歴 | 値の作成者の種別（sample／ai／human） | 同上（FR-116） |
| エグゼクティブサマリー | 値の作成者の種別（sample／ai／human）、固定（固定／非固定） | 値の作成者の種別は同上。固定は利用者が切り替える（FR-041） |
| アーキテクチャ | AsIs／ToBe（どちらの構成を表示しているか） | 利用者の切替（FR-040） |
| エンティティ関係グラフ（動作） | アニメーションの状態（再生中／停止中）、編集モード（ON／OFF） | それぞれ「アニメーション」「編集モード」の行に従う（FR-034、FR-047） |
| 出典 | 機密区分（internal／shareable） | WorkIQ 由来の情報の区分。`internal` は既定では画面・エクスポートに出さない。匿名化 ON のエクスポート（値は A-08 の表記に置き換える。FR-054、FR-117）、または件数の確認後のプレゼンテーション開始（NFR-SEC-003）で扱う（[ASSUMPTION] A-28。Q-008 の回答までの暫定） |
| ショー | AI 接続状態（接続済み／モック）、演出強度（Executive／Showcase／Entertainment） | AI 接続状態は AI 接続に従う。演出強度は利用者の切替（FR-083） |
| モーション | アニメーションの状態（再生中／停止中） | アニメーションの行に従う（FR-070） |
| 演出の設定 | アニメーションの状態（再生中／停止中） | 同上（FR-071、FR-072） |
| テーマ | テーマ（ライト／ダーク／ハイコントラスト） | OS と利用者の設定に従う（FR-058） |
| 音声 | ミュート（ミュート／発音） | 利用者の切替（FR-063） |
| 3D 品質 | 品質（Low／Medium／High／Ultra） | 利用者の設定と、FPS が {PARAM-027} を下回る状態が {PARAM-028} 続いたときの 1 段階の自動の引き下げ（FR-069） |
| 議論テーマ（決定ステータス） | 決定ステータス（AI 提案／検討中／決定／保留） | AI の提案で「AI 提案」。利用者の操作だけが「決定」「保留」にする（FR-050） |
| 値（作成者の種別） | 値の作成者の種別（sample／ai／human） | 顧客パックの初期値は sample か ai。利用者が編集すると human（FR-116） |
| 編集モード | 編集モード（ON／OFF） | 利用者の切替（FR-047）。既定は OFF（[ASSUMPTION] A-12） |
| アニメーション | 再生中／停止中 | `P` で切替。prefers-reduced-motion が有効なら停止中で起動（FR-071、FR-072） |
| 調査キャッシュ | 調査キャッシュ（有効／期限切れ）、機密区分（internal／shareable） | 作成から {PARAM-004} を過ぎると期限切れ（FR-123）。機密区分は WorkIQ 由来の情報に付く（FR-117） |
| 演出の設定 | 演出強度（Executive／Showcase／Entertainment）、ミュート（ミュート／発音） | 利用者の切替（FR-083、FR-063） |
| 出典 | 確度（確認済み／未確認） | 出典の確認結果に従う（FR-115） |
| ブランドプロファイル | ロゴの利用条件（利用可／要確認）、確度（確認済み／未確認） | 顧客のブランド資産の確認結果に従う（FR-061、FR-064） |
| 3D シーン | 描画方式（WebGPU／WebGL2）、AsIs／ToBe、品質（Low／Medium／High／Ultra） | WebGPU で描画し、非対応の環境では WebGL2 に切り替える（FR-065）。AsIs／ToBe と品質は利用者の設定または自動の引き下げ（FR-066、FR-069、NFR-PERF-002） |
| 業種プリセット | AsIs／ToBe（どちらの表現を持つか） | FR-066 |
| 顧客パック | 項目の有効性（有効／無効） | 顧客パックの項目の行に従う（FR-102） |
| 付箋 | 値の作成者の種別（sample／ai／human） | 値の行に従う（FR-099） |
| ストローク | 注釈の扱い（保持／消去） | 利用者の操作で消去する。注釈は保存した場合に保持（FR-091） |
| 顧客パックの項目 | 有効／無効 | スキーマ検証でエラーの項目は無効（FR-102） |
| Project | 進行中→アーカイブ | 利用者がアーカイブする。アーカイブ一覧から復元できる（FR-137） |
| 分析 | 編集中→結果確認済み | 利用者が結果を表示したとき（FR-135） |
| 業務改善ステップ | 未着手→進行中→完了 | 利用者がそのステップの作業を開始・完了したとき（FR-136） |

標準の検証条件: ビルド済みの雛形を、お手本パック（モノ。[ASSUMPTION] A-19）と AI モック（中継プロセスが未接続）で、ローカルの静的サーバー（127.0.0.1）から配信し、Chromium 系のブラウザーで開いた状態。system の受入基準は、断りがない限りこの条件で確かめる。
主要画面（FR-008、NFR-A11Y-001 などで使う一覧）: キャンバス（全体）、課題-解決策分析、優先順位分析、ナレッジグラフ、アーキテクチャ図、議論ツリー、ガントチャート、ホワイトボード、設定パネル（[ASSUMPTION] A-13）。

### 3.6 顧客パックの任意項目（中核オブジェクト・用語集）

`customer.json` の次の項目は、いずれも任意（省略できる。省略時は表示しないだけで、検証エラーにしない）で、未知の項目は読み飛ばす。決定は [ASSUMPTION] A-26。

| 項目 | 形式 | 意味 |
|---|---|---|
| `coreObject.candidates[].name` | 文字列 | 候補の表示名。`label` がある場合も `name` を優先し、`name` がなければ `label` を表示名とする（互換。`name ?? label`） |
| `coreObject.candidates[].summary` | 文字列 | 候補の要約 |
| `coreObject.candidates[].scores` | 比較の観点の ID → 評価（文字列）の対応 | 候補ごとの比較の評価 |
| `coreObject.criteria[]` | `id`（パック内で一意）と `label` | 比較の観点 |
| `coreObject.reason` | 文字列 | 選定理由 |
| `glossary[]` | `term`（語）と `definition`（定義） | 用語集。文中の語（長い語を優先）に定義のツールチップを付ける（FR-019） |

## 4. ペルソナ

アプリに利用者の認証・権限はない（C-01）。ペルソナは利用者像で、アクセス制御の役割ではない。権限の正本はないため「役割」の欄は該当なしとする。

| ペルソナ | 業務 | 主要な判断 | 使うデータ | 判断の頻度と緊急度 | 役割 | 出典 |
|---|---|---|---|---|---|---|
| ファシリテーター（コンサルタント/営業/SE） | 顧客パックの生成、会議の進行、プレゼン、手書きメモ、エクスポート | どの議題をどの順で深掘りするか、何を決定事項として記録するか | 全データ（課題・解決策・番組構成・議論の記録） | 会議中に随時。即時 | 該当なし（権限の正本なし） | SRC-001 §3 |
| 顧客の経営層 | ショー体験の視聴、優先順位の議論、意思決定 | どの施策に投資し、どの順で進めるか | 優先順位（インパクト×実現性）、ROI・コスト、KPI、エグゼクティブサマリー | 会議ごと。会議中に決める | 該当なし | SRC-001 §3、SRC-005 |
| 顧客の事業部門 | ペルソナ別ビューで確認し、意見を出す | 課題と原因の妥当性、解決策が業務に合うか | 課題-解決策の関係、議論ツリー、工程 | 会議ごと。中 | 該当なし | SRC-001 §3、SRC-007 |
| 顧客の IT 部門 | ペルソナ別ビューで確認し、意見を出す | 既存環境との適合と実現性、ToBe のアーキテクチャ | AsIs/ToBe のアーキテクチャ、Microsoft 製品、ナレッジグラフ | 会議ごと。中 | 該当なし | SRC-001 §3、SRC-006 |
| 顧客の現場 | ペルソナ別ビューで確認し、意見を出す | 日々の作業がどう変わるか、使えるか | 中核オブジェクト（3D/地図）、ミニ・モックアプリ、工程 | 会議ごと。中 | 該当なし | SRC-001 §3、SRC-007 |
| テンプレート保守者 | 雛形の機能追加、業種プリセットの追加、依存関係の更新 | 変更が既存の顧客パックを壊さないか | スキーマ、お手本パック、verify の結果 | リリースごと。低 | 該当なし | SRC-001 §3 |
| 事業企画担当 | ビジネスシナリオ・KPI・ユースケースの作成と、分析のパラメーター編集 | どの課題を優先するか | 分析の入力値、KPI、数量 | 週次・中 | 権限の正本はない（C-01）。NFR-SEC-004 は Q-009 の回答まで保留 | SRC-010（調査したが該当なし。仮説） |
| 業務改善リーダー | 複数 Project の進行管理（Project 切替とステップ確認） | 各 Project の現在のステップと遅れ | ステップの状態、日程 | 日次・中 | 同上 | SRC-010（仮説） |
| 経営層・意思決定者（分析結果の閲覧） | 分析結果の確認 | 施策の採否 | 分析結果の要約 | 月次・高 | 同上 | SRC-010（仮説） |

## 5. 利用シナリオ

| ID | 流れ | 主な要求 |
|---|---|---|
| UC-1 | 商談の前日に `research` を実行し、調査結果をキャッシュする。WorkIQ・Web が使えなければサンプルに切り替えて記録する | FR-120〜FR-123 |
| UC-2 | 商談の直前に `build` を実行し、{PARAM-001} 以内にアプリを起動する。期限切れのキャッシュなら再調査を提案される | FR-124〜FR-130、NFR-PERF-001 |
| UC-3 | 会議中にオープニングからチャプター順に提案を進め、経営層と議論する | FR-016、FR-076〜FR-085 |
| UC-4 | 3D・地図・表・ガントを連動させて、課題と解決策を深掘りする | FR-020〜FR-036 |
| UC-5 | 重みを変えて優先順位を再計算し、決定事項を記録する | FR-039、FR-048〜FR-050 |
| UC-6 | ペンやタッチで手書きメモを取り、PDF/Markdown で持ち帰る | FR-086〜FR-096 |
| UC-7 | 商談後に全量の Markdown をエクスポートし、フォローアップ資料を作る | FR-051〜FR-056 |
| 中断と再開 | ブラウザーを閉じても、インク（FR-095）・演出の設定（FR-057）・レイアウト（FR-014）が復元される。議論データは保存した Markdown から復元する（FR-056） | |
| 変更と取消 | 編集は元に戻す/やり直しができ（FR-046）、「サンプルに戻す」で初期値に戻せる | |
| 失敗と復旧 | 顧客パックの一部が不正でも、その項目だけを無効にして起動する（FR-102）。生成時は自己修正し（FR-126）、verify が原因と対処を出す（FR-127） | |

## 6. 要求（索引）

要求の本文は docs/requirements/ の各ファイルにあります。この表は 1 行 1 要求の索引です。

| 要求 ID | 題名 | 決定状態 | 優先度 | 受入基準 | ファイル |
|---|---|---|---|---|---|
| FR-001 | 課題の構造化表示 | 承認済み | MUST | AC-001 | [app-core.md](requirements/app-core.md) |
| FR-002 | 社内向け・社外向けの区分 | 承認済み | MUST | AC-002 | [app-core.md](requirements/app-core.md) |
| FR-003 | 課題の評価属性 | 承認済み | MUST | AC-003 | [app-core.md](requirements/app-core.md) |
| FR-004 | 出典付きの実現手段 | 承認済み | MUST | AC-004 | [app-core.md](requirements/app-core.md) |
| FR-005 | Microsoft 製品と適合理由 | 承認済み | MUST | AC-005 | [app-core.md](requirements/app-core.md) |
| FR-006 | 生成 AI の価値の明示 | 承認済み | MUST | AC-006 | [app-core.md](requirements/app-core.md) |
| FR-007 | Feature ごとの工程 | 承認済み | MUST | AC-007 | [app-core.md](requirements/app-core.md) |
| FR-008 | サンプルデータの明示 | 承認済み | MUST | AC-008 | [app-core.md](requirements/app-core.md) |
| FR-009 | 調査データの出典と確度の確認 | 承認済み | MUST | AC-009 | [app-core.md](requirements/app-core.md) |
| FR-010 | LLM 処理のローカル実行 | 承認済み | MUST | AC-010〜AC-011 | [app-core.md](requirements/app-core.md) |
| FR-011 | Copilot SDK 中継プロセスとモック | 承認済み | MUST | AC-012〜AC-014 | [app-core.md](requirements/app-core.md) |
| FR-012 | 議題間を移動できるキャンバス | 承認済み | MUST | AC-015 | [app-core.md](requirements/app-core.md) |
| FR-013 | コンポーネントの最大化・通常表示・非表示 | 承認済み | MUST | AC-016 | [app-core.md](requirements/app-core.md) |
| FR-014 | ドックからの再表示とペルソナ別レイアウトの保存 | 承認済み | MUST | AC-017 | [app-core.md](requirements/app-core.md) |
| FR-015 | ペルソナ別ビューの切替 | 承認済み | MUST | AC-018 | [app-core.md](requirements/app-core.md) |
| FR-016 | プレゼンテーションモード | 承認済み | MUST | AC-019、AC-192 | [app-core.md](requirements/app-core.md) |
| FR-017 | 検索と Copilot 風チャット | 承認済み | MUST | AC-020〜AC-021 | [app-core.md](requirements/app-core.md) |
| FR-018 | 中核オブジェクトの選定理由と変更 | 承認済み | MUST | AC-022 | [app-core.md](requirements/app-core.md) |
| FR-019 | ビジネス⇔IT のレンズ切替 | 承認済み | MUST | AC-023 | [app-core.md](requirements/app-core.md) |
| FR-020 | モノの表現（3D デジタルツインと 2D 図面） | 承認済み | MUST | AC-024 | [app-core.md](requirements/app-core.md) |
| FR-021 | コトの表現（3D 地球儀/3D マップと流れの粒子） | 承認済み | MUST | AC-025 | [app-core.md](requirements/app-core.md) |
| FR-022 | 工程管理の表現（ガントチャート 2D/2.5D） | 承認済み | MUST | AC-026 | [app-core.md](requirements/app-core.md) |
| FR-023 | フライスルー遷移 | 承認済み | MUST | AC-027〜AC-028 | [app-core.md](requirements/app-core.md) |
| FR-024 | 共通の選択状態とエンティティ関係グラフ | 承認済み | MUST | AC-029 | [app-core.md](requirements/app-core.md) |
| FR-025 | クロスハイライトとカメラ移動 | 承認済み | MUST | AC-030 | [app-core.md](requirements/app-core.md) |
| FR-026 | 選択に応じた自動の絞り込み | 承認済み | MUST | AC-031 | [app-core.md](requirements/app-core.md) |
| FR-027 | ホバー・クリック・Esc の選択操作 | 承認済み | MUST | AC-032 | [app-core.md](requirements/app-core.md) |
| FR-028 | 選択状態の URL への反映と復元 | 承認済み | MUST | AC-033 | [app-core.md](requirements/app-core.md) |
| FR-029 | キーボード・スクリーンリーダーでの連動 | 承認済み | MUST | AC-034〜AC-035 | [app-core.md](requirements/app-core.md) |
| FR-030 | 階層と LOD のメタデータ | 承認済み | MUST | AC-036 | [app-core.md](requirements/app-core.md) |
| FR-031 | カメラ距離に応じた段階的な表示 | 承認済み | MUST | AC-037〜AC-038 | [app-core.md](requirements/app-core.md) |
| FR-032 | ヒステリシスによるちらつき防止 | 承認済み | MUST | AC-039 | [app-core.md](requirements/app-core.md) |
| FR-033 | パンくずリストとミニマップ | 承認済み | MUST | AC-040 | [app-core.md](requirements/app-core.md) |
| FR-034 | アニメーション停止中の階層の切替 | 承認済み | MUST | AC-041 | [app-core.md](requirements/app-core.md) |
| FR-035 | 2D の地図・ガント・表での段階的な表示 | 承認済み | SHOULD | AC-042 | [app-core.md](requirements/app-core.md) |
| FR-036 | 表示中の階層だけを描画する負荷対策 | 承認済み | MUST | AC-043 | [app-core.md](requirements/app-core.md) |
| FR-037 | ナレッジグラフ（2D/3D） | 承認済み | MUST | AC-044〜AC-045 | [app-core.md](requirements/app-core.md) |
| FR-038 | 課題-解決策分析ビュー | 承認済み | MUST | AC-046 | [app-core.md](requirements/app-core.md) |
| FR-039 | 優先順位分析と重みの変更 | 承認済み | MUST | AC-047〜AC-048 | [app-core.md](requirements/app-core.md) |
| FR-040 | アーキテクチャ図（2D/3D） | 承認済み | MUST | AC-049〜AC-050 | [app-core.md](requirements/app-core.md) |
| FR-041 | エグゼクティブサマリー | 承認済み | MUST | AC-051 | [app-core.md](requirements/app-core.md) |
| FR-042 | 議論ツリー（系統ツリー）ビュー | 承認済み | MUST | AC-052〜AC-053 | [app-core.md](requirements/app-core.md) |
| FR-043 | ミニ・モックアプリ | 承認済み | SHOULD | AC-054 | [app-core.md](requirements/app-core.md) |
| FR-044 | その場でのデータ編集 | 承認済み | MUST | AC-055 | [app-core.md](requirements/app-core.md) |
| FR-045 | 編集の全ビューへの即時反映 | 承認済み | MUST | AC-056 | [app-core.md](requirements/app-core.md) |
| FR-046 | 入力検証・元に戻す・変更履歴・インポート/エクスポート | 承認済み | MUST | AC-057〜AC-058 | [app-core.md](requirements/app-core.md) |
| FR-047 | 編集モードの ON/OFF | 承認済み | MUST | AC-059 | [app-core.md](requirements/app-core.md) |
| FR-048 | 議論テーマの選択と管理 | 承認済み | MUST | AC-060 | [app-core.md](requirements/app-core.md) |
| FR-049 | テーマごとの議論の記録 | 承認済み | MUST | AC-061 | [app-core.md](requirements/app-core.md) |
| FR-050 | 顧客の決定と AI の提案の区別 | 承認済み | MUST | AC-062 | [app-core.md](requirements/app-core.md) |
| FR-051 | 議論データの既定ファイル名での保存と復元 | 承認済み | MUST | AC-063 | [app-core.md](requirements/app-core.md) |
| FR-052 | 常設ボタンとショートカットからの全量エクスポート | 承認済み | MUST | AC-064 | [app-core.md](requirements/app-core.md) |
| FR-053 | エクスポートの出力内容 | 承認済み | MUST | AC-065 | [app-core.md](requirements/app-core.md) |
| FR-054 | 出力範囲・プレビュー・機密確認・形式の選択 | 承認済み | MUST | AC-066〜AC-067 | [app-core.md](requirements/app-core.md) |
| FR-055 | フォローアップ文書の同時生成 | 承認済み | SHOULD | AC-068 | [app-core.md](requirements/app-core.md) |
| FR-056 | エクスポートした Markdown からの復元 | 承認済み | MUST | AC-069 | [app-core.md](requirements/app-core.md) |
| FR-057 | 演出の設定の保存と復元 | 承認済み | MUST | AC-070 | [app-core.md](requirements/app-core.md) |
| FR-058 | Fluent 2 準拠のテーマ | 承認済み | MUST | AC-071 | [app-experience.md](requirements/app-experience.md) |
| FR-059 | ブランドランプの生成と適用 | 承認済み | MUST | AC-072〜AC-073 | [app-experience.md](requirements/app-experience.md) |
| FR-060 | コントラストの自動検証と補正 | 承認済み | MUST | AC-074〜AC-075 | [app-experience.md](requirements/app-experience.md) |
| FR-061 | ロゴの利用条件とプレースホルダー | 承認済み | MUST | AC-076 | [app-experience.md](requirements/app-experience.md) |
| FR-062 | フォントのフォールバックと等幅数字 | 承認済み | MUST | AC-077 | [app-experience.md](requirements/app-experience.md) |
| FR-063 | ブランドトーンの演出への反映 | 承認済み | SHOULD | AC-078 | [app-experience.md](requirements/app-experience.md) |
| FR-064 | 設定パネルでのブランドの確認と上書き | 承認済み | MUST | AC-079 | [app-experience.md](requirements/app-experience.md) |
| FR-065 | 3D 描画とフォールバック | 承認済み | MUST | AC-080 | [app-experience.md](requirements/app-experience.md) |
| FR-066 | 必須の 3D シーン | 承認済み | MUST | AC-081 | [app-experience.md](requirements/app-experience.md) |
| FR-067 | シネマティック表現 | 承認済み | SHOULD | AC-082 | [app-experience.md](requirements/app-experience.md) |
| FR-068 | 3D アセットの権利 | 承認済み | MUST | AC-083 | [app-experience.md](requirements/app-experience.md) |
| FR-069 | 品質プリセットと自動の品質低下 | 承認済み | MUST | AC-084〜AC-085 | [app-experience.md](requirements/app-experience.md) |
| FR-070 | Fluent 2 のモーション | 承認済み | SHOULD | AC-086 | [app-experience.md](requirements/app-experience.md) |
| FR-071 | グローバルのアニメーション停止 | 承認済み | MUST | AC-087 | [app-experience.md](requirements/app-experience.md) |
| FR-072 | 動きを減らす設定での起動 | 承認済み | MUST | AC-088 | [app-experience.md](requirements/app-experience.md) |
| FR-073 | BGM と効果音 | 承認済み | MUST | AC-089〜AC-090 | [app-experience.md](requirements/app-experience.md) |
| FR-074 | ミュートと音量の操作 | 承認済み | MUST | AC-091、AC-193 | [app-experience.md](requirements/app-experience.md) |
| FR-075 | ナレーション中のダッキング | 承認済み | SHOULD | AC-092 | [app-experience.md](requirements/app-experience.md) |
| FR-076 | オープニング | 承認済み | MUST | AC-093 | [app-experience.md](requirements/app-experience.md) |
| FR-077 | 番組構成（チャプター） | 承認済み | MUST | AC-094 | [app-experience.md](requirements/app-experience.md) |
| FR-078 | テロップ/ローワーサード | 承認済み | MUST | AC-095 | [app-experience.md](requirements/app-experience.md) |
| FR-079 | Before/After・ランキング・ROI の演出 | 承認済み | MUST | AC-096 | [app-experience.md](requirements/app-experience.md) |
| FR-080 | AI ナビゲーター | 承認済み | SHOULD | AC-097〜AC-098 | [app-experience.md](requirements/app-experience.md) |
| FR-081 | ショート動画モード | 承認済み | SHOULD | AC-099 | [app-experience.md](requirements/app-experience.md) |
| FR-082 | AI 成熟度クイズとリアクションボタン | 承認済み | MAY | AC-100 | [app-experience.md](requirements/app-experience.md) |
| FR-083 | 演出強度の切替 | 承認済み | MUST | AC-101 | [app-experience.md](requirements/app-experience.md) |
| FR-084 | ショーコントロールバー | 承認済み | MUST | AC-102 | [app-experience.md](requirements/app-experience.md) |
| FR-085 | ショートカット一覧 | 承認済み | MUST | AC-103 | [app-experience.md](requirements/app-experience.md) |
| FR-086 | 無限キャンバスと複数ボード | 承認済み | MUST | AC-104 | [app-experience.md](requirements/app-experience.md) |
| FR-087 | ペン・タッチ・マウスの統一入力 | 承認済み | MUST | AC-105〜AC-106 | [app-experience.md](requirements/app-experience.md) |
| FR-088 | インクの道具 | 承認済み | MUST | AC-107 | [app-experience.md](requirements/app-experience.md) |
| FR-089 | フリーハンドの図形の整形 | 承認済み | MAY | AC-108 | [app-experience.md](requirements/app-experience.md) |
| FR-090 | 手書き文字の認識と反映 | 承認済み | SHOULD | AC-109〜AC-110 | [app-experience.md](requirements/app-experience.md) |
| FR-091 | フローティングツールバーとプレゼン中の注釈 | 承認済み | MUST | AC-111 | [app-experience.md](requirements/app-experience.md) |
| FR-092 | PDF 出力 | 承認済み | MUST | AC-112〜AC-113 | [app-experience.md](requirements/app-experience.md) |
| FR-093 | インクの Markdown 出力 | 承認済み | MUST | AC-114 | [app-experience.md](requirements/app-experience.md) |
| FR-094 | Engagement サマリーパック | 承認済み | SHOULD | AC-115 | [app-experience.md](requirements/app-experience.md) |
| FR-095 | 自動保存・クラッシュからの復旧・大量ストローク | 承認済み | MUST | AC-116〜AC-117 | [app-experience.md](requirements/app-experience.md) |
| FR-096 | エクスポートのプレビューとキーボードだけでの作成 | 承認済み | MUST | AC-118 | [app-experience.md](requirements/app-experience.md) |
| FR-097 | ホワイトボード | 承認済み | MUST | AC-119 | [app-experience.md](requirements/app-experience.md) |
| FR-098 | アプリのデータのカード配置とリンク | 承認済み | MUST | AC-120 | [app-experience.md](requirements/app-experience.md) |
| FR-099 | 付箋のクラスタリング・ドット投票・タイマー | 承認済み | MAY | AC-121 | [app-experience.md](requirements/app-experience.md) |
| FR-100 | 顧客固有情報のコードからの分離 | 承認済み | MUST | AC-122 | [app-experience.md](requirements/app-experience.md) |
| FR-101 | 顧客パックの差し替えだけで動くビルド成果物 | 承認済み | MUST | AC-123 | [app-experience.md](requirements/app-experience.md) |
| FR-102 | 顧客パックの検証と部分的な無効化 | 承認済み | MUST | AC-124 | [app-experience.md](requirements/app-experience.md) |
| FR-103 | 業種プリセット | 承認済み | MUST | AC-125 | [app-experience.md](requirements/app-experience.md) |
| FR-104 | お手本パックでの起動 | 承認済み | MUST | AC-126 | [app-experience.md](requirements/app-experience.md) |
| FR-105 | オフラインで動く配布パッケージ | 承認済み | MUST | AC-127〜AC-128 | [app-experience.md](requirements/app-experience.md) |
| FR-106 | 雛形のバージョン | 承認済み | SHOULD | AC-129 | [app-experience.md](requirements/app-experience.md) |
| FR-107 | セットアップスクリプト | 承認済み | MUST | AC-130〜AC-131 | [app-experience.md](requirements/app-experience.md) |
| FR-108 | セットアップスクリプトの安全性 | 承認済み | MUST | AC-132〜AC-133 | [app-experience.md](requirements/app-experience.md) |
| FR-109 | コンポーネントの移動・大きさの変更・タブ化 | 承認済み | SHOULD | AC-134 | [app-experience.md](requirements/app-experience.md) |
| FR-110 | 既定のレイアウトへの復元 | 承認済み | MUST | AC-135 | [app-experience.md](requirements/app-experience.md) |
| FR-111 | コマンドパレット | 承認済み | SHOULD | AC-136 | [app-experience.md](requirements/app-experience.md) |
| FR-112 | ペルソナ別の既定の情報表現と既定のレイアウト | 承認済み | SHOULD | AC-137〜AC-138 | [app-experience.md](requirements/app-experience.md) |
| FR-113 | 表現が成り立たないときの代替表示 | 承認済み | SHOULD | AC-139 | [app-experience.md](requirements/app-experience.md) |
| FR-114 | 一意の ID と ID による参照 | 承認済み | MUST | AC-140 | [customer-pack.md](requirements/customer-pack.md) |
| FR-115 | 数値・事実の出典 | 承認済み | MUST | AC-141 | [customer-pack.md](requirements/customer-pack.md) |
| FR-116 | 作成者の種別 | 承認済み | MUST | AC-142 | [customer-pack.md](requirements/customer-pack.md) |
| FR-117 | WorkIQ 由来情報の機密区分 | 承認済み | MUST | AC-143 | [customer-pack.md](requirements/customer-pack.md) |
| FR-118 | スキーマとお手本データの同梱 | 承認済み | MUST | AC-144 | [customer-pack.md](requirements/customer-pack.md) |
| FR-119 | 顧客パックのファイル構成 | 承認済み | MUST | AC-145 | [customer-pack.md](requirements/customer-pack.md) |
| FR-120 | Skill のコマンド | 承認済み | MUST | AC-146 | [pipeline.md](requirements/pipeline.md) |
| FR-121 | 事前調査と調査キャッシュ | 承認済み | MUST | AC-147〜AC-148 | [pipeline.md](requirements/pipeline.md) |
| FR-122 | ブランド調査の出典の優先順位と既定テーマ | 承認済み | MUST | AC-149 | [pipeline.md](requirements/pipeline.md) |
| FR-123 | 調査キャッシュの有効期限 | 承認済み | SHOULD | AC-150 | [pipeline.md](requirements/pipeline.md) |
| FR-124 | 雛形の複製 | 承認済み | MUST | AC-151 | [pipeline.md](requirements/pipeline.md) |
| FR-125 | 顧客パックの生成 | 承認済み | MUST | AC-152 | [pipeline.md](requirements/pipeline.md) |
| FR-126 | エラー箇所だけの自己修正 | 承認済み | MUST | AC-153 | [pipeline.md](requirements/pipeline.md) |
| FR-127 | verify（顧客パックの受け入れ判定） | 承認済み | MUST | AC-154〜AC-155 | [pipeline.md](requirements/pipeline.md) |
| FR-128 | 起動 | 承認済み | MUST | AC-156 | [pipeline.md](requirements/pipeline.md) |
| FR-129 | 工程ごとの時間計測 | 承認済み | MUST | AC-157 | [pipeline.md](requirements/pipeline.md) |
| FR-130 | 入力変数の指定 | 承認済み | MUST | AC-158 | [pipeline.md](requirements/pipeline.md) |
| FR-131 | 雛形への改善要望の記録 | 承認済み | SHOULD | AC-159 | [pipeline.md](requirements/pipeline.md) |
| FR-132 | AI 実接続の明示的な有効化（Q-001 回答までの暫定） | 承認済み | MUST | AC-190〜AC-191 | [app-core.md](requirements/app-core.md) |
| NFR-PERF-001 | 顧客パックの生成から起動までの時間 | 承認済み | MUST | AC-160〜AC-161 | [pipeline.md](requirements/pipeline.md) |
| NFR-PERF-002 | 4K 表示での描画性能 | 承認済み | MUST | AC-162 | [quality.md](requirements/quality.md) |
| NFR-PERF-003 | 初回表示の時間 | 承認済み | SHOULD | AC-163 | [quality.md](requirements/quality.md) |
| NFR-PERF-004 | インクの描画遅延 | 承認済み | MUST | AC-164 | [quality.md](requirements/quality.md) |
| NFR-ENV-001 | 対応ブラウザーと端末 | 承認済み | MUST | AC-165〜AC-166 | [quality.md](requirements/quality.md) |
| NFR-ENV-002 | 外部サーバーなし・オフラインでの動作 | 承認済み | MUST | AC-167 | [quality.md](requirements/quality.md) |
| NFR-L10N-001 | 日本語の UI | 承認済み | MUST | AC-168 | [quality.md](requirements/quality.md) |
| NFR-A11Y-001 | WCAG 2.2 AA・キーボード・スクリーンリーダー・字幕 | 承認済み | MUST | AC-169〜AC-171 | [quality.md](requirements/quality.md) |
| NFR-A11Y-002 | 演出をすべて OFF にしたときの利用 | 承認済み | MUST | AC-172 | [quality.md](requirements/quality.md) |
| NFR-A11Y-003 | 視覚的な表現の代替 | 承認済み | MUST | AC-173 | [quality.md](requirements/quality.md) |
| NFR-A11Y-004 | ドラッグ以外の操作手段 | 承認済み | MUST | AC-174 | [quality.md](requirements/quality.md) |
| NFR-SEC-001 | API キーの管理 | 承認済み | MUST | AC-175 | [quality.md](requirements/quality.md) |
| NFR-SEC-002 | 外部への通信の限定と明示 | 承認済み | MUST | AC-176 | [quality.md](requirements/quality.md) |
| NFR-SEC-003 | 調査キャッシュと顧客パックの保護 | 承認済み | MUST | AC-177〜AC-178 | [quality.md](requirements/quality.md) |
| NFR-LEGAL-001 | 素材の権利と CREDITS | 承認済み | MUST | AC-179 | [quality.md](requirements/quality.md) |
| NFR-LEGAL-002 | サンプル・AI 生成・モックの明示と商標 | 承認済み | MUST | AC-180〜AC-181 | [quality.md](requirements/quality.md) |
| NFR-MAINT-001 | 型の厳格さと部品とスキーマの分離 | 承認済み | MUST | AC-182 | [quality.md](requirements/quality.md) |
| NFR-MAINT-002 | 雛形の回帰テスト | 承認済み | MUST | AC-183 | [quality.md](requirements/quality.md) |
| NFR-MAINT-003 | README | 承認済み | MUST | AC-184 | [quality.md](requirements/quality.md) |
| NFR-UX-001 | レイアウト・表現の切替で状態を失わない | 承認済み | MUST | AC-185 | [quality.md](requirements/quality.md) |
| NFR-UX-002 | 狭い画面と高い拡大率での縮退 | 承認済み | SHOULD | AC-186 | [quality.md](requirements/quality.md) |
| NFR-UX-003 | 時間のかかる処理の進行表示 | 承認済み | SHOULD | AC-187 | [quality.md](requirements/quality.md) |
| NFR-UX-004 | エラーの原因と次の行動 | 承認済み | SHOULD | AC-188 | [quality.md](requirements/quality.md) |
| NFR-UX-005 | OS と利用者の表示設定への追従 | 承認済み | SHOULD | AC-189 | [quality.md](requirements/quality.md) |
| FR-133 | 分析手法の選択と開始 | 承認済み | MUST | AC-195〜AC-196 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-134 | パラメーターの編集と結果の更新 | 承認済み | MUST | AC-197〜AC-199 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-135 | ビュアーの切替と結果の確認 | 承認済み | MUST | AC-200〜AC-201 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-136 | 業務改善ステッパー | 承認済み | MUST | AC-202〜AC-204 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-137 | 企業の登録と複数 Project の管理 | 承認済み | MUST | AC-205〜AC-208 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-138 | Project の切替とデータの分離 | 承認待ち | MUST | AC-209〜AC-210 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-139 | 企業・Project の識別子と正本 | 承認待ち | MAY | AC-211 | [analysis-projects.md](requirements/analysis-projects.md) |
| FR-140 | 分析結果の AI 下書き | 承認待ち | MAY | AC-212〜AC-213 | [analysis-projects.md](requirements/analysis-projects.md) |
| NFR-UX-006 | 分析画面のレイアウト変更 | 承認待ち | SHOULD | AC-214〜AC-215 | [analysis-projects.md](requirements/analysis-projects.md) |
| NFR-A11Y-005 | 視覚表現の代替と状態の非色依存 | 承認済み | MUST | AC-216〜AC-217 | [analysis-projects.md](requirements/analysis-projects.md) |
| NFR-SEC-004 | Project のアクセス範囲 | 承認待ち | MUST | AC-218 | [analysis-projects.md](requirements/analysis-projects.md) |

## 7. ワークスペースとペルソナ別の情報表現

レイアウト変更の要求: FR-013（最大化・通常・非表示）、FR-014（ドックからの再表示とペルソナ別の保存・復元）、FR-109（移動・方向・大きさ・タブ化）、FR-110（既定への復元）、FR-111（コマンドパレット）、NFR-A11Y-004（ドラッグ以外の手段）、NFR-UX-001（切替で状態を失わない）、NFR-UX-002（狭い画面での縮退）。保存の単位は「ブラウザー×ペルソナ」、保存先はブラウザーの localStorage（依頼原文 FR-UI-03 で決定済み）。名前を付けた複数のレイアウトと共有は §10.5 の提案・仮説。

同じデータの表現の切替: エンティティ関係グラフと選択状態を共有し（FR-024）、選択・絞り込み・期間が連動して保たれる（FR-025〜FR-029、NFR-UX-001）。表現が成り立たないデータの扱いは FR-113、視覚的な表現の代替は NFR-A11Y-003。複数のペルソナを兼ねる利用者は、ペルソナ別ビューを切り替えて使う（既定は前回選んだペルソナ。初回は経営層。[ASSUMPTION] A-13）。ファシリテーターとテンプレート保守者は、ペルソナ別ビュー（FR-015 の 4 つ）の切替対象ではない。ファシリテーターの既定の情報表現はプレゼンテーションモード（FR-016）で、どのペルソナ別ビューからでも開始でき、終えると元のペルソナ別ビューに戻る（監査 G-01 の解消。決定記録 §9）。

| ペルソナ | 最も多い操作 | 主要な判断 | 使うデータ | 既定の情報表現と理由 | キャンバスの採否と理由 | 既定のレイアウト | 代替手段 | 出典 |
|---|---|---|---|---|---|---|---|---|
| ファシリテーター | チャプターを進める、手書きで書き込む、エクスポートする | どの議題を深掘りするか | 全データ | プレゼンテーションモード（番組構成と進行バー）。会議の進行そのものが業務のため | 採用: 議題間を行き来し、注釈・付箋を自由に置くため（FR-012、FR-086、FR-097）。配置は保存する | 中央にキャンバス、上に進行バー、下にショーコントロールバー、横にドック | ショートカット一覧・コマンドパレット・キーボード操作 | SRC-001 §3・§5.1 |
| 経営層 | 優先順位を見比べ、重みを変える | 投資の優先順位と順序 | 優先順位、ROI・コスト、KPI | 2×2 マトリクス（インパクト×実現性）とエグゼクティブサマリー、3D KPI タワー。トレードオフと結論を一目で判断するため | 不採用（キャンバスは背景の全体図として残すが、既定の前面は分析ビュー）: 経営層は自由配置より結論と比較を求めるため | 上段にエグゼクティブサマリー、主領域に 2×2 マトリクス、横にランキング表 | ランキング表（NFR-A11Y-003）、サマリーの文 | SRC-001 §5.5、SRC-005 |
| 事業部門 | 課題から原因・解決策をたどる | 課題と解決策の妥当性 | 課題-解決策の関係、議論ツリー | イシューツリー/サンキー図の課題-解決策分析と議論ツリー。課題→原因→解決策の因果を追う判断のため | 不採用: 構造化された因果の図の方が判断に向くため | 主領域に課題-解決策分析、横に議論ツリー、下にガントと表（A-30） | 表（課題・原因・解決策の一覧。既定のレイアウトにも含む） | SRC-001 §5.5、SRC-007 |
| IT | AsIs と ToBe を切り替えて差分を見る | 既存環境との適合と実現性 | アーキテクチャ、製品、ナレッジグラフ | アーキテクチャ図（C4/ブロック図と 3D レイヤー積層）の AsIs/ToBe 差分とナレッジグラフ。システムの構成と依存を段階的に詳しく見る判断のため | 不採用: 構成図とグラフの方が依存関係の判断に向くため | 主領域にアーキテクチャ図、横にナレッジグラフ、下に Microsoft 製品の一覧 | 要素と関係の表、Mermaid のテキスト | SRC-001 §5.5、SRC-006 |
| 現場 | 中核オブジェクトとモックを見て、作業の変化を確かめる | 日々の作業がどう変わるか | 中核オブジェクト（3D/地図/図面）、モック、工程 | 中核オブジェクトの 3D デジタルツイン（モノ）または地図（コト）とミニ・モックアプリ。現物や場所に結び付けて変化を理解するため | 不採用: 現物の表現とモックの方が作業の理解に向くため | 主領域に 3D/地図、横にミニ・モックアプリ、下にガント | 部品・拠点の表、2D 図面、モックの画面説明 | SRC-001 §5.2・§5.5、SRC-007 |
| テンプレート保守者 | 検証エラーを確かめる | 変更が顧客パックを壊さないか | スキーマ、verify の結果 | 画面上はアプリ内の表示を使わず、検証エラーの一覧（FR-102）とコマンドの出力で判断する | 不採用: 保守はコマンドと検証の結果で行うため | 既定のレイアウトは設けない（初回のペルソナ別ビュー（A-13）とプレゼンテーションモードを使う） | コンソールとログ | SRC-001 §9・§12 |

表のペルソナごとの既定の情報表現・キャンバスの採否・既定のレイアウトは AI提案で、FR-112 として包括承認した（§9）。調査は外部検索の要旨（SRC-005〜SRC-007）にもとづく仮説で、業界の慣習の一般論であり、顧客ごとの検証はしていない。

### 7.x 分析・Project 画面（FR-133〜FR-140、NFR-UX-006）

レイアウト変更の要求: NFR-UX-006。ペルソナ別の既定は次のとおり（調査は未実施で仮説。AUD-31）。キャンバスは今回の範囲では採用しない（再評価は将来）。

| ペルソナ | 最も多い操作 | 主要な判断 | 使うデータ | 既定の情報表現と理由 | キャンバス | 既定のレイアウト | 代替手段 | 出典 |
|---|---|---|---|---|---|---|---|---|
| 事業企画担当 | パラメーター編集 | 優先課題 | 手法の入力値 | マトリクス（SWOT 等の分類の判断に適する。仮説） | 不採用 | 入力を左、結果を右 | 表（AC-216） | SRC-010（仮説） |
| 業務改善リーダー | Project 切替とステップ確認 | 進行の遅れ | ステップの状態 | ステッパー（工程の流れを示す。仮説） | 不採用 | ステッパーを上部に常設 | 文字ラベル（AC-217） | SRC-010（仮説） |
| 経営層・意思決定者 | 結果の確認 | 施策の採否 | 結果の要約 | グラフ（数量の比較。仮説） | 不採用 | 結果の要約を最大化 | 表（AC-216） | SRC-010（仮説） |

ペルソナごとの表示は利便性のためで、アクセス制御ではない（NFR-SEC-004）。

## 8. 外部連携とマスター・ID

| 連携先 | 方式 | やり取りする情報（方向・頻度） | 使う場所 | 備考 |
|---|---|---|---|---|
| GitHub Copilot SDK（LLM） | 中継プロセスからの SDK 呼び出し（ブラウザー → localhost の中継プロセス → Copilot） | 議論の内容・顧客パックの一部を送り、構造化・要約・回答を受け取る。利用者の操作のたび | アプリ（FR-010、FR-011）、生成パイプライン（FR-121、FR-125） | 送信の条件は Q-001。回答までは、アプリは利用者が明示的に有効にした場合だけ送る（FR-132）。未接続時はモック |
| WorkIQ | Copilot Skill からの検索 | 顧客名で社内情報を検索し、要旨を受け取る。`research` のたび | 生成パイプライン（FR-121） | 使えない場合は Web → サンプル。機密区分を付ける（FR-117） |
| Web（公式サイト・プレスキット・IR 資料） | Copilot Skill からの検索・取得 | 顧客名・ブランドで検索し、公開情報を受け取る。`research` のたび | 生成パイプライン（FR-121、FR-122） | 非公式サイトは使わない |
| 音声合成・手書き認識の AI API | 未決定 | 台本・手書きの画像を送り、音声・文字を受け取る | アプリ（FR-080、FR-090） | 接続先と認証は Q-002。未設定時はモック |

マスター・ID: 顧客の本番システムとの連携は対象外（§2）のため、外部のマスターはない。顧客パックの中の ID（課題・解決策・拠点など）は、生成パイプラインがパックの中で一意になるように採番し（FR-114）、正本は顧客パックのファイルである。顧客名・Project 名は利用者の入力（FR-130）を正本とする。自システムで採番する理由: 実データを取り込まず、サンプルを題材にするため。対応表の保守者はいない（不要）。

企業・Project の識別子と正本は FR-139（連携先は未確認。Q-010）。

## 9. 決定記録

| 日付 | 対象 ID | 決定 | 根拠（依頼・Q・承認依頼・包括承認） | run-id |
|---|---|---|---|---|
| 2026-10-09 | FR-001〜FR-108、FR-114〜FR-131、NFR-PERF-001〜004、NFR-ENV-001〜002、NFR-L10N-001、NFR-A11Y-001〜002、NFR-SEC-001〜003、NFR-LEGAL-001〜002、NFR-MAINT-001〜003、PARAM-001〜009・011〜022 | ドラフト（SRC-001）の要求を、意味を変えずに構造化して承認済みとした。優先度は Must→MUST、Should→SHOULD、Could→MAY | 依頼 2026-10-09（「このアプリケーションを実装してください」とドラフトの指定） | 202610090557 |
| 2026-10-09 | FR-109〜FR-113、NFR-A11Y-003〜004、NFR-UX-001〜005、PARAM-010・023〜029、§7 の表、[ASSUMPTION] A-01〜A-14 | ui_policy の具体化と、ドラフトにない閾値・細部を推奨案で承認済みとした。利用者データ・権限・セキュリティ・課金・法令・外部公開・ID の体系・取り消せない操作に触れず、PARAM の変更や表示の変更で戻せ、承認済みの要求と競合しないことを確かめた | 包括承認 2026-10-09・approval_policy（安全範囲は推奨どおり） | 202610090557 |
| 2026-10-09 | AC-011、AC-098、AC-110、AC-148、AC-161 | 実際の Copilot・WorkIQ・音声・手書き認識の接続での確認は、Q-001・Q-002 の回答まで BLOCKED とした。モック・差し替え部品で検証する受入基準は有効 | 既定制約 C-07、Q-001、Q-002 | 202610090557 |
| 2026-10-09 | AC-073、AC-155、[ASSUMPTION] A-18 | 監査 D-01 の解消: verify のコントラストの項目は FR-060 の補正後の実効色で判定し、元の値の不足は警告として報告する。FR-060・FR-127 の本文は変えず、受入基準を揃えた。ドラフト §13.2 AC-03 は表示の状態の判定と読んだ | 包括承認 2026-10-09・approval_policy（表示・検査の判定だけで、A-18 の変更で戻せる） | 202610090557 |
| 2026-10-09 | AC-166 | 監査 D-02 の解消: FR-087（依頼原文 FR-IK-02「ペンは描画・指はパン/ズーム」）に合わせ、iPad での確認を「ペンの描画、指のパン/ズーム」に直した。指で描くモードは §10.5 の提案・仮説 | 依頼 2026-10-09（FR-087 の文面に合わせる事実の訂正） | 202610090557 |
| 2026-10-09 | FR-132、AC-190〜AC-191、[ASSUMPTION] A-15 | 監査 C-01 の解消: Q-001 の回答まで、アプリの AI 接続の既定をモックとし、利用者が明示的に有効にしたときだけ接続する。外部送信を減らす側だけの暫定で、Q-001 の推奨 A と同じ。プライバシーに関わるが、送信を増やさず、Q-001 の回答で廃止・変更できるため推奨案で決めた（利用者は次回の `<answers>` で却下できる） | 包括承認 2026-10-09・approval_policy（conductor の依頼 2026-10-09） | 202610090557 |
| 2026-10-09 | AC-192、AC-193、[ASSUMPTION] A-16・A-17・A-19、§7 の表（ファシリテーター・テンプレート保守者の行と本文）、§3.4 の用語、§3.5 の標準の検証条件 | 監査 C-02（矢印キーの優先）、C-03（ミュート解除の意味）、G-01（ファシリテーターはプレゼンテーションモードが既定でペルソナ別ビューの切替対象外）、G-02（お手本パックはモノ・コトの 2 件と検査用の変種）を推奨案で解消した。承認済み要求の本文は変えていない | 包括承認 2026-10-09・approval_policy | 202610090557 |
| 2026-10-09 | AC-122、[ASSUMPTION] A-20（AC-126 は参照のみ） | 実装者 I27 が報告した競合（AC-122「dist/ にお手本パックの顧客名が含まれない」と AC-126「`public/data/` が空ならお手本の企業名で起動」は、同じ dist/ を配信する System Test で両立しない）を解消した。お手本パックは `dist/example-pack/` にデータとして同梱し、AC-122 の対象を「コード（JS・CSS・HTML）への直書きの禁止」と明確にして `dist/example-pack/` 配下を対象外とした。AC-126 の本文は変えない（台帳の ac_digests と System Test を動かさないため。AC-126 は「お手本パックで起動する」ことだけを求め、データの置き場所を指定しないので A-20 と矛盾しない）。FR-100・FR-104 の本文も変えていない（FR-100 の目的はコードからの分離で、データの同梱は禁じていない）。顧客固有情報のコードへの混入を防ぐ目的は保たれる。影響: AC-122 は integration（tests/unit/foundation.test.ts を実装側で合わせる）。System Test（E2E-097）は、`dist/example-pack/` から起動する形で検証する | 包括承認 2026-10-09・approval_policy（conductor の依頼 2026-10-09。外部公開・権限・データに触れず、A-20 で戻せる。承認済み AC の文面の明確化なので、利用者は次回の `<answers>` で却下できる） | 202610090557 |
| 2026-10-10 | FR-124・AC-151、FR-084、FR-102、FR-131・AC-159、FR-018・FR-019・§3.6、FR-026・FR-047・AC-194、FR-079、[ASSUMPTION] A-04 の補足、A-21〜A-27 | 実装者が報告した「要求定義書との食い違い・未定義」を、実装済みの挙動に合わせて文面を明確化して解消した（要求の意図は変えない）: ①複製はリンクによる共有を含む（A-21）②ミュートは常時表示のドックに残す（A-22）③部分的な無効化は参照切れを連鎖する（A-23）④改善要望の記録先と書式（A-24）⑤中核オブジェクトと用語集の任意項目（A-26）⑥編集モード ON では減光（A-27）⑦優先順位分析パネルの上位 5 件（A-25）⑨Esc の重なり判定の対象（A-04）。FR-100・AC-122・FR-104・AC-126 は A-20 で整理済みのため変更なし（再確認）。FR-050 は UI の詳細（提案本文だけを置き見出しは欄の外）で、要求の意図に影響しないため変更しない。影響: AC-151・AC-159 の文面が変わる（integration）。system の AC-096・AC-102・AC-124 は台帳の ac_digests と System Test を動かさないため、本文を変えず、FR-079・FR-084・FR-102 の本文と A-22・A-23・A-25 で明確化した（A-20 と同じ扱い。AC の文面を揃える場合は test-designer が台帳を見直してから別途依頼する）。AC-194 を integration で追加 | 包括承認 2026-10-10・approval_policy（conductor の依頼 2026-10-10。実装済みの挙動の明確化で、権限・個人情報・課金・外部公開・ID の体系に触れず、各 [ASSUMPTION] の変更で戻せる。承認済み AC の文面の明確化なので、利用者は次回の `<answers>` で却下できる） | 202610090557 |
| 2026-10-10 | FR-112・§7 の事業部門の行・A-30 | 実装者 J03 が事業部門の既定のレイアウトに表（table）を加えた（layoutModel）。FR-112 の本文と §7 の表に表を含める旨を明記した（AC-137・AC-138 の文面は変えない）。影響: AC-135・AC-185（IT-013）が前提とする。情報表現の既定は変わらないため、FR-112 のペルソナ別既定の表と整合 | 包括承認 2026-10-10・approval_policy（既定の構成の明確化で、権限・個人情報・課金・外部公開・ID の体系に触れず、戻せる） | 202610090557 |
| 2026-10-10 | FR-102・A-23（F-02）、FR-132・FR-010・FR-011・§3.4・§3.5・A-29（F-03）、§3.5・A-28（F-01）、§3.5 の 3D 品質・3D シーン（F-04 の一部・F-12） | 最終監査の確度高の HIGH 3 件を、AC の本文を変えずに解消した: ①AC-124 の「その課題以外はすべて表示」は、不正な項目と依存する項目を除くすべてと読む（FR-102・A-23）②「接続済み」は、設定で実接続を明示的に有効にして確認した後の状態を指す（FR-132・§3.4・§3.5・A-29。AC-011・AC-176 はこの前提）③`internal` は既定では画面・エクスポートに出さず、匿名化 ON のエクスポートか確認後のプレゼン開始で扱う（§3.5・A-28）。Q-008 の回答まで、匿名化 OFF では出さない側の暫定。④§3.5 の 3D 品質（Low／Medium／High／Ultra）と描画方式（WebGPU／WebGL2）を FR-065・FR-069 に揃え、{PARAM-027}／{PARAM-028} の参照を直した。影響確認: AC-124・AC-176 は system、AC-011 は manual で、台帳（ac_digests）と System Test は動かさない | ①②は出力・送信を減らす側の暫定（Q-008・Q-001 の推奨と同じ側）で、承認済み AC の文面の明確化として包括承認 2026-10-10・approval_policy。ただし ③の A-28 は顧客情報の扱い（プライバシー）に触れるため、包括承認の対象としてではなく、Q-008 の回答までの暫定として記録する（利用者の確認が必要） | 202610090557 |
| 2026-10-10 | FR-112・§7 の事業部門の行・A-30、AC-113・A-31 | 最終転記（run 202610100952）: ①事業部門の既定のレイアウトに表を含める（実装 layoutModel の下段はガントと表。FR-110 AC-135 と整合）は、2026-10-10 の決定（A-30）のとおり §7・FR-112 に反映済みで、今回の追加変更はない。パネルの寸法の比率は書かない（実装の詳細）②この run で包括承認した項目（上の 2026-10-09・2026-10-10 の各行）を決定記録に残した ③未解決: AC-113（PDF の目視）は manual のまま（A-31） | 包括承認 2026-10-10・approval_policy（決定の転記と、検証方法を変えない記録だけで、戻せる） | 202610100952 |
| 2026-10-12 | FR-133〜FR-137 | 承認 | 依頼 | 202610121323 |
| 2026-10-12 | PARAM-030〜PARAM-032、NFR-A11Y-005 | 承認 | 包括承認 2026-10-12・202610121323 | 202610121323 |

## 10. 仮定・未解決事項

### 10.1 質問票

| ID | 重要度 | 質問 | 選択肢 | 推奨 | 状態 | 回答 |
|---|---|---|---|---|---|---|
| Q-001 | 高 | 顧客情報（顧客名・議論の内容・顧客パック）を Copilot SDK・WorkIQ・Web 検索に送ってよい条件 | A: 顧客の了承を得た案件だけ実接続を有効にし、既定はモック／B: 常に実接続／C: 実接続しない（モックだけ） | A | 未回答 | |
| Q-002 | 高 | 音声合成・手書き認識の接続先と認証方式 | A: 初回リリースはモックだけにし、接続部品の差し替え口だけ用意する／B: Azure AI Speech・Azure AI Vision を `.env` の API キーで使う／C: ブラウザー内蔵の音声機能を使う | A | 未回答 | |
| Q-003 | 中 | インク・ホワイトボードの実装方式 | A: perfect-freehand など寛容なライセンスの部品で自作する／B: tldraw をライセンスを取得して使う | A | 未回答 | |
| Q-004 | 中 | 調査キャッシュの保存場所 | A: 利用者の PC のローカルだけ（`.gitignore`）／B: 社内の安全なストレージ | A | 未回答 | |
| Q-005 | 低 | 業種プリセットの初期セットの優先順位 | A: 5 業種を同時に用意する（実装順は製造→物流→小売→金融→公共）／B: 利用者が指定する業種を先に作る | A | 未回答 | |
| Q-006 | 低 | 雛形の配布方法 | A: このリポジトリをテンプレートとし、`node_modules` 同梱の ZIP も作れるようにする／B: 社内 GitHub のテンプレートリポジトリだけ／C: ZIP 配布だけ | A | 未回答 | |
| Q-007 | 中 | ドラフト §16 R0 の既存の `c:\Work4` の資産を流用するか | A: 流用せず、このリポジトリで新しく作る／B: `c:\Work4` をリポジトリに取り込んでから改修する | A | 未回答 | |
| Q-008 | 中 | エクスポート時の匿名化の規則（`internal` の情報） | A: `internal` の値を丸ごと「［社内情報・匿名化］」に置き換える／B: 人名・メール・電話番号・社内文書名だけを置き換える／C: `internal` の項目を出力から除く | A | 未回答 | |
| Q-009 | 高 | 企業・Project のデータの保存先・共有範囲・権限（利用者データ・認証に関わる。既定制約 C-01「認証・権限はない」との関係を含む）。レイアウトの保存単位も含む | A: 端末内のみ（共有・権限なし。C-01 と整合）／B: サーバー保存し企業単位で権限管理（C-01 の変更が必要）／C: ファイル書き出しでの受け渡し | A | 未回答 | |
| Q-010 | 中 | 企業・Project の識別子の正本と連携先（マスター・ID に関わる） | A: 自システムで採番し外部連携なし／B: 既存の顧客マスターの ID を使う | A | 未回答 | |
| Q-011 | 中 | AI 下書きで、入力内容を外部の AI サービスへ送ってよいか（プライバシーに関わる。FR-132・A-15 と整合させる） | A: 送らない（FR-140 を却下）／B: 利用者が企業ごとに許可した場合のみ送る | B | 未回答 | |

#### 詳細: Q-001 顧客情報を外部の AI・検索に送る条件
- 質問事項の詳細な説明: ドラフト §17 Q-6 で「顧客情報を Copilot に送信してよいか（顧客の了承とデータの取り扱い）」が未決定。FR-010・FR-011・FR-121・FR-125 は実接続を前提にするが、送ってよい情報の範囲と了承の要否はプライバシーと契約に関わり、調べても決まらない。決まらないと、実際の Copilot での動作確認（AC-011）、実際の調査（AC-148）、KPI-1 の実測（AC-161）ができない。
- 妥当な選択肢:
  - A: 顧客の了承を得た案件だけ実接続を有効にし（設定で明示的に ON）、既定はモック。影響: 実装は設定 1 つと表示の追加で小さい。漏えいの危険が最も小さく、後から B に広げやすい。
  - B: 常に実接続。影響: 準備が最も速いが、了承のない案件で顧客情報が送られる危険がある。元に戻すには運用の変更が要る。
  - C: 実接続しない（モックだけ）。影響: LLM の価値（FR-010）が得られず、G-001・G-003 の達成が難しい。
- 最良と考える選択: A
- その選択が最良である理由: NFR-SEC-002 は送信の明示を、NFR-SEC-003 は機密確認を求めており（SRC-001 §12）、了承を前提に有効にする A がこれと最も整合する。既定がモックなので、了承の取り忘れでも送信されない。残るリスクは了承の記録の運用で、利用者の判断が要る。
- 回答までの扱い: 要求は承認済みのまま、実接続の受入基準（AC-011、AC-148、AC-161）を BLOCKED にする。モックと差し替え部品の受入基準は有効。アプリは推奨 A と同じ側の暫定として、既定をモックにし、利用者が明示的に有効にしたときだけ接続する（FR-132、2026-10-09 追加）。B・C が選ばれたら FR-132 を廃止または変更する。

#### 詳細: Q-002 音声合成・手書き認識の接続先
- 質問事項の詳細な説明: ドラフト §17 Q-4 で LLM 以外の AI API の接続先と認証方式が未決定（FR-080、FR-090）。課金と外部送信に関わる。決まらないと実際の音声・認識の確認（AC-098、AC-110）ができない。
- 妥当な選択肢:
  - A: 初回はモックだけにし、接続部品の差し替え口だけ用意する。影響: 費用なし。後から B・C を足せる。
  - B: Azure AI Speech・Azure AI Vision を `.env` の API キーで使う。影響: 有料。キーの管理が要る（NFR-SEC-001）。
  - C: ブラウザー内蔵の音声機能を使う。影響: 無料だが、ブラウザーによって外部に送信される場合があり、日本語の手書き認識はない。
- 最良と考える選択: A
- その選択が最良である理由: ドラフトの優先度は FR-080・FR-090 とも Should で、未設定時のモックは依頼原文に含まれる。この run は有料サービスを使わない（C-07）ため、A で機能の骨格を先に作り、接続先は費用と送信の条件（Q-001）と合わせて決めるのが手戻りが少ない。
- 回答までの扱い: AC-098、AC-110 を BLOCKED にする。モックの受入基準は有効。

#### 詳細: Q-003 インク・ホワイトボードの実装方式
- 質問事項の詳細な説明: ドラフト §17 Q-1・§14。tldraw は商用利用にライセンスが必要な場合がある。ライセンスと費用に関わる。
- 妥当な選択肢:
  - A: perfect-freehand など寛容なライセンス（MIT など）の部品で自作する。影響: 実装の量は増えるが費用なし。
  - B: tldraw をライセンスを取得して使う。影響: 機能は早くそろうが、費用と契約が要る。
- 最良と考える選択: A
- その選択が最良である理由: ライセンスが確認できるまで tldraw を採用しないことが §14 の制約で、A はその制約を満たしたまま実装を進められる。B に切り替える場合も、要求（FR-086〜FR-099）は変わらない。
- 回答までの扱い: [ASSUMPTION] A-01 として A で進める（BLOCKED にしない）。

#### 詳細: Q-004 調査キャッシュの保存場所
- 質問事項の詳細な説明: ドラフト §17 Q-2。社内情報を含むキャッシュの保管はセキュリティに関わる。
- 妥当な選択肢:
  - A: 利用者の PC のローカルだけ（`.gitignore` 済み）。影響: 共有できないが、漏えいの範囲が最も小さい。
  - B: 社内の安全なストレージ。影響: チームで共有できるが、外部への書き込みと権限の設計が要る。
- 最良と考える選択: A
- その選択が最良である理由: NFR-SEC-003 と C-01（ローカル完結）に合い、B は後から追加できる。
- 回答までの扱い: [ASSUMPTION] A-02 として A で進める。

#### 詳細: Q-005 業種プリセットの優先順位
- 質問事項の詳細な説明: ドラフト §17 Q-3。FR-103 で 5 業種は必須と決まっているため、残るのは作る順序だけ。
- 妥当な選択肢:
  - A: 5 業種を同時に用意する（実装順は製造→物流→小売→金融→公共）。影響: リリースは 5 業種がそろってから。
  - B: 利用者が指定する業種を先に作る。影響: 早く使えるが、指定を待つ。
- 最良と考える選択: A
- その選択が最良である理由: 5 業種は依頼原文の Must で、順序は後から変えても他の要求に影響しない。モノ（製造）とコト（物流）を先に作ると FR-020・FR-021 の両方の表現を早く確かめられる。
- 回答までの扱い: [ASSUMPTION] A-06 として A で進める。

#### 詳細: Q-006 雛形の配布方法
- 質問事項の詳細な説明: ドラフト §17 Q-5。外部公開（公開リポジトリにするか）に関わる可能性がある。
- 妥当な選択肢:
  - A: このリポジトリをテンプレートとし、`node_modules` 同梱の ZIP も作れるようにする。影響: 両方の配布に対応できる。
  - B: 社内 GitHub のテンプレートリポジトリだけ。影響: オフラインの配布（FR-105）がやりにくい。
  - C: ZIP 配布だけ。影響: 更新の追跡がしにくい。
- 最良と考える選択: A
- その選択が最良である理由: FR-105（オフラインで動く配布）と NFR-MAINT-002（回帰テスト）を両立でき、公開範囲は変えない。
- 回答までの扱い: [ASSUMPTION] A-07 として A で進める。公開範囲は変えない。

#### 詳細: Q-007 既存の `c:\Work4` の資産
- 質問事項の詳細な説明: ドラフト §16 R0 は「既存の `c:\Work4` を、データを読み込む作りに変える」とするが、このリポジトリからは参照できない（読めた範囲: なし）。
- 妥当な選択肢:
  - A: 流用せず、このリポジトリで新しく作る。影響: 初期の作業は増えるが、要求とコードの対応を最初から保てる。
  - B: `c:\Work4` をリポジトリに取り込んでから改修する。影響: 既存の機能を早く使えるが、取り込みまで作業が止まる。
- 最良と考える選択: A
- その選択が最良である理由: 参照できない資産を前提にすると作業が止まり、P-3（品質の不安定）を持ち込む危険がある。B を選ぶ場合も、要求は変わらない。
- 回答までの扱い: [ASSUMPTION] A-07 として A で進める。

#### 詳細: Q-008 匿名化の規則
- 質問事項の詳細な説明: FR-054・FR-117 は `internal` の情報の匿名化を求めるが、置き換える範囲が決まっていない。プライバシーに関わる。
- 妥当な選択肢:
  - A: `internal` の値を丸ごと「［社内情報・匿名化］」に置き換える。影響: 情報は減るが、漏れが最も起きにくい。
  - B: 人名・メール・電話番号・社内文書名だけを置き換える。影響: 情報が残るが、検出漏れの危険がある。
  - C: `internal` の項目を出力から除く。影響: 出力の構成が変わり、復元（FR-056）で欠ける。
- 最良と考える選択: A
- その選択が最良である理由: 最も保守的で、検出の精度に依存しない。B への変更は匿名化の関数の差し替えで済む。
- 回答までの扱い: [ASSUMPTION] A-08 として A で進める（最も保守的なため BLOCKED にしない）。

### 10.2 承認依頼

承認待ち・保留の要求は 2026-10-12 追加分（下表）だけです。包括承認した項目は §9 にあり、利用者は次回の依頼の `<answers>` で却下・修正できます。影響の大きい順: FR-132（AI の実接続の既定をモックにする暫定。Q-001 と一緒に判断。A-29 で「接続済み」の意味を明記）、A-28（`internal` の扱いの暫定。Q-008 と一緒に判断）、NFR-A11Y-003・NFR-A11Y-004・NFR-UX-001・FR-110（MUST）、A-18（verify のコントラストの判定）、FR-112（§7 の表）、FR-109・FR-111・FR-113、NFR-UX-002〜005、A-15〜A-17・A-19、PARAM-010・023〜029。

未回答の質問票（2026-10-10 時点で 8 件。重要度順）: 高 Q-001（顧客情報を外部の AI・検索に送る条件。FR-132・A-15・A-29 の暫定、AC-011・AC-148・AC-161 が BLOCKED）、高 Q-002（音声・手書き認識の接続先。AC-098・AC-110 が BLOCKED）、中 Q-008（匿名化の規則。A-08・A-28 の暫定）、中 Q-003（インクの実装方式。A-01）、中 Q-004（調査キャッシュの保存場所。A-02）、中 Q-007（`c:\Work4` の流用。A-07）、低 Q-005（業種プリセットの順序。A-06）、低 Q-006（雛形の配布方法。A-07）。回答は次回の `<answers>` に「Q-###: 記号」で書く。

承認依頼（2026-10-12 追加。影響の大きい順）:

| 要求 ID | 題名 | 利用者が決めること | 推奨 | 決めないと実装できない範囲 | 影響 |
|---|---|---|---|---|---|
| FR-138 | Project の切替とデータの分離 | 承認するか | 承認 | AC-209、AC-210 | 大 |
| NFR-SEC-004 | Project のアクセス範囲 | 承認と Q-009（C-01 との関係） | 修正して承認 | AC-218 | 大 |
| FR-140 | 分析結果の AI 下書き | 承認するか（Q-011） | 修正して承認 | AC-212、AC-213 | 中 |
| NFR-UX-006 | 分析画面のレイアウト変更 | 承認と保存単位（Q-009） | 承認 | AC-214、AC-215 | 中 |
| FR-139 | 企業・Project の識別子と正本 | Q-010 | 承認 | AC-211 | 小 |

### 10.3 [ASSUMPTION]・TBD・競合

| 番号 | 内容 | 根拠 | 影響 | 覆す条件 |
|---|---|---|---|---|
| A-01 | インク・ホワイトボードは寛容なライセンスの部品で自作し、tldraw は採用しない | C-06、Q-003 の推奨 | 実装の量 | Q-003 で B |
| A-02 | 調査キャッシュは利用者の PC のローカルだけに置く | C-01、NFR-SEC-003、Q-004 の推奨 | 共有できない | Q-004 で B |
| A-03 | 品質の自動低下は {PARAM-027} 未満が {PARAM-028} 続いたら 1 段階下げ、自動では上げない | ドラフトに値がない。目標 {PARAM-007} の 4 分の 3 を下限とした | 低性能 PC での見た目 | 実機の計測で調整（PARAM の変更） |
| A-04 | `Esc` の優先順: 開いているダイアログ・メニューを閉じる → オープニングのスキップ → 最大化の解除 → 選択の解除。重なりの判定に数えるのは、展開中のダイアログ・メニュー・combobox の候補一覧だけで、常時表示の listbox（議題の一覧など）は数えない | FR-013・FR-027・FR-076 が同じキーを使うため（条件不明による矛盾の疑いを解消）。常時表示の listbox を数えると、Esc が最大化の解除や選択の解除に届かない（実装者の報告 2026-10-10） | キー操作の結果 | 利用者の指定 |
| A-05 | コマンドパレットのショートカットは `Ctrl+K`（macOS は `Cmd+K`） | ブラウザーの既定の操作と重なりにくいキー | キー操作 | 利用者の指定 |
| A-06 | 業種プリセットの実装順は製造→物流→小売→金融→公共 | Q-005 の推奨 | 実装順のみ | Q-005 で B |
| A-07 | 雛形はこのリポジトリで新しく作り、テンプレートと ZIP の両方で配布できるようにする | Q-006・Q-007 の推奨 | 初期の作業量 | Q-006・Q-007 の回答 |
| A-08 | 匿名化は `internal` の値を丸ごと「［社内情報・匿名化］」に置き換える | Q-008 の推奨（最も保守的） | 出力の情報量 | Q-008 の回答 |
| A-09 | セットアップスクリプトは、表示だけで終わる指定（PowerShell は `-WhatIf`、シェルは `--dry-run`）を持つ | FR-108「実行内容を事前に表示」を確かめられるようにするため | 引数の追加のみ | 利用者の指定 |
| A-10 | 「数万ストローク」を {PARAM-010} とする | ドラフトの「数万」の下限側 | 性能の合否 | 実機での計測・利用者の指定 |
| A-11 | ヒステリシス {PARAM-023}、元に戻す {PARAM-024}、自動保存 {PARAM-025}、コントロールバー {PARAM-026} | ドラフトに値がない。一般的な初期値 | 操作感のみ | PARAM の変更 |
| A-12 | 編集モードの既定は OFF | FR-047「誤操作を防ぐ」の目的に合わせた | 起動直後は編集できない | 利用者の指定 |
| A-13 | 主要画面の一覧は §3.5 のとおり。初回のペルソナは経営層 | ドラフト §13.2 AC-06「主要な画面」の範囲を確定するため | 検査の範囲 | 利用者の指定 |
| A-14 | 費用負担者・決定権者は、依頼者（アプリの準備を担う組織）とみなす | 依頼に記載がない | 承認の窓口 | 利用者の指定 |
| A-15 | AI の実接続の有効化（FR-132）は起動中の顧客パック（案件）に対してだけ働き、別の顧客パックで起動するとモックに戻る | Q-001 の推奨 A「了承を得た案件だけ」に合わせ、了承のない案件への持ち越しを防ぐ | 案件を替えるたびに有効化が要る | Q-001 の回答 |
| A-16 | 矢印キーの優先: プレゼンテーションモード中は `←`/`→` が前/次の議題、`↑`/`↓` と `Shift`+矢印がキャンバスのパン。モード外では矢印キーはパン。入力欄・メニューにフォーカスがあるときはそちらが優先 | FR-012（AC-015）と FR-016（AC-019）が同じキーを使うため（監査 C-02） | キー操作の結果 | 利用者の指定 |
| A-17 | FR-074 の「最初の操作で音声が有効になる」は、ブラウザーの自動再生の制限を最初の操作で解き、音声を再生できる状態にすることを指す。ミュートの状態は変えず、ミュートの解除は `M` かミュートボタンの操作だけで行う。保存した設定（FR-057）が復元された状態を優先する | FR-074 と FR-057（AC-070）の両立のため（監査 C-03） | 初回の音の出方 | 利用者の指定 |
| A-18 | verify のコントラストの項目（FR-127）は、FR-060 の補正後の実効色で合否を判定する。元の値が AA を満たさない場合は、元の値・補正後の値・比を添えた警告として出力し、合否には含めない。補正後も AA を満たさない場合は不合格 | ドラフト §13.2 AC-03「Primary 色が反映され、AA を満たしている」は表示の状態を判定する項目で、FR-060 の自動補正と両立させるため（監査 D-01） | verify の合否 | 利用者の指定（元の値の不足も不合格にする場合は AC-155 を戻す） |
| A-19 | お手本パックは種別モノ（製造業）とコト（物流）の架空企業 2 件を同梱し、既定と標準の検証条件はモノ。検査用の変種は配布物に含めない | AC-024・AC-025・AC-123 が 2 種類、AC-139・AC-155・AC-178 が変種を前提にするため（監査 G-02）。業種は A-06 の実装順の先頭 2 業種 | お手本データの作成量 | 利用者の指定 |
| A-20 | お手本パック（FR-104）は、データとしてビルド成果物の `dist/example-pack/` に同梱する。コード（JS・CSS・HTML）には含めない。AC-122 の検査対象はコードで、`dist/example-pack/` 配下のお手本データは対象外 | 同じ `dist/` を配信して検証する System Test で、AC-122（成果物に顧客名が含まれない）と AC-126（`public/data/` が空ならお手本の企業名で起動）が両立しないと実装者（I27）が報告した。FR-100 は「コードに含めない」ことが目的で、データの同梱は禁じていない | お手本データの置き場所の限定のみ。顧客パックのデータは `dist/` に入らない | 利用者の指定（お手本を成果物に含めない場合は、AC-126 の検証方法を見直す） |
| A-21 | 雛形の複製（FR-124）は、`node_modules` と `dist` を既定でリンク（Windows はジャンクション、ほかは symlink）で共有し、`--copy` を指定したときだけフルコピーする。複製先で `npm install` や `dist` の書き換えをしない。`logs/timing.json` に `method`（`link`／`copy`）を記録する。{PARAM-005} は既定（link）に適用する | 実環境の `node_modules`（約 7 万ファイル）のフルコピーは 183 秒かかり {PARAM-005} を満たせず、リンクなら 0.5 秒（実装者の報告 2026-10-10）。FR-124 の目的は「`npm install` とビルドを避けて 30 秒以内に使える作業フォルダーを得る」こと | 複製の方法と記録だけ。共有した `node_modules` と `dist` を複製先から書き換えない前提 | 利用者の指定（フルコピーを既定にする場合は PARAM-005 の値を見直す） |
| A-22 | ショーコントロールバーの操作部は自動で隠れるが、ミュートボタンとミュートの状態は、バーとは別の常時表示のドック（`show-mute-dock`）に出し続ける | FR-074（常に表示するミュートボタン）と AC-102（バーが隠れる）の両立。実装済みの挙動を採用 | ミュートの操作と表示の場所だけ | 利用者の指定 |
| A-23 | 顧客パックの部分的な無効化（FR-102）は、参照切れになった項目を参照する下位の項目（下位課題・解決策・議題）も連鎖して無効にする。それ以外の項目は表示する。AC-124 の「その課題以外はすべて表示」は、不正な項目と、それに依存する項目を除くすべて、と読む（最終監査 F-02）。無効にした項目と理由は画面とコンソールに表示する | 親の課題が無効になると、それを参照する下位の項目は参照切れになり、表示すると壊れた参照が画面に出る。実装済みの挙動を採用 | 無効になる範囲の定義だけ | 利用者の指定（連鎖させず参照切れの項目を表示する場合は AC-124 を戻す） |
| A-24 | 雛形への改善要望（FR-131）は、作業フォルダーの `template-improvement-requests.md`（git 管理外）に追記する。拾う行は、追加資料の「画面種別: ○○」（雛形にない画面種別だけ）と「雛形への要望: ○○」 | 記録先と書き方が要求にもドラフトにもなかった。実装済みの挙動を採用。顧客パックには含めず、顧客固有情報を雛形に持ち込まない | 記録の置き場所と書式だけ | 利用者の指定 |
| A-25 | 優先順位分析のパネル（`component-priority`）に、現在の上位 5 件の簡易リストを置く。AC-096 の前提として、お手本パックの課題は 5 件以上とする | FR-079 の TOP5 ランキングと優先順位分析の連動を、System Test が観察できる形で確かめるため。実装済みの挙動を採用 | 優先順位分析パネルの表示内容だけ | 利用者の指定 |
| A-26 | 顧客パックの `coreObject` と `glossary` の項目は、§3.6 の形式の任意項目として定義する。候補の表示名は `name`、`label` は互換（`name ?? label`） | 要求に形式がなく、候補の `name` と `label` が二重になっていた（実装者の報告 I08）。実装済みの挙動を採用 | 顧客パックの任意項目の形式。既存のパックは `label` だけでも読める | 利用者の指定 |
| A-27 | 編集モードが ON のとき、一覧表は非関連の行を非表示にせず減光で表示する（OFF に戻すと「非表示/減光」の設定どおり） | 既定が「非表示」のままだと、編集したい行を選べず、編集の手順が成り立たない。実装済みの挙動を採用 | 編集モード中の表示だけ | 利用者の指定 |
| A-28 | `internal`（WorkIQ 由来）の扱い: 既定では画面・エクスポートに出さない。出すのは、匿名化 ON のエクスポート（値は A-08 の表記に置換。FR-054・FR-117・AC-066・AC-143）と、件数の確認後に開始するプレゼンテーション（NFR-SEC-003・AC-178）だけ。匿名化 OFF のエクスポートで `internal` を値のまま出すかは、Q-008 の回答まで「出さない」（置換または除外）とする | 最終監査 F-01（§3.5 の「出さない」と FR-117 の「匿名化できる」、AC-178 の「確認して開始」が同じ条件で両立しない）。FR-054・FR-117・NFR-SEC-003・AC-066・AC-143・AC-178 の本文は変えず、§3.5 で揃えた。顧客情報の保護（C-02）に合う側の暫定 | `internal` の出力の範囲（出す側を減らす方向だけ） | Q-008 の回答（匿名化 OFF で出す、または既定を変える場合は §3.5 と AC-178 を見直す） |
| A-29 | 「接続済み」は、利用者が設定で実接続を明示的に有効にして確認した後の状態を指す。AC-011（実際の SDK 経由）・AC-176（「接続済み」の差し替え部品）は、この有効化の後を前提とする。有効にしていなければ、SDK を使える状態でもモックで SDK 呼び出しは 0 回（AC-190） | 最終監査 F-03（AC-176・AC-011 と FR-132・AC-190 が、有効化の前提の有無で食い違う）。AC の本文は変えず（ac_digests と衝突するため）、FR-132・§3.4・§3.5 で前提を明記した | 検証の前提だけ | Q-001 の回答（B なら FR-132 を廃止し、既定を接続済みにする） |
| A-30 | 事業部門の既定のレイアウト（§7）に表（table。課題・原因・解決策の一覧）を含める。実装者 J03 が layoutModel に加えたものを要求に合わせた。AC-135（既定に戻すと選択中のペルソナの既定のレイアウトに戻り、選択と絞り込みは変わらない。表を含むかは §7 と FR-112 の本文が定める）・AC-185（コンポーネントの最大化・移動・切替で選択・絞り込み・時刻・入力が保たれる。表を含む構成でも成り立つ前提）はこの前提。表が事業部門の既定に含まれることを直接確かめる AC は AUD-25 に記録 | 代替手段の表を既定でも見えるようにすると、因果の図と一覧を行き来できて判断が速い。AC の本文は変えない。FR-112 の本文・§7 の表に明記した | 既定のレイアウトの構成だけ。既定の情報表現（課題-解決策分析）は変わらない | 利用者が表を既定に含めないと決めたとき（layoutModel と AC-135 を見直す） |
| A-31 | AC-113（出力した PDF を PDF ビューアーで開き、日本語の文字化けと手書きの線のぼやけがないことの確認）は `検証レベル: manual` のまま残す。自動検査では代替しない（フォントの埋め込みと線の鮮明さの目視判定は、ビューアーの表示に依存するため）。`docs/manual-tests.md` の手順で利用者が確かめるまで、FR-092 の目視の確認は未実施 | 最終転記の依頼（run 202610100952）。AC-112 の自動検査（PDF の生成と内容）とは別に、目視でしか確かめられない部分があるため | 目視の確認が済むまで AC-113 は未確認。FR-092 の自動検査の合否には影響しない | 利用者が自動の代替（フォント埋め込みの検査など）を承認したとき |

TBD: なし。競合: なし（ドラフト内の `Esc` の重なりは A-04、矢印キーの重なりは A-16 で解消。承認済みの既存要求はなかった。2026-10-09 の監査の直接矛盾 D-01・D-02 は §9 で解消。2026-10-10 の最終監査の HIGH F-01〜F-03 は A-23・A-28・A-29 で解消）。この行の「TBD」「競合」は本文の残件の数で、rdcheck の語の出現数（`rdcheck stats` の TBD・競合は、PARAM の値の欄や §9・本節の説明の中の語を数えるため、本文の残件より多く見える）とは一致しない（監査 L-04、最終監査 F-15）。

[ASSUMPTION] A-32: 分析手法の初期セットは SWOT、ファイブフォース、バリューチェーン、3C、バランスト・スコアカードの 5 種で、ステップ名は 課題定義→現状分析→KPI 測定→ユースケース作成→施策計画（PARAM-030）。根拠: 一般に知られる枠組み（SRC-010 は名称の参照のみで本文未確認。HBR の特定の記事に基づくものではない）。影響: FR-133、FR-136。覆す条件: 利用者が手法やプロセスを指定したとき。

[ASSUMPTION] A-33: PARAM-031（50 件）と PARAM-032（2 秒）は仮の値。根拠: 一覧の操作性と通常規模のデータでの目安。影響: FR-134、FR-137。覆す条件: 実測や運用の要望。

競合（2026-10-12）: NFR-SEC-004・FR-138 の権限・分離と、既定制約 C-01「アプリに利用者の認証・権限はない」。C-01 の文面は変えず、AC-218 を BLOCKED: Q-009 とした。

### 10.4 監査指摘

| ID | 日付 | カテゴリ | 重大度 | 位置 | 要約 | 状態 |
|---|---|---|---|---|---|---|
| AUD-01 | 2026-10-09 | 出典 | 低 | SRC-002 | ドラフトの元資料 `[Hub] Envisioning-Dashboard-builder.md`（v2）はリポジトリになく未取得。ドラフトは元資料の機能要件を「そのまま引き継いだ」としているため、ドラフトを正本とした | 記録のみ |
| AUD-02 | 2026-10-09 | 出典 | 低 | §1.1 P-1 | P-1 の所要時間は 1 回の実行の観察（調査は推定）で、統計ではない | 記録のみ |
| AUD-03 | 2026-10-09 | 調査 | 低 | §4・§7 | 社内情報（Work IQ）は認証が必要で検索できなかった（社内情報未確認）。ペルソナの調査は Web の要旨のみ | 記録のみ |
| AUD-04 | 2026-10-09 | 条件不明 | 中 | AC-061 ↔ §5・FR-051・FR-056 | 議論の記録が再読込後に残ること（AC-061）を求めるが、議論データのブラウザー内の保存の要求がない（監査 C-04。最終監査 F-06 と同じ。AC-022・AC-079・AC-119 も同様） | 未対応 |
| AUD-05 | 2026-10-09 | 目的整合 | 中 | NFR-PERF-001・AC-160・AC-161 | 中央値 {PARAM-002} を確かめる受入基準がない（監査 M-01。最終監査 F-07 と同じ） | 未対応 |
| AUD-06 | 2026-10-09 | 目的整合 | 中 | G-001・G-002 | G-001 の目標値が未設定。G-002 の指標が fps だけで読みやすさを測らない（監査 M-02。最終監査 F-07 と同じ。利用者への質問が要る） | 未対応 |
| AUD-07 | 2026-10-09 | 記述の質 | 低 | NFR-PERF-001・AC-160・FR-121・AC-147・FR-072・FR-057、FR-058・AC-189・FR-079、NFR-PERF-004・FR-031・FR-067 | 計測の起点のずれ、research の打ち切りの単位、reduced-motion と保存設定の優先、PARAM 未参照の値、主観語（監査 L-01〜L-03・L-05・L-06。最終監査 F-13・F-17・U-06 と重なる） | 未対応 |
| AUD-08 | 2026-10-10 | 直接矛盾 | 高 | §3.5「出典（機密区分）」↔ FR-054・FR-117・NFR-SEC-003・AC-066・AC-143・AC-178 | 最終監査 F-01（3/3）: `internal` の扱いが三通り（出さない／匿名化できる／確認して含めて開始）。§3.5 を「既定では出さない。匿名化 ON のエクスポート、または確認後のプレゼン開始で扱う」に揃え、A-28 を置いた。匿名化 OFF で出す場合の扱いは Q-008 の回答まで「出さない」 | 暫定で解消（A-28。Q-008 の回答待ち） |
| AUD-09 | 2026-10-10 | 直接矛盾 | 高 | AC-124 ↔ FR-102・A-23 | 最終監査 F-02（2/3）: AC-124「その課題以外はすべて表示」が連鎖無効と食い違う。FR-102・A-23 に「不正な項目と、それに依存する項目を除くすべて」と読む旨を明記。AC-124 の本文は台帳の ac_digests のため変えていない。本文を揃える場合は test-designer が台帳を見直してから別途依頼する | 解消（読み替えを明記。AC の文面は未変更） |
| AUD-10 | 2026-10-10 | 直接矛盾（条件） | 高 | AC-176・AC-011・FR-010・FR-011 ↔ AC-190・FR-132 | 最終監査 F-03（2/3）: 「接続済み」の前提に明示的な有効化がない。FR-132・§3.4・§3.5 に「接続済み」は有効化と確認の後の状態と明記し、FR-010・FR-011 に FR-132 への参照を足した。A-29。AC-176・AC-011 の本文は未変更 | 解消（A-29） |
| AUD-11 | 2026-10-10 | 直接矛盾（状態の語彙） | 中 | §3.5 ↔ FR-069・AC-085・FR-065・AC-080 ほか | 最終監査 F-04（3/3）・F-12（3/3）: 3D 品質を Low／Medium／High／Ultra、描画方式を WebGPU／WebGL2 に揃え、自動の引き下げの参照を {PARAM-027}／{PARAM-028} の組に直した（F-12 は解消）。ロゴ・出典の確度・注釈・固定・ミュートの値の集合は未対応 | 一部対応 |
| AUD-12 | 2026-10-10 | 条件不明／不足 | 中 | FR-124・AC-151・A-21 ↔ FR-101・AC-123・FR-119・FR-128・A-20 | 最終監査 F-05（3/3）: 顧客パックの置き場所と配信（共有 `dist` に書かない重ね方）が要求にない | 未対応 |
| AUD-13 | 2026-10-10 | 目的整合 | 中 | G-004（KPI-3・KPI-4）↔ FR-127・AC-154・FR-022・FR-034・FR-092・FR-093 | 最終監査 F-08（2/3）・U-03: KPI-3 の測定方法（FR-127 は顧客パックの 9 項目）が全 Must を測らない。MUST の承認済み未実装が残る | 未対応（利用者への質問が要る） |
| AUD-14 | 2026-10-10 | 条件不明 | 中 | FR-046・AC-057・FR-088・AC-107・A-04・A-16 | 最終監査 F-09（2/3）: `Ctrl+Z`／`Ctrl+Y` の対象（データ／インク／入力欄）の規則がない | 未対応 |
| AUD-15 | 2026-10-10 | 条件不明 | 中 | FR-107・FR-108・AC-131・AC-132 | 最終監査 F-10（2/3）: 導入と「管理者権限を必要としない」の両立の条件（権限不足なら案内して止まる）がない | 未対応 |
| AUD-16 | 2026-10-10 | 条件不明 | 中 | NFR-SEC-002・AC-010・AC-176 ↔ FR-080・FR-090・Q-002 | 最終監査 F-11（2/3）: 「通信先は localhost だけ」と外部 AI API（音声・手書き認識）の呼び出し経路が決まっていない | 未対応（Q-002 の回答待ち） |
| AUD-17 | 2026-10-10 | 記述の質 | 低 | FR-058・FR-079・AC-096・AC-189・CHK-14 | 最終監査 F-13（3/3）: 意味のある数値（4px・上位 5 件・200%）が PARAM 化されていない。verify の警告 24 件 | 未対応 |
| AUD-18 | 2026-10-10 | 記述の質 | 低 | FR-085・AC-103・FR-013・FR-084 | 最終監査 F-14（3/3）: ショートカットの一覧が「すべて」を満たさず、`F` の定義がない | 未対応 |
| AUD-19 | 2026-10-10 | 記述の質 | 低 | §10.3 | 最終監査 F-15（2/3）: 「TBD なし・競合なし」と stats の数の見え方の食い違い。§10.3 の末尾に stats の数え方を再掲した | 解消 |
| AUD-20 | 2026-10-10 | 記述の質 | 低 | §3.5 の「アニメーション」「顧客パックの項目」の行 | 最終監査 F-16（2/3）: 対象エンティティにする要求がない（verify CHK-26） | 未対応 |
| AUD-21 | 2026-10-10 | 記述の質 | 低 | FR-058・FR-089・FR-031・NFR-PERF-004・AC-038 | 最終監査 F-17（2/3）: 主観語・否定形・未定義語 | 未対応 |
| AUD-22 | 2026-10-10 | 要確認（1 回のみ） | 高 | FR-047・AC-059・A-12 ↔ FR-039・FR-041・FR-048〜FR-050・FR-018・FR-064 | 最終監査 U-01（run2 のみ）: 編集モード OFF でデータを変更できないが、重み・サマリー・議論・決定ステータス・ブランドの上書きの AC が編集モードに触れない。FR-047 の「データ」の範囲が未定義 | 未対応（確度は要確認） |
| AUD-23 | 2026-10-10 | 要確認（1 回のみ） | 中 | U-02（FR-109・FR-111・FR-112 が SHOULD で MUST が依存）、U-04（FR-121・FR-125 に FR-132 が及ばない）、U-05（FR-074 本文と AC-193・A-17）、U-06（演出の設定と reduced-motion の優先）、U-07（「サンプル」透かしの条件）、U-08（実接続の再有効化の手間と G-003） | 最終監査の要確認（各 1 回のみの指摘）。記録のみ | 未対応（確度は要確認） |
| AUD-24 | 2026-10-10 | 要確認（1 回のみ） | 低 | U-09〜U-22 | 複数主題の束ね（FR-040 ほか）、上位 G-ID の遠さ、FR-100 とお手本パックの読み込み先、PERF-004 の題名と検査、課題の区分と機密区分の語、複数ボードの重複、プレゼンタービューの定義、版の最終更新、「既定制約 C-02」の呼称、MUST と SHOULD の AC の重複、静止画オープニング、「決定事項のみ」の範囲、「距離の刻み」「互換」「長押し」。詳細は work/runs/202610090557/audit/202610090557-final-aggregate.md（14 日で消える） | 記録のみ |
| AUD-25 | 2026-10-10 | 直接矛盾（疑い強） | 高 | FR-102 本文・A-23 ↔ AC-124 | run 202610100952 の独立監査 C-01（runs=1・要確認）: FR-102 は参照先が無効な下位項目も連鎖して無効にするが、AC-124 は「その課題以外はすべて表示」と書き、同条件で両立しない。A-23 の読み替えで解消済みだが AC の文面は未修正。推奨: AC-124 を「不正な項目と、それに依存する項目を除くすべて」に直す（承認済みの文面のため利用者の承認を待つ） | 未対応（確度は要確認） |
| AUD-26 | 2026-10-10 | 記述の質／不足 | 中 | A-30 ↔ AC-135・AC-185・FR-112 の AC-137 | 同 C-02: A-30 の AC 説明が実際の本文とずれていた（A-30 の文面は AC に合わせて直した）。FR-112 に、事業部門の既定に表が含まれることを確かめる AC（system）がない。推奨: その AC を追加 | 一部対応（A-30 修正済み。AC の追加は未対応） |
| AUD-27 | 2026-10-10 | 不足 | 中 | FR-124・AC-151・A-21 ↔ FR-101・AC-123 | 同 C-03: AUD-12 と同じ指摘（顧客パックの置き場所と配信が要求にない）。AUD-12 を維持し、ここでは参照のみ | AUD-12 を参照 |
| AUD-28 | 2026-10-10 | 記述の質 | 低 | FR-084・AC-102 ↔ FR-074 | 同 C-04: バー非表示中もミュート表示（ドック。A-22）が残る検証が AC-102・FR-074 にない。推奨: 1 行追加 | 未対応 |
| AUD-29 | 2026-10-10 | 記述の質 | 低 | FR-035（SHOULD）↔ FR-022・FR-034 | 同 C-05: FR-035 の対象エンティティが「エンティティ関係グラフ（階層）」で、ガント展開の対象（工程。FR-022）と一致しない疑い。推奨: 対象エンティティに「工程」を加える | 未対応 |
| AUD-30 | 2026-10-12 | 不整合 | 高 | docs/、src/、tests/ | 旧要求定義書の本体（docs/requirements/）とカタログが 2765e64 で削除されていたが、コード・テストは旧 ID を参照していた。履歴から復元して統合した。復元が意図に反する場合は利用者の判断が必要 | 復元済み・要確認 |
| AUD-31 | 2026-10-12 | 調査 | 低 | §4・§7（分析・Project 画面） | 分析・Project のペルソナ別の外部調査と HBR 本文の確認を実施していない（SRC-010 の仮説） | 未対応 |

run 202610100952 の独立監査（work/runs/202610100952/audit/20261010-1600-run1.md、14 日で消える）: CRITICAL 0・HIGH 1・MEDIUM 2・LOW 2。依頼文への該当なし（runs=1）。FR-092/093/094 の AC 間に矛盾なし。

### 10.5 提案・仮説

- 実装の順序（ドラフト §16 の参考）: R0 データを読み込む作り・スキーマ・お手本データ・verify・時間計測 → R1 連動と LOD、分析ビュー、データ編集、全量エクスポート、インクと PDF、ホワイトボード → R2 Skill 化、業種プリセット 5 種、2 社分の実測 → R3 Should/Could。最初は「縦串」（§3.4）を通す。
- 名前を付けた複数のレイアウトの保存と切替、レイアウトの共有: 会議の場面ごとにレイアウトを呼び出せる価値があるが、ペルソナ別のプリセット（FR-014）で当面は足り、共有は複数利用者の機能（対象外）に近いため、要求にしない。
- ドラフト §15 のリスクと対策（雛形の初期開発の長さ、見た目の固定化、キャッシュの陳腐化と機密、スキーマ違反、依存の更新、WebGPU/File System Access API の非対応）は、それぞれ FR-103・FR-063、FR-123・FR-117、FR-126・FR-102、FR-105・NFR-MAINT-002、FR-065・FR-052 で扱う。
- 指で描くモード（Could 相当）: ペンのない iPad などで、利用者が切り替えたときだけ指の 1 本の操作を描画にし、2 本指はパン/ズームのままにする。ペンのない端末でも手書きできる価値があるが、FR-087（承認済み）の「指はパン/ズーム」の例外になるため、利用者の承認があれば FR として追加する（監査 D-02 の解消の際に検討。2026-10-09）。

## 11. 出典台帳

| ID | 資料 | 版・日付 | 確認した位置 | 確認日 | 区分 |
|---|---|---|---|---|---|
| SRC-001 | リポジトリ直下 `要求定義書.md`（Envisioning Dashboard Builder（高速生成版）要求定義書 ドラフト） | 1.0（ドラフト）2026-10-09 | 全文（§0〜§17） | 2026-10-09 | 本文 |
| SRC-002 | `[Hub] Envisioning-Dashboard-builder.md`（v2: ショー体験・ブランド演出 強化版）。SRC-001 の元資料 | v2 | なし | 2026-10-09 | 未取得 |
| SRC-003 | Visual Studio Code ドキュメント「Custom Layout」「User Interface」 https://code.visualstudio.com/docs/configure/custom-layout | 2026-10 時点 | ビューの移動・パネル・Reset View Locations・コマンドパレット | 2026-10-09 | 要旨のみ（Web 検索の要約。本文未確認） |
| SRC-004 | W3C「Understanding WCAG 2.2」 https://www.w3.org/WAI/WCAG22/Understanding/ | WCAG 2.2 | 1.4.10 Reflow、2.5.7 Dragging Movements（ほか 1.4.1・1.4.3・1.4.11・2.1.1 は SRC-001 の指定と一般知識） | 2026-10-09 | 要旨のみ（本文未確認） |
| SRC-005 | 2×2 優先順位マトリクスとエグゼクティブ向けの可視化に関する記事（presenti.ai、mural.co ほか） | 2026-10 時点 | インパクト×実現性マトリクス、エグゼクティブサマリー、KPI ダッシュボード | 2026-10-09 | 要旨のみ（Web 検索の要約） |
| SRC-006 | C4 model「Diagrams」 https://c4model.com/diagrams ほか | 2026-10 時点 | C4 の 4 階層、Capability Map、AsIs/ToBe | 2026-10-09 | 要旨のみ（Web 検索の要約） |
| SRC-007 | 業務プロセスの可視化に関する記事（workflawless.com、teamhood.com） | 2026-10 時点 | バリューストリーム、プロセスフロー、ガント、カンバンと対象者 | 2026-10-09 | 要旨のみ（Web 検索の要約） |
| SRC-008 | Microsoft Fluent 2 Design System https://fluent2.microsoft.design/ | 2026-10 時点 | なし（利用者の指定として記録） | 2026-10-09 | 未取得（外部確認未実施） |
| SRC-009 | GitHub Copilot SDK https://github.com/github/copilot-sdk | 2026-10 時点 | なし（SRC-001 の指定として記録。プレビューの状況・対応言語は Q-001 の確認事項） | 2026-10-09 | 未取得（外部確認未実施） |
| SRC-010 | https://hbr.org/ （一般的な分析フレームワーク名の参照のみ。本文の複製はしない） | 未確認 | 未確認 | 2026-10-12 | 未取得（外部確認未実施） |
| SRC-011 | Visual Studio Code のワークベンチ（レイアウト変更の参照例） | 未確認 | 未確認 | 2026-10-12 | 未取得（能力の水準を示す参照例） |
| SRC-012 | リポジトリ src/（既存アプリの構成） | 2026-10-12 | src/ の構成 | 2026-10-12 | 要旨のみ |
