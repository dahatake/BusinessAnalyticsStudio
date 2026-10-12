# Business Analytics Studio ドキュメント

目的や役割に合わせて、読む場所を選んでください。

| あなたは | 読むもの |
|---|---|
| **このアプリを使う**事業部長・Product Manager・戦略コンサルタント | [利用者向け（01〜03）](#1-利用者向け) |
| **このアプリをカスタマイズ・運用する** Software Engineer | [Software Engineer 向け（engineering/）](#2-software-engineer-向けカスタマイズ運用) |
| **AI 開発キット（conductor）で**このアプリを開発・改修する人 | [開発キット向け（build-kit/）](#3-開発キット向けconductor-で開発を進める) |

## 1. 利用者向け

初めて使う方は、01 から順に読んでください（30 分ほど）。

| 文書 | 内容 |
|---|---|
| [01. クイックスタート](01-quick-start.md) | 起動、画面の見方、ペルソナ、20 画面の説明（スクリーンショットつき）、議論中の機能、編集、エクスポート、AI、設定、困ったとき |
| [02. 顧客との議論の進め方](02-meeting-playbook.md) | 準備のチェックリスト、相手別の見せ方、30 分・60 分・ワークショップのシナリオ、議論のあとの作業 |
| [03. 用語集と情報の取り扱い](03-glossary-and-data-handling.md) | 用語集、情報の保存先、AI を使うときの約束、顧客に渡す資料のチェック |

画像は [images/](images) にあります（お手本パックで撮影）。

## 2. Software Engineer 向け（カスタマイズ・運用）

| 文書 | 内容 |
|---|---|
| [1. アーキテクチャ](engineering/01-architecture.md) | 設計の原則、技術スタック、ディレクトリ構成、起動時のデータの流れ、画面とレイアウト、状態と保存 |
| [2. 顧客パック](engineering/02-customer-pack.md) | 構成、9 つのデータファイル、守る決まり、生成パイプライン、検証、アプリへの反映、スキーマの変更 |
| [3. ブランドとテーマ](engineering/03-branding-and-theme.md) | brand-profile.json、色・ロゴ・フォント・BGM の差し替え、アクセシビリティの基準、ブランド調査の決まり |
| [4. 画面・機能の追加](engineering/04-extending.md) | 画面・コマンド・AI 処理・顧客パックの項目の足し方、守ること |
| [5. AI と中継プロセス](engineering/05-ai-relay.md) | 構成、起動と設定、HTTP の仕様、顧客データの保護、トラブルシュート |
| [6. テストと検証](engineering/06-testing.md) | テストの層、System Test、書き方、変更前のチェックリスト |
| [7. ビルド・配布・運用](engineering/07-build-and-distribution.md) | 環境、コマンド一覧、ビルドの成果物、配布パッケージ、依存の更新、iPad、運用上の注意 |

## 3. 開発キット向け（conductor で開発を進める）

要求定義書・カタログ・System Test の一貫性を保ちながら、custom agent `conductor` に `/build` で依頼して、無人で開発を進める仕組み（Enterprise App Build Kit）の手順書です。

| 文書 | 内容 |
|---|---|
| [1. 依頼の書き方](build-kit/01-writing-requests.md) | `/build` と雛形、run_options、初回と 2 回目以降、実行環境、Spec Kit の取り込み |
| [2. 実行中と終了後](build-kit/02-during-and-after-run.md) | 進捗の確認、停止したときの再開、終了後に読むもの、マージ、次の依頼、`/work` の整理 |
| [3. 仕組み（工程と役割）](build-kit/03-how-it-works.md) | 工程 1〜6、作業役と skills、管理データの関係、worktree と統合 |
| [4. カスタマイズ](build-kit/04-customization.md) | `scripts/ebak.config.json`、models の較正、verify.commands、gates |
| [5. スクリプトリファレンス](build-kit/05-scripts-reference.md) | verify・rdcheck・rdfix・ledger・run-state・integrate・kpi など |
| [6. 品質ゲート](build-kit/06-quality-gates.md) | 検査（CHK）、hook のゲート（G-1〜G-7）、rdfix |
| [7. トラブルシューティング](build-kit/07-troubleshooting.md) | 拒否・差し戻し、run が止まる、verify の失敗、Windows 固有、ログの場所 |
| [8. ロードマップと KPI](build-kit/08-roadmap.md) | キットの位置づけ、KPI、改善の進め方 |

管理データ（要求・カタログ・試験の状態）の確認には、[EABK Studio](../EABK-Studio/users-guide/README.md)（データ層のビューアー。役割別のガイドつき）を使えます。

## 4. そのほかの文書

| 文書 | 内容 |
|---|---|
| [../README.md](../README.md) | リポジトリの概要、セットアップ、起動、ブランド、顧客パック、iPad |
| [../docs/distribution.md](../docs/distribution.md) | 配布パッケージの作り方と使い方 |
| [../docs/requirements-definition.md](../docs/requirements-definition.md) | 要求の正本 |
| [../docs/catalog.md](../docs/catalog.md) | 要求と実装の対応表 |
| [../docs/manual-tests.md](../docs/manual-tests.md) | 手動テストの手順 |
| [../tests/system/CONTRACT.md](../tests/system/CONTRACT.md) | System Test が前提にするアプリの契約 |
| [../CREDITS.md](../CREDITS.md)・[../LICENSE](../LICENSE) | 権利とライセンス |

## ファイル構成

```
users-guide/
  README.md                         このファイル（索引）
  01-quick-start.md                 利用者: クイックスタート
  02-meeting-playbook.md            利用者: 議論の進め方
  03-glossary-and-data-handling.md  利用者: 用語集・情報の取り扱い
  images/                           利用者向けのスクリーンショット
  engineering/                      Software Engineer 向け（01〜07）
  build-kit/                        開発キット向け（01〜08）
```
