# 顧客パック作成 Prompt（Microsoft 365 Copilot 用）

Microsoft 365 Copilot（Researcher / Work モード）に、顧客とブランドを調べさせ、顧客パックの JSON と調査記録を一度に作らせる Prompt です。社内の情報（メール・会議・Teams・SharePoint）と公開 Web の両方を、出典つきで使えます。

## 事前準備

1. 次のファイルを Copilot のチャットに添付します。
   - `schema/*.json`（各ファイルの JSON Schema。出力の形式の正本）
   - `examples/mono/` のお手本パック（形式の参考。内容は流用しません）
2. 追加資料（提案書、議事録、IR 資料など）があれば、あわせて添付します。
3. 下の Prompt の【…】を埋めます。

## Prompt

````text
あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。Researcher / 仕事（Work）モードで、私がアクセスできるメール・会議・Teams・SharePoint と、公開 Web の両方を使って調べてください。

# 入力
- 顧客名: 【顧客名】
- Project 名: 【Project 名】
- 商談の目的・論点: 【商談の目的・論点】
- 演出強度: 【Executive / Showcase / Entertainment のいずれか。未記入なら Showcase】
- 追加資料: 【添付した資料の名前。なければ「なし」】

# 調査
1. 顧客の事業・組織・課題・取り組みを調べます。社内情報（メール・会議・Teams・SharePoint）と公開 Web を使います。
2. ブランドを調べます。優先順位は ①ブランドガイドライン ②プレスキット ③公式サイト ④IR 資料 です。出典は公式のものだけにします。分からない項目は、既定のテーマにします。

# 作るファイル
次のファイルを、添付の schema/*.json に厳密に従って作ります。
- public/data/: customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json
- public/brand/: brand-profile.json
- data/customer-research.md（顧客調査の記録）
- brand/BRAND-RESEARCH.md（ブランド調査の記録）

# 守る規則
- 出典のない数値は置きません。
- AI が作ったデータの作成者の種別は「AI生成」にします。
- 社内情報（WorkIQ）に由来する出典には、機密区分 internal または shareable を付けます。迷うときは internal にします。
- 個人の連絡先や機微な個人情報は、既定では書きません（種別「人」のエンティティには、役割名だけを入れます。個人名・連絡先は、指示で明示されたときだけ書きます）。種別「人」を含む顧客パックは、アプリが外部 AI への送信やエクスポートの前に確認を出します（要求定義書 FR-219）。
- schema にないプロパティは足しません。
- ID の参照は、すべて存在する ID だけにします。
- ロゴの利用条件が確認できないときは、logo.status を unknown にします。
- 日付は ISO 形式、文字コードは UTF-8、JSON は 2 スペースのインデントにします。JSON にコメントは書きません。
- 演出強度は入力のとおりにします。

# 出力の形式
次の順で出力します。
1. 調査の要約
2. ファイルごとの完全なコードブロック（見出しにファイルのパス。省略記号で端折らず、全文を書く）
3. 出典の一覧
4. 確認事項（人が確かめるべきこと）
5. 自己点検の表（上の規則ごとに、守れたかを ○ / × で示す）
````

## 出力を顧客パックにする

1. 出力されたコードブロックを、ファイルのパスどおりに `work/envisioning/<顧客名>/` へ保存します。
2. 出典の機密区分（internal / shareable）とロゴの状態（logo.status）を確かめ、必要なら直します。
3. 次のコマンドで検証します。
   ```
   npm run check:pack -- work/envisioning/<顧客名>
   npm run verify:pack -- work/envisioning/<顧客名>
   ```
4. エラーが出たら、エラーの部分だけを Copilot に貼って、その部分だけを作り直させます。

顧客パックは顧客の情報です。このリポジトリにコミットしないでください。
