# 3. ブランドとテーマ

対象: 顧客の色・ロゴ・書体・トーン・BGM を反映する Software Engineer。
ブランドの値は顧客パックの `public/brand/brand-profile.json`（形式は [schema/brand-profile.json](../../schema/brand-profile.json)）にあります。**アプリの再ビルドは要りません。**

## 3.1 brand-profile.json の項目

| 項目 | 内容 |
|---|---|
| `name` | ブランド名 |
| `colors` | `primary`（`#RRGGBB`）。ほかに出典（`source`）・取得日（`retrievedAt`）・確度（`confidence`） |
| `logo` | `path`（例 `/assets/brand/logo.svg`）、`status`（利用条件を確認できていないときは `unknown`）、出典・確度 |
| `fonts` | `primary`（書体名）。出典・確度 |
| `tone` | `value`（誠実・先進的・親しみやすい、など）。BGM の曲調と、既定の演出の雰囲気を決める |

どの項目にも、**出典・取得日・確度**を付けます。設定パネルの「ブランド」欄に、そのまま表示されます。

## 3.2 差し替え手順

1. **色**: `colors.primary` に `#RRGGBB` を書く。アプリが、この色から 16 段階のランプを作り、Light / Dark / ハイコントラストのテーマに展開します（[src/theme/brand.ts](../../src/theme/brand.ts) の `generateRamp`）。
2. **ロゴ**: 画像を `assets/brand/` に置き、`logo.path` に書く。利用条件が未確認なら `logo.status` を `unknown` のままにする（画面には「要許諾確認」の印が出ます）。
3. **フォント**: `fonts.primary` に書体名を書く。画面では「ブランド書体 → Segoe UI Variable → Noto Sans JP」の順で使われます。書体のファイルは同梱しません（端末にあるものが使われます）。
4. **BGM**: 曲調は `tone.value` で決まる手続き生成です。自前の音源を使うときは `assets/audio/`（任意）に置きます（パイプラインでは `--bgm <フォルダー>`）。
5. **確認**: `npm run check:pack -- <顧客パックのフォルダー>` と `npm run verify:pack -- <作業フォルダー>`。

配布パッケージでは、`dist/brand/brand-profile.json` と `dist/assets/brand/` に置きます（[7. ビルド・配布・運用](07-build-and-distribution.md)）。

## 3.3 アクセシビリティの基準（変えない）

| 基準 | 値 | 場所 |
|---|---|---|
| 本文のコントラスト比 | 4.5:1 以上（WCAG 2.2 AA） | `MIN_CONTRAST_TEXT` |
| UI 部品のコントラスト比 | 3:1 以上 | `MIN_CONTRAST_UI` |
| 操作できる要素の最小の大きさ | 24px 以上（WCAG 2.2 の 2.5.8） | `src/theme/tokens.ts` |

顧客の Primary 色が基準を満たさない場合、`verify:pack` の「Primary 色の反映と AA コントラスト」が失敗し、原因が出力されます。色を直すか、顧客と相談して近い色に置き換えてください（基準を下げません）。

## 3.4 テーマの決まり方

- 利用者の選択（Light / Dark / システムに合わせる）と、OS の設定（ダーク・ハイコントラスト）から、Fluent のテーマを選びます（[src/theme/resolve.ts](../../src/theme/resolve.ts)）。ハイコントラストは OS の設定に従います。
- アプリ全体は `AppThemeProvider` で包み、`data-theme` に解決後のテーマ名を付けます。
- **値を直書きしません**。色・余白・角丸は Fluent 2 のトークンから取り、余白は 4px グリッドです（[src/theme/tokens.ts](../../src/theme/tokens.ts)）。画面を足すときも同じ体系を使います。

## 3.5 ブランド調査の決まり

ブランドの値を決めるための調査は、**公式の出典だけ**を、次の順に使います（FR-122）。非公式サイトは使いません。

1. ブランドガイドライン
2. プレスキット
3. 公式サイト
4. IR 資料

何も特定できない顧客には、既定のテーマ（Microsoft 標準のニュートラルなテーマ、Fluent 2 のトークン）を使います。調査の記録は、顧客パックの `brand/BRAND-RESEARCH.md` に、色・ロゴ・書体・トーンごとの出典・取得日・確度つきで残します。3D アセットなどの権利は [CREDITS.md](../../CREDITS.md) にあります（追加したら更新する）。
