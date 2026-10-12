# 7. ビルド・配布・運用

対象: アプリをビルドして顧客へ届ける・保守する Software Engineer。

## 7.1 環境

| 項目 | 内容 |
|---|---|
| 対応ブラウザー | Windows / macOS の最新の Microsoft Edge・Google Chrome。iPad の Safari は、インクとタッチの主要機能が対象 |
| 開発・生成 | Node.js LTS（v22 以上）、Git、（AI の実接続に）GitHub Copilot CLI |
| セットアップ | Windows: `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1`／macOS: `bash scripts/setup.sh` |

セットアップスクリプトは、不足しているものだけを導入します（Node.js・Git・Copilot CLI、依存パッケージ、Copilot SDK、Playwright Chromium、ビルド、`.env` の雛形、中継プロセスの疎通、お手本パックでの `verify:pack`）。**繰り返し実行しても安全**で、管理者権限は要りません。`-DryRun`（macOS は `--dry-run`）で、実行する内容の一覧を見るだけにできます。記録は `logs/setup.log` です。詳細は [README の 1 章](../../README.md#1-セットアップスクリプトの使い方) を見てください。

## 7.2 コマンド一覧

| やりたいこと | コマンド |
|---|---|
| 開発サーバー（お手本パックを重ねて配信） | `npm run dev`（別のお手本は `EDB_PACK=koto npm run dev`） |
| 型検査 + ビルド（`dist/`） | `npm run build` |
| ビルド済みの配信（`http://127.0.0.1:4173`） | `npm start` |
| 型検査だけ | `npm run typecheck` |
| 単体・結合テスト | `npm test` |
| 回帰テスト | `npm run regression` |
| JSON Schema の再生成 | `npm run gen:schema`（`-- --check` で差分の検査） |
| AI の中継プロセス | `npm run relay` |
| 顧客パックの生成・検証 | `npm run pipeline` / `npm run check:pack` / `npm run verify:pack` |
| 配布パッケージの作成 | `npm run package` |

> 開発サーバー（`npm run dev`）は、初回の読み込みに時間がかかることがあります。画面の確認や撮影には、ビルド済みの `npm start` が安定しています。

## 7.3 ビルドの成果物と顧客パックの分離

- `dist/` には、**顧客固有のデータを含めません**（FR-100）。
- ビルドは、`examples/mono` のお手本パックを `dist/example-pack/` に同梱します（顧客パックがないときの起動用。FR-104）。
- 顧客パックは、配信側が `/data/`・`/brand/`・`/assets/brand/` に重ねます。ビルド済みの `dist/` に置くなら、`dist/data/`・`dist/brand/`・`dist/assets/brand/` です（再ビルド不要）。
- 開発サーバーは、`examples/<EDB_PACK>/` を同じパスに重ねて配信します（[vite.config.ts](../../vite.config.ts)）。

## 7.4 配布パッケージ（オフラインで動く .tgz）

```
npm ci
npm run build
npm run package        # work/package/business-analytics-studio-<バージョン>.tgz
```

- 依存パッケージのバージョンは固定です（`package.json` は範囲指定なし、`package-lock.json` あり）。`node_modules` を同梱し、展開した PC はネットワークなしで動きます。外部の CDN・Web フォント・API は使いません（生成 AI・音声・手書き認識はモック）。
- 同梱するものは許可リスト（`scripts/lib/package.ts`）で決めます。**含めないもの**: `.env`・`.env.*`（`.env.example` は含む）、顧客パック（`public/data/`・`public/brand/`・`assets/brand/` と `dist/` に複製された同等のもの）、`.git`・`work/`・`tests/`・管理用の Python スクリプト。
- 受け取る側: 展開（Windows 10 以降は `tar -xzf`）→ Node.js を別途導入 → `npm start` → `http://127.0.0.1:4173`。

詳細と手動確認の手順は [docs/distribution.md](../../docs/distribution.md)・`docs/manual-tests.md`（FR-105 AC-128）です。

## 7.5 雛形のバージョン

`package.json` の `version` が雛形のバージョンです（設定パネルに表示）。顧客パックの `customer.json` の `templateVersion` が互換でないと、画面に警告が出ます（[2.6](02-customer-pack.md#26-バージョンの互換)）。形式を壊す変更を入れたら、メジャー（0 の間はマイナー）を上げます。

## 7.6 依存パッケージの更新

1. `package.json` の版を、固定のまま（範囲指定なし）で更新し、`npm install` で `package-lock.json` を更新する。
2. `npm run regression` を実行する（ビルド・お手本パックでの verify・単体・結合）。
3. `tests/system/` の依存（Playwright）を更新したときは、`tests/system/` で `npm ci` し直す。
4. 3D アセットやフォントなど、権利のあるものを足したら、[CREDITS.md](../../CREDITS.md) を更新する（権利のテストがあります）。

## 7.7 iPad 実機での確認

手順は [README の 6 章](../../README.md#6-ipad-実機での確認手順) です。LAN から見える形で `npx vite preview --host 0.0.0.0 --port 4173` を起動し、確認が終わったら止めます。中継プロセスは 127.0.0.1 だけで待ち受けるため、iPad からの AI 実接続はモックのままです。結果は `docs/manual-tests.md` の「NFR-ENV-001 AC-166」の手順で記録します。

## 7.8 運用上の注意

| 項目 | 内容 |
|---|---|
| 秘密値 | `.env` は git に入れない。顧客の情報・認証情報をスクリプトやコードに入れない |
| 公開 | `npm start` と中継プロセスは 127.0.0.1。社外・社内ネットワークへ公開しない |
| 顧客データ | 顧客パックは作業フォルダー（既定は `work/envisioning/`）に置き、リポジトリへ入れない。`work/` は git の管理対象外で、14 日で削除される |
| 権利 | ロゴは利用条件を確認してから使う。`logo.status` が `unknown` のものは外に出さない |
| ライセンス | [LICENSE](../../LICENSE) と [CREDITS.md](../../CREDITS.md) |
