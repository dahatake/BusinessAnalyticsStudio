# 04. 外部ファイルの対応形式

Business Analytics Studio が、外部のファイルと入出力できる形式の一覧です。`src/` の実装を調べた事実（2026-10-22 時点）に基づきます。ファイルの内容は、ブラウザーの中だけで読み書きし、外部へは送りません。コードを変えたときは、この文書も直してください。

## 取り込み

| 取り込むもの | 画面・操作 | 形式（拡張子） | 条件 | コードの位置 |
|---|---|---|---|---|
| 顧客パック JSON | 起動時に自動で読む（`/data/*.json` と `/brand/brand-profile.json`）。顧客パックの置き方は [Software Engineer 向け](engineering/02-customer-pack.md) | `.json` | 顧客パックのフォルダーに置く。問題のある項目だけ無効にして起動する | `src/data/loader.ts` |
| データ（顧客パックのデータ）の JSON/CSV | 編集モードを ON にして「データのインポート」。確認ダイアログで「置き替える」と、現在のデータを置き換える（元に戻せる） | `.json` / `.csv` | 編集モードが ON のときだけ。拡張子が `.csv` なら CSV。`.json` なら JSON。どちらでもなく先頭が `{` でなければ CSV とみなす。検証に通らないと取り込まない | `edit/EditControls.tsx`（src/ 配下）、`src/edit/model.ts` |
| 議論メモ | 議論の画面の「開く」 | `.md`（Markdown 内の JSON ブロックから復元） | 書き出した議論メモが対象。読めなければ、現在のデータは変わらない | `discussion/FileActions.tsx`（src/ 配下）、`src/discussion/restore.ts` |
| データカタログ（企業データカタログ） | データカタログの画面の「企業データカタログのファイル」 | `.json` / `.csv` | 5 MB 超のファイルは読まない（取り込みを拒否）。拒否したときは取り込み済みの内容は変わらない | `screens/DataCatalogScreen.tsx`（src/ 配下）、`src/store/datacatalog.ts` |
| ボードへの画像の貼り付け | ホワイトボード・インクの道具の「画像を貼り付け」（クリップボードの画像） | 画像（クリップボードの `image/*`） | 先にクリップボードへ画像をコピーしておく。最大辺 400 まで縮小して、表示範囲の中央に置く。画像がなければ通知が出る | `ink/InkToolbar.tsx`（src/ 配下） |

エンコーディングは、ブラウザーの `File.text()` による UTF-8 として読みます。

### 未対応の形式

次は、取り込みの欄がないため、**未対応**です（対応として扱いません）。

- PDF
- 画像ファイル（`.png` `.jpg` など。ボードへはクリップボードの貼り付けだけ）
- Office 文書（Word・Excel・PowerPoint）
- 非定型テキスト（形式が決まっていないメモ・議事録など）

これらは、通常の取り込みでは読み込めません。次の「AI 取り込み」を使います。

### AI 取り込み（Foundry 設定済みのときだけ）

データカタログの画面の「AI 取り込み」で、上の未対応の形式（PDF・画像・Office 文書・非定型テキスト）を、生成 AI（Microsoft Foundry）で読み取って取り込めます。**次の 3 つがそろっているときだけ**選べます。欠けているときはボタンが無効になり、欠けている条件と設定画面への案内が表示されます（Foundry は呼ばれません）。

1. 設定画面で Foundry の接続設定が「設定済み」（認証方式は API キーでも Microsoft Entra ID でもよい）。
2. 設定画面で Foundry の実接続（送信）を有効にしている。
3. 起動中の案件に顧客の了承の記録がある。

使い方: 「AI 取り込み」を押し、ファイルを選ぶと、送信前に「費用が発生すること」「送信されるのは選んだファイルの内容であること」「個人情報が含まれうること」の確認が出ます。確認すると、ローカルの中継プロセスだけが Foundry に送り、結果が「取り込みのプレビュー」に出ます。「反映」を押すまで既存のデータは変わらず、「破棄」で取り消せます。

