# 表示言語（i18n）— 開発者向け

日本語（既定）と English を切り替える基盤です（FR-293・FR-294）。**キーは日本語の原文そのもの**です。

## 使い方
- コンポーネント: `const t = useT();` → `t('保存')`、補間は `t('{n} 件', { n: 3 })`（`{name}` 形式）。
  `aria-label`・`title`・`placeholder`・通知の文言も `t()` を通します。
- React の外（ストア・通知など）: `import { tr } from '../i18n'` → `tr('保存しました')`（呼んだ時点の言語）。
- 辞書にない文言は日本語のまま表示されます（欠けても壊れません）。
- 言語の状態: `useLang`（`lang: 'ja' | 'en'`、`setLang`）。localStorage（`bas.lang`）に保存し、不正値は日本語。`<html lang>` と同期します。

## 辞書の足し方
`src/i18n/en/<任意の名前>.ts` を作り、次の形で書きます。`import.meta.glob` が自動で統合するので、index の編集は不要です（並行作業でも衝突しません）。

```ts
export default {
  '日本語原文': 'English',
} as Record<string, string>;
```

- 同じ原文を複数のファイルに書かない（重複は単体テスト `tests/unit/i18n.test.tsx` が検出します）。値は空にしない。
- 補間の `{name}` は日英で同じ名前にします。
- 顧客パック・製品名などデータ由来の文言は翻訳しません。
