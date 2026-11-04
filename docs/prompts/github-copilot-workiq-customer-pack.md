# 顧客パック作成 Prompt（GitHub Copilot ＋ WorkIQ 用）

GitHub Copilot（VS Code / CLI。WorkIQ MCP Server が使える状態）で、リポジトリのファイルを直接作り、その場で検証まで行う Prompt です。Microsoft 365 Copilot 版（[m365-copilot-customer-pack.md](./m365-copilot-customer-pack.md)）との違いは次のとおりです。

| 観点 | M365 Copilot 版 | この版 |
|---|---|---|
| 出力 | コードブロックを人が保存 | エージェントがファイルを直接書く |
| schema | 添付が必要（`npm run pack:kit` で作る kit 1 ファイル） | `schema/*.json` をリポジトリから読む |
| 検証 | 人が実行 | `npm run check:pack` / `verify:pack` を自動実行し、エラー箇所だけ自己修正 |
| 社内情報 | Researcher が直接 | WorkIQ（`ask` など）で取得 |

## 事前準備

1. WorkIQ が使えることを確認します（未同意なら `accept_eula`）。
2. 追加資料があれば、`work/envisioning/materials/` などに置き、パスを書きます。
3. 下の Prompt の先頭の変数だけを書き換えます。

## Prompt

````text
# 変数（ここだけ書き換える）
CUSTOMER = 【顧客名】
PROJECT = 【Project 名】
GOAL = 【商談の目的・論点】
INTENSITY = 【Executive / Showcase / Entertainment。未記入なら Showcase】
MATERIALS = 【追加資料のパス。なければ なし】
OUT = work/envisioning/${CUSTOMER}/

# 役割
あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。以降の ${CUSTOMER}・${PROJECT} は上の変数の値です。

# 手順
1. 社内情報の調査: WorkIQ で ${CUSTOMER} に関するメール・会議・Teams・SharePoint を調べます（${GOAL} に関係するもの優先）。取得できない項目は「未確認」と記録し、推測で埋めません。
2. 公開情報の調査: Web で事業・組織・課題・取り組みを調べます。
3. ブランド調査: 優先順位は ①ブランドガイドライン ②プレスキット ③公式サイト ④IR 資料。出典は公式のみ。不明な項目は既定テーマにします。
4. 生成: `schema/*.json` と `examples/mono/`（形式の参考のみ。内容は流用しない）を読み、${OUT} に次を作ります。
   - public/data/: customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json
   - public/brand/brand-profile.json
   - data/customer-research.md, brand/BRAND-RESEARCH.md（調査記録）
5. 検証: `npm run check:pack -- ${OUT}` と `npm run verify:pack -- ${OUT} --generated` を実行します。エラーは該当箇所だけ再生成し、最大 3 回まで繰り返します。

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
調査の要約 / 検証結果（コマンドと終了コード） / 未確認・人が確かめる事項 / 自己点検（規則ごとに ○×）
````

## 補足

- 顧客パックは顧客の情報です。このリポジトリにコミットしないでください（`work/` は Git の対象外）。
- パイプラインで一括実行する場合は `npm run pipeline -- all --customer "<顧客名>" --project "<Project 名>"` も使えます。