- ファイル 1 件の大きさは 10 MB までです（超えると送らず理由を表示します）。
- 呼び出しは「現状の説明」と同じ月の予算の概算費用に算入され、停止の水準に達すると呼び出されません。
- 失敗したときは原因と次の行動が表示され、既存のデータは変わりません。
- API キーは画面・ログ・エラーに表示されません。

コードの位置: `src/ai/AiImport.tsx`（画面）、`src/ai/aiImportLogic.ts`（条件・上限・予算）、`scripts/relay/relay.ts` の `/foundry/import`（中継プロセス）。

## 書き出し

| 書き出すもの | 画面・操作 | 形式（拡張子） | 条件 | コードの位置 |
|---|---|---|---|---|
| データの JSON | 「データのエクスポート」→ JSON | `.json`（`<日付>-顧客名-Project名-data.json`） | なし（データが読み込み済み） | `edit/EditControls.tsx`（src/ 配下）、`src/edit/model.ts` |
| データの CSV | 「データのエクスポート」→ CSV | `.csv`（BOM つき UTF-8。Excel で開ける） | なし（データが読み込み済み） | `edit/EditControls.tsx`（src/ 配下）、`src/edit/model.ts` |
| 議論メモ | 議論の画面の「保存」でファイル名を指定 | `.md` | 拡張子がなければ `.md` を付ける。既定は日付・顧客名・Project 名から作る | `discussion/FileActions.tsx`（src/ 配下） |
| エクスポート（Markdown） | ヘッダーの「エクスポート」（Ctrl+Shift+E）で形式 `.md` | `.md`（1 ファイル） | 出力範囲を選ぶ。社内限定の情報は匿名化するか、確認が必要 | `export/ExportDialog.tsx`（src/ 配下）、`src/export/build.ts`、`src/export/deliver.ts` |
| エクスポート（ZIP） | 同上で形式 `.zip` | `.zip`（Markdown と `assets/` の図。「フォローアップ文書も生成する」で `.md` 3 点を追加） | 保存先の指定に対応するブラウザーは保存先を指定。ほかはダウンロード | `export/ExportDialog.tsx`（src/ 配下）、`src/export/followup.ts`、`src/export/zip.ts` |
| Engagement サマリーパック | ヘッダーの「Engagement サマリーパック」（ワンクリック） | `.zip`（PDF と Markdown） | 人物情報の確認を通ったときだけ出力する | `export/ExportButton.tsx`（src/ 配下）、`src/export/summaryPack.ts`、`src/export/pdf.ts` |
| ボードの Markdown ZIP | ホワイトボードの「Markdown 出力」。このボード／すべてのボードを選ぶ | `.zip`（ボードごとの `.md` と `assets/` の `.svg`） | 1 枚以上選ぶ | `export/BoardMarkdownDialog.tsx`（src/ 配下）、`src/export/inkMarkdown.ts` |
| ボードの PDF | ホワイトボードの「PDF 出力」 | `.pdf` | 出力するものがない範囲は出力できない | `export/BoardPdfDialog.tsx`（src/ 配下）、`src/export/pdfdoc.ts` |
| 図の SVG・PNG・テキスト（アーキテクチャ・議論ツリー） | アーキテクチャの画面と議論ツリーの画面のエクスポート | `.svg`、`.png`、テキスト（`.mmd` Mermaid、議論ツリーは `.json`） | 外部の資源を使わない SVG を PNG に変換する | `screens/ArchitectureScreen.tsx`（src/ 配下）、`screens/DiscussionTreeScreen.tsx`（src/ 配下）、`src/analysis/exportFile.ts` |
| ショート動画 | ヘッダーの「ショート動画を書き出す」 | `.webm`（9:16・約 60 秒） | WebM の録画に対応するブラウザーだけ | `show/ShortVideo.tsx`（src/ 配下） |
