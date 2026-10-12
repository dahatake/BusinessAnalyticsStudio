# 6. テストと検証

対象: 変更を安全に入れる Software Engineer。

## 6.1 テストの層

| 層 | 場所 | 実行 | 何を確かめるか |
|---|---|---|---|
| 型検査 | `tsconfig.json` | `npm run typecheck` | TypeScript（strict） |
| 単体・結合 | `tests/unit/*.test.ts` | `npm test`（Vitest） | 純粋関数・ストア・スキーマ・レイアウト・エクスポートなど |
| System Test | `tests/system/` | `node tests/system/run.mjs AC-001` | 受入基準（AC）ごとの、ブラウザーでの E2E・契約 |
| 顧客パックの検証 | `scripts/check-pack.ts` | `npm run check:pack -- <フォルダー>` | 形式・必須ファイル・参照 |
| 受け入れ判定 | `scripts/pipeline/verify.ts` | `npm run verify:pack -- <作業フォルダー>` | 9 項目のスモークテスト |
| 回帰 | `scripts/regression.ts` | `npm run regression` | ビルド → お手本パックでの verify → 単体・結合を順に実行 |
| 管理スクリプト | `tests/toolkit/*.py` | Python | `clean-work.py`・`run-state.py` などの検証 |
| 手動 | `docs/manual-tests.md` | 手で確認 | 4K の性能、BGM、ペン入力、オフライン起動など、自動にできないもの |

## 6.2 日常の流れ

```
npm run typecheck
npm test                                  # 変更に近いものだけなら npx vitest run tests/unit/<file>.test.ts
python scripts/verify.py                  # 管理データの検査（CHK）＋ typecheck・build・unit（scripts/ebak.config.json の verify.commands）
```

リリース前や依存関係の更新時は `npm run regression` を実行します（1 つでも失敗すると 0 以外で終了）。

> `python scripts/verify.py` は、`scripts/ebak.config.json` の `verify.commands` を実行します。現在は typecheck・build・指定した単体テストの一部です（全件ではありません）。全件の単体テストは `npm test` で実行してください。`--docs-only` は管理データの検査だけ、`--quick` は `slow: true` のコマンドを省きます（[build-kit/](../build-kit/05-scripts-reference.md)）。

## 6.3 System Test

- Playwright（Chromium）。最初に `tests/system/` で `npm ci` を 1 回実行します。
- 1 つの AC: `node tests/system/run.mjs AC-001`（リポジトリのルートから。AC ID が題名に入るテストだけを実行。0 件なら非 0）。
- 一覧: `npm run st:list --prefix tests/system`。型検査: `npm run typecheck --prefix tests/system`。
- 性能の AC（`@perf`）は `chromium-perf` プロジェクトで、並列なしで実行します。
- アプリの前提（起動のしかた・お手本パック・`data-testid`・テスト用フック `window.__edbTest`（`?e2e=1` のときだけ有効）・AI のスタブ）は、[tests/system/CONTRACT.md](../../tests/system/CONTRACT.md) が正本です。**契約を変えるときは、要求定義書と台帳を通して変えます**（実装側でテストに合わせて勝手に変えない）。
- テストと台帳（`tests/system/ledger.json`）は、test-designer と `python scripts/ledger.py` が扱います。Software Engineer が直接編集しません（[build-kit/](../build-kit/06-quality-gates.md)）。

## 6.4 テストを書くとき

| 対象 | 方針 |
|---|---|
| 純粋なロジック（レイアウト、分析、エクスポート、スキーマ） | `tests/unit/` に Vitest。React に依存しない形で `model.ts` に切り出すと書きやすい |
| 画面の振る舞い | System Test（受入基準に紐づく）。`data-testid`（`nav-<key>`・`component-<key>`）と、アクセシブルな名前で探す。CSS のクラス名に依存しない |
| 顧客パックの形式 | `tests/unit` のスキーマのテストと、お手本パックでの `check:pack` |
| AI | 実接続はテストしない。モックと、中継プロセスのスタブを使う |

テスト名または題名には、対応する要求 ID・AC ID を入れます（カタログとの対応の検査が、ID の有無を見ます）。

## 6.5 変更を入れる前のチェックリスト

- [ ] `npm run typecheck` と `npm test` が通る
- [ ] スキーマを変えたら `npm run gen:schema` を実行した（`-- --check` が通る）
- [ ] お手本パックが新しい形式で `npm run check:pack -- examples/mono` を通る
- [ ] 画面を足したら、`SCREENS`・`defaultLayout`・テストを更新した
- [ ] 顧客名・数値をコードに書いていない
- [ ] 外部への通信を足していない（足すなら中継プロセス経由で、同意の確認がある）
- [ ] 要求の変更を伴うときは、要求定義書・カタログ・台帳が揃っている（`python scripts/verify.py`）
- [ ] 手動確認が要る変更は、`docs/manual-tests.md` の手順で記録した
