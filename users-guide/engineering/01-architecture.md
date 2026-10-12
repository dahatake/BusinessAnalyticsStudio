# 1. アーキテクチャの全体像

対象: このアプリをカスタマイズ・拡張する Software Engineer。
利用者向けの説明は [../01-quick-start.md](../01-quick-start.md) にあります。

## 1.1 設計の原則

| 原則 | 内容 |
|---|---|
| 顧客固有の情報をコードに持たない | 顧客の値は、すべて「顧客パック」（`public/data/*.json` など）から実行時に読む。`src/` に顧客名・色・数値を書かない（FR-100） |
| 顧客パックがなくても動く | パックがないときは、同梱のお手本パック（架空企業 `examples/mono`）で起動する（FR-104） |
| 外部に出さない | データは端末内（localStorage）に保存する。AI への接続は、127.0.0.1 で待ち受ける中継プロセスだけを経由する |
| 出典と作成者の区別 | 数値には出典を、AI が作ったものには作成者の種別（AI 生成）を付ける。AI の提案値と顧客の決定値は別に持つ |
| 要求がコードの正本 | 要求は `docs/requirements-definition.md`、実装との対応は `docs/catalog.md` が正本（[build-kit/](../build-kit/02-during-and-after-run.md)） |

## 1.2 技術スタック

| 領域 | 使うもの |
|---|---|
| UI | React 18、Fluent UI React v9（`@fluentui/react-components`）、Fluent アイコン |
| 状態 | Zustand（`src/store/`） |
| スキーマ検証 | Zod 4（`src/schema/`）。JSON Schema は `npm run gen:schema` で生成 |
| 3D | three.js、`@react-three/fiber`、`@react-three/drei`（`src/three/`、`src/map/`） |
| ビルド | Vite 6、TypeScript 5.9（strict） |
| テスト | Vitest（単体・結合）、Playwright（System Test。`tests/system/`） |
| AI 中継 | Node.js の HTTP サーバー（`scripts/relay/`）＋ Copilot SDK |

## 1.3 ディレクトリ構成

```
src/
  main.tsx            エントリーポイント
  app/                App.tsx（起動・パック読み込み・全体の組み立て）、Opening.tsx（オープニング）
  data/               loader.ts（顧客パックの読み込み）、sample.ts
  schema/             Zod スキーマ（顧客パックの形式）と検証・匿名化
  store/              Zustand のストア（編集・議論・Project・分析・レイアウトなど）と persist.ts（localStorage）
  workspace/          画面の並び（分割とタブの木）、ペルソナ別の既定レイアウト
  screens/            各画面（registry.ts に一覧）。canvas/・whiteboard/ は入れ子
  components/         共通部品（AppShell、ExecutiveSummary、Brand など）
  theme/              Fluent テーマ、ブランドの反映、a11y
  analysis/ methods/ stepper/ projects/   分析手法・ステッパー・企業別 Project
  discussion/ export/ ink/ presentation/ show/ audio/ motion/ three/ map/ …   機能ごとのモジュール
  ai/                 AI の呼び出し口（client.ts）、チャット、状態表示
  commands/           コマンドパレットとショートカットの登録簿
scripts/
  relay/              AI の中継プロセス（npm run relay）
  pipeline/           顧客パックの生成パイプライン（npm run pipeline）
  setup/ setup.ps1 setup.sh   セットアップスクリプト
  check-pack.ts gen-schema.ts regression.ts make-package.ts
  *.py hooks/         Enterprise App Build Kit の管理スクリプト（[build-kit/](../build-kit/05-scripts-reference.md)）
schema/               顧客パックの JSON Schema（生成物。直接編集しない）
examples/mono|koto/   お手本パック（架空企業）
public/data|fonts/    顧客パックの置き場（雛形では空）
tests/unit|system|toolkit/   単体・結合、System Test、管理スクリプトのテスト
docs/                 要求定義書・カタログ・ID 台帳・手動テスト・配布
EABK-Studio/          管理データ（要求・カタログ・試験）のビューアー
```

