# 4. 画面・機能の追加

対象: 画面（コンポーネント）、コマンド、AI の処理、分析手法などを足す Software Engineer。
先に [1. アーキテクチャ](01-architecture.md) を読んでください。

## 4.1 画面を 1 つ足す

1. **画面を作る**: `src/screens/<名前>Screen.tsx` に、`ComponentType` となる React コンポーネントを書く。見た目は既存の画面（例: [IssueSolutionScreen.tsx](../../src/screens/IssueSolutionScreen.tsx)）に合わせる。
   - 外枠は共通部品 `Panel`（`testId`・`title`・`description`）で包む。サンプルデータのときの「サンプル」の印が自動で付く。
   - 状態は `usePackStore` から読む。`state.status === 'ready'` のときだけ顧客パックの値がある。読み込み中・空は `LoadingView` / `EmptyView`。
   - 要約が要る画面は `ExecutiveSummary`（「AI 生成」のラベルと編集・固定を含む）を置く。
   - 選択は `selection/` のフックで共通のストアにつなぐ（ある画面で選んだ対象を、ほかの画面が強調する）。
2. **登録する**: [src/screens/registry.ts](../../src/screens/registry.ts) の `SCREENS` に 1 行足す。

   ```ts
   { key: 'my-screen', label: '新しい画面', icon: SomeIcon24Regular, component: MyScreen },
   ```

   `key` は小文字とハイフン。**並び順がナビゲーションの順**です。`key` は `nav-<key>`・`component-<key>` の `data-testid` になり、テストが画面を探す手がかりです（[tests/system/CONTRACT.md](../../tests/system/CONTRACT.md) §4）。
3. **レイアウトを決める**: 既定で表示するなら、[src/workspace/layoutModel.ts](../../src/workspace/layoutModel.ts) の `defaultLayout(persona)` の該当ペルソナに `leaf('my-screen')` を足す。足さなければ「非表示のコンポーネント」から再表示する画面になる。登録されていない key は自動で取り除かれる（`prune`）。広さがほしい画面は `SHOW_SHARE` で、新しく表示するときの幅の割合を決められる。
4. **ペルソナの主領域**を変えるときは、`src/workspace/persona.ts` の `PERSONA_PRIMARY` と、`defaultLayout` の最大の領域が一致することを、単体テスト（`personaDefaultsMatchTable`）で確かめる。
5. **テストと要求**: [6. テストと検証](06-testing.md)。新しい画面は、要求定義書に要求と受入基準を足してから実装する（[build-kit/](../build-kit/01-writing-requests.md)）。

## 4.2 コマンド（パレット・ショートカット）を足す

```ts
import { registerCommands } from '../commands/registry';

registerCommands(() => [
  { id: 'my.action', label: '操作の名前', keywords: ['別名'], shortcut: 'Ctrl+Shift+X', run: () => { /* ... */ } },
]);
```

- `id` は一意にする（重複すると登録が衝突する）。
- コマンドパレット（`src/commands/CommandPalette.tsx`）とショートカット一覧は、この登録簿から作られる。個別に足さない。
- 戻り値は解除の関数。React のコンポーネントから登録するなら、`useEffect` の後始末で呼ぶ。

## 4.3 AI を使う処理を足す

[5. AI と中継プロセス](05-ai-relay.md) のとおり、AI の呼び出しは `askAi` の 1 か所を通します。処理の種類（`AiKind`）は `structure`・`summary`・`recommend`・`chat`・`exec-summary` の 5 つです。新しい種類を足すときは、`AI_KINDS`、モックの回答（`mockAnswer`）、中継プロセス側の処理、System Test のスタブを、同時に直します。

結果は必ず「AI 生成」（モックのときは「AI 生成（モック）」）のラベルを付けて見せ、**採用するまで**データに反映しません（例: [src/projects/aiDraft.ts](../../src/projects/aiDraft.ts) と `AnalysisPanel` の「採用 / 却下」）。

## 4.4 顧客パックの項目を足す

1. Zod スキーマを直す（[2.7](02-customer-pack.md#27-スキーマを変えるとき)）。
2. 参照の項目（ほかの ID を指す）を足すときは、`src/schema/common.ts` の `REFERENCE_KEYS` に項目名を足す。足さないと、存在しない ID の検出が効かない。
3. お手本パックを更新し、画面が新しい項目を読むようにする。
4. 出典と `createdBy` を付ける決まりを守る。

## 4.5 守ること

| 決まり | 理由 |
|---|---|
| 顧客名・数値・色をコードに書かない | 顧客パックだけが顧客固有の値を持つ（FR-100） |
| `schema/` の共通部品は、画面の部品を参照しない | 依存の向きを一定にする（NFR-MAINT-001） |
| 値は Fluent 2 のトークンから取る | テーマ（Light / Dark / ハイコントラスト）に追従させる |
| キーボードだけで操作できる／読み上げに対応する | アクセシビリティ（NFR-A11Y）。`selection/Announcer` の仕組みを使う |
| 操作できる要素は 24px 以上 | WCAG 2.2 の 2.5.8 |
| 動きは演出強度と「動きを減らす」に従う | `src/motion/` のフックを使う |
| 外部へ通信しない（AI は中継プロセスだけ） | 顧客データの保護 |
