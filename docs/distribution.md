# 配布パッケージの作り方と使い方（FR-105）

雛形は、依存パッケージのバージョンを固定（`package.json` は範囲指定なし、`package-lock.json` あり）し、`node_modules` を同梱したパッケージとして配布できます。展開した PC は、ネットワークがなくても動きます（外部の CDN・Web フォント・API は使いません。生成 AI・音声・手書き認識はモックで動きます）。

## 作る（ネットワークのある PC）

```
npm ci
npm run build
npm run package
```

`work/package/business-analytics-studio-<雛形のバージョン>.tgz` ができます。同梱するものは許可リスト（`scripts/lib/package.ts`）で決めます。`node_modules`・ビルド済みの `dist/`・`src/`・`schema/`・`examples/`・`package.json`・`package-lock.json`・`.env.example` など、実行と再ビルドに必要なものだけです。次のものは含めません。

- `.env`・`.env.*`（秘密値。`.env.example` だけは含みます）
- 顧客パック（`public/data/`・`public/brand/`・`assets/brand/` と、ビルドが `dist/` に複製した `dist/data/`・`dist/brand/`・`dist/assets/brand/`）。お手本パックは `dist/example-pack/` と `examples/` にあります。
- `.git`・`work/`・`tests/`・管理用の Python スクリプト

## 使う（ネットワークのない PC）

1. 同梱の .tgz を展開します（Windows 10 以降は `tar -xzf <ファイル>`）。Node.js は別途インストールしておきます。
2. 展開したフォルダーで `npm start` を実行し、表示された URL（`http://127.0.0.1:4173`）をブラウザー（Chromium 系）で開きます。
3. `public/data/` が空（`dist/data/` に顧客パックの JSON がない）なら、架空企業の「お手本パック」で起動します（画面に「お手本パックで起動しています」と出ます）。顧客パックに切り替えるには、顧客パックの `data/*.json`・`brand/brand-profile.json` を `dist/data/`・`dist/brand/` に置きます（再ビルドは不要です）。

## 雛形のバージョン（FR-106）

雛形のバージョンは `package.json` の `version` です。設定パネルに表示されます。顧客パックの `customer.json` の `templateVersion` が、雛形のバージョンと互換でないとき（メジャーが違う、パックが新しい、メジャーが 0 の間はマイナーも違う）は、画面に警告を出します。

## 手動での確認

手順は `docs/manual-tests.md` の「FR-105 AC-128」を参照してください。