## 1.4 起動時のデータの流れ

```
ブラウザー
  → /runtime-config.json（任意。relayUrl・aiMock）を読む
  → /data/*.json と /brand/brand-profile.json（顧客パック）を読む
       ない（すべて 404）→ /example-pack/（お手本パック）を読む。isExample = true
  → Zod で検証（src/schema/validate.ts）
       項目の誤り → その項目だけ無効化し、理由（ファイル名・位置・内容）を issues に残す
       ファイル全体の誤り → PackLoadError（画面にエラー）
  → ストアへ入れる → 画面（screens/*）が読む
```

- 読み込みは [src/data/loader.ts](../../src/data/loader.ts) です。`DATA_FILE_NAMES` の 9 ファイルとブランドを読みます。
- 検証の定義は [src/schema/files.ts](../../src/schema/files.ts)（`DATA_SCHEMAS`）です。

## 1.5 画面とレイアウト

- 画面は `ScreenDefinition`（`key`・`label`・`icon`・`component`）で、[src/screens/registry.ts](../../src/screens/registry.ts) の `SCREENS` に並べます。並び順が左のナビゲーションの順になります。
- 並べ方（分割とタブの木）は [src/workspace/layoutModel.ts](../../src/workspace/layoutModel.ts) の純粋関数で扱います（React に依存しません）。ペルソナ（経営層・事業部門・IT・現場）ごとの既定レイアウトは `defaultLayout(persona)` です。
- 木にない画面は「非表示」で、ナビゲーションの下に再表示のボタンが出ます。

## 1.6 状態と保存

| 対象 | 場所 | 保存 |
|---|---|---|
| 企業・Project・ステッパー・分析の入力値 | `store/projects.ts` ほか | `store/persist.ts`。localStorage のキー `eabk.projects.v1`。この端末だけ（サーバー・他端末へ送らない） |
| 議論ツリー・サマリー・手書き認識・編集モード | `store/tree.ts`・`summary.ts`・`edit.ts`、`ink/recognized.ts` | 同じく localStorage（端末内。使えない環境ではメモリ） |
| 編集・変更履歴・元に戻す | `store/edit.ts`、`edit/` | 保存／開くで JSON を書き出し・読み込み |
| 議論テーマ・決定 | `store/discussion.ts`、`discussion/` | 同上 |

共有や権限の仕組みはありません。複数人での同時編集が必要な場合は、設計の追加が要ります。

## 1.7 画面を超える共通の仕組み

| 仕組み | 場所 | 役割 |
|---|---|---|
| コマンド登録簿 | `src/commands/registry.ts` | コマンドパレットとショートカット一覧の共通の元。機能側が `registerCommands` で操作を足す |
| 選択の連携 | `src/selection/` | ある画面で選んだ対象を、ほかの画面へ伝える。読み上げ（Announcer）も含む |
| 動き（モーション） | `src/motion/` | 演出強度（Executive / Showcase / Entertainment）と動きの停止 |
| 音 | `src/audio/` | BGM（手続き生成）と効果音。既定はミュート |
| 出典・匿名化 | `src/schema/anonymize.ts`、`export/` | 機密区分と、WorkIQ 由来の社内情報の匿名化 |

## 1.8 次に読むもの

- 顧客ごとのデータを作る → [2. 顧客パック](02-customer-pack.md)
- 色・ロゴ・フォント → [3. ブランドとテーマ](03-branding-and-theme.md)
- 画面や機能を足す → [4. 画面・機能の追加](04-extending.md)
- AI 連携 → [5. AI と中継プロセス](05-ai-relay.md)
- テスト → [6. テストと検証](06-testing.md)
- ビルド・配布 → [7. ビルド・配布・運用](07-build-and-distribution.md)
