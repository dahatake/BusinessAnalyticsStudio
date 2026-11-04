# 顧客パック作成 Prompt（GitHub Copilot ＋ WorkIQ 用）

GitHub Copilot（VS Code / CLI。WorkIQ MCP Server が使える状態）で、顧客パックのファイルを直接作らせる Prompt です。作ったファイルは、アプリの「顧客パックを取り込む」画面からアップロードします。Microsoft 365 Copilot 版（[m365-copilot-customer-pack.md](./m365-copilot-customer-pack.md)）との違いは次のとおりです。

| 観点 | M365 Copilot 版 | この版 |
|---|---|---|
| 出力 | コードブロックを人がファイル名で保存 | エージェントがファイルを直接書く |
| schema | 画面の kit をコピーして貼る（または customer-pack-kit.md を添付） | 同じ（kit に従う。見当たらないときは作らず kit を求める） |
| 検証 | アップロードの検証の結果で確かめる | エージェントが schema と照らして自己点検し、エラー箇所だけ自己修正。最後にアップロードの検証の結果で確かめる |
| 社内情報 | Researcher が直接 | WorkIQ（`ask` など）で取得 |

## 事前準備

1. WorkIQ が使えることを確認します（未同意なら `accept_eula`）。
2. アプリの画面（「はじめての方へ」の顧客パックの節）の kit の「コピー」ボタンで kit をコピーし、チャットに貼り付けます。
3. 追加資料があれば、パスを書きます。
4. 下の Prompt の先頭の変数だけを書き換えます。

## Prompt

````text
# 変数（ここだけ書き換える）
CUSTOMER = 【顧客名】
PROJECT = 【Project 名】
GOAL = 【商談の目的・論点】
INTENSITY = 【Executive / Showcase / Entertainment。未記入なら Showcase】
MATERIALS = 【追加資料のパス。なければ なし】
OUT = 【作ったファイルを置くフォルダー。例: 顧客パック】

# 役割
あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。以降の ${CUSTOMER}・${PROJECT} は上の変数の値です。

# 添付の確認
添付または貼り付けの customer-pack-kit.md（顧客パックの schema 全 10 ファイルとお手本パックを 1 つにまとめたもの）が見当たらないときは、顧客パックを作らず、私に添付を求めてください。

# 手順
1. 社内情報の調査: WorkIQ で ${CUSTOMER} に関するメール・会議・Teams・SharePoint を調べます（${GOAL} に関係するもの優先）。取得できない項目は「未確認」と記録し、推測で埋めません。
2. 公開情報の調査: Web で事業・組織・課題・取り組みを調べます。
3. ブランド調査: 優先順位は ①ブランドガイドライン ②プレスキット ③公式サイト ④IR 資料。出典は公式のみ。不明な項目は既定テーマにします。
4. 生成: customer-pack-kit.md の schema に厳密に従い（お手本パックは形式の参考のみ。内容は流用しない）、${OUT} に、フォルダー名を付けず、次のファイル名で作ります。
   - 顧客パックのファイル 10 個: customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json, brand-profile.json
   - 調査の記録（任意）: customer-research.md, BRAND-RESEARCH.md
5. 自己点検: 作った JSON を schema と照らし、不足・型の違い・存在しない ID の参照を探します。見つけたら該当箇所だけ作り直し、最大 3 回まで繰り返します。

# 規則
- 出典のない数値は置かない。AI が作ったデータの作成者種別は「AI生成」。
- WorkIQ 由来の出典には機密区分 internal または shareable を付ける（迷えば internal）。
- 種別 person のエンティティは役割名だけ。個人名・連絡先は、明示指示がない限り書かない。
- entities.json の全エンティティに world（real / digital）と kind を付ける。
- schema にないプロパティを足さない。ID 参照は存在する ID だけ。
- ロゴの利用条件が不明なら logo.status は unknown。
- 日付は ISO 形式、UTF-8、JSON は 2 スペース、コメントなし。演出強度は ${INTENSITY} のまま。
- ${OUT} 以外のファイルを変更しない。コミットしない（顧客の情報のため）。

# 最終報告（10 行以内）
調査の要約 / 自己点検の結果（直した箇所） / 未確認・人が確かめる事項 / 自己点検の表（規則ごとに ○×）
````

## 補足

- 作ったファイルは、アプリの「顧客パックを取り込む」画面で、複数選択かドラッグ＆ドロップでアップロードします。検証の結果にエラーが出たら、ファイル名と項目名の部分だけを直させて、もう一度アップロードします。
- 顧客パックは顧客の情報です。共有の場所やコード管理には置かないでください。
- 担当者向け: パイプラインで一括実行する場合は `npm run pipeline -- all --customer "<顧客名>" --project "<Project 名>"` も使えます。
