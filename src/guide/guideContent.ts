// 初心者向けアプリ内ガイド（FR-266〜FR-268・FR-272）の文言。メイン画面の「はじめての方へ」・ウェルカムのダイアログ・分析画面の「使い方」が共有する。
// コマンド・パスは、README.md と users-guide/01-quick-start.md §13 に合わせる（FR-268 AC-684。tests/unit/guide.test.ts が実在を確かめる）。
// 1 文は 60 字以内（FR-266 AC-675）。

export const GUIDE_WHAT = [
  'このアプリは、顧客との商談で使う分析ボードです。',
  '企業と Project を登録して、課題や計画を画面で整理できます。',
] as const;

export const GUIDE_TERMS = [
  { term: '企業', text: '取り組む相手の会社です。' },
  { term: 'Project', text: '企業ごとの、分析のまとまりです。' },
  { term: 'デモ', text: '架空の企業のお手本です。お手本パックとも呼びます。' },
  { term: '顧客パック', text: '顧客ごとの課題や計画などをまとめたデータのフォルダーです。' },
] as const;

export const GUIDE_STEPS = [
  { name: '企業を登録', what: '取り組む企業の名前を登録します。', example: 'ミズホ精機株式会社', next: '企業の欄が、画面に出ます。' },
  { name: 'Project を作成', what: '企業の下に、分析の Project を作ります。', example: '2026 年度 DX 構想', next: '企業の欄に、Project の名前が並びます。' },
  { name: 'Project を開く', what: '作業先を選んで開きます。', example: '「デモ」を選ぶと、顧客パックがなくても試せます。', next: '分析画面が開きます。' },
  { name: '分析を開始', what: '分析手法を選んで、分析を始めます。', example: '左のメニューから、見たい画面を選びます。', next: '選んだ画面に、分析の内容が出ます。' },
] as const;

/** 全体の流れの図の代替テキスト（FR-266 AC-676） */
export const FLOW_ALT = '全体の流れの図です。1 企業を登録、2 Project を作成、3 Project を開く、4 分析を開始の順に、矢印でつながっています。';

/** 分析画面の「使い方」だけの最初のカード（FR-272） */
export const GUIDE_WORKSPACE = {
  view: [
    '左のメニューで、見たい画面を選びます。',
    '上の段に、作業先と Project が出ます。',
    '中央に、選んだ画面が出ます。',
  ],
  ops: [
    '「作業先」で、デモや Project を切り替えます。',
    '「メイン画面へ戻る」で、最初の画面に戻ります。',
    '「使い方」で、この説明をもう一度見られます。',
  ],
  pack: '顧客パックは、顧客ごとのデータのまとまりです。作り方は、あとのカードにあります。',
} as const;

export const PACK_URL = 'http://127.0.0.1:4173';
export const PACK_PROMPT_FILE = 'docs/prompts/m365-copilot-customer-pack.md';
export const PACK_PROMPT_FILE_GHCP = 'docs/prompts/github-copilot-workiq-customer-pack.md';
export const PACK_SAMPLE = 'examples/mono';

/** 顧客パック作成 Prompt の全文（正本は docs/prompts/*.md。tests/unit/guide.test.tsx が一致を確かめる） */
export const PACK_PROMPT_M365 = [
  'あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。Researcher / 仕事（Work）モードで、私がアクセスできるメール・会議・Teams・SharePoint と、公開 Web の両方を使って調べてください。',
  '',
  '# 入力（以降の「顧客名」「Project 名」は、ここの値を指す）',
  '- 顧客名: 【顧客名】',
  '- Project 名: 【Project 名】',
  '- 商談の目的・論点: 【商談の目的・論点】',
  '- 演出強度: 【Executive / Showcase / Entertainment のいずれか。未記入なら Showcase】',
  '- 追加資料: 【添付した資料の名前。なければ「なし」】',
  '',
  '# 調査',
  '1. 顧客の事業・組織・課題・取り組みを調べます。社内情報（メール・会議・Teams・SharePoint）と公開 Web を使います。',
  '2. ブランドを調べます。優先順位は ①ブランドガイドライン ②プレスキット ③公式サイト ④IR 資料 です。出典は公式のものだけにします。分からない項目は、既定のテーマにします。',
  '',
  '# 作るファイル',
  '次のファイルを、添付の schema/*.json に厳密に従って作ります。',
  '- public/data/: customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json',
  '- public/brand/: brand-profile.json',
  '- data/customer-research.md（顧客調査の記録）',
  '- brand/BRAND-RESEARCH.md（ブランド調査の記録）',
  '',
  '# 守る規則',
  '- 出典のない数値は置きません。',
  '- AI が作ったデータの作成者の種別は「AI生成」にします。',
  '- 社内情報（WorkIQ）に由来する出典には、機密区分 internal または shareable を付けます。迷うときは internal にします。',
  '- 個人の連絡先や機微な個人情報は、既定では書きません（種別「人」のエンティティには、役割名だけを入れます。個人名・連絡先は、指示で明示されたときだけ書きます）。種別「人」を含む顧客パックは、アプリが外部 AI への送信やエクスポートの前に確認を出します（要求定義書 FR-219）。',
  '- schema にないプロパティは足しません。',
  '- ID の参照は、すべて存在する ID だけにします。',
  '- ロゴの利用条件が確認できないときは、logo.status を unknown にします。',
  '- 日付は ISO 形式、文字コードは UTF-8、JSON は 2 スペースのインデントにします。JSON にコメントは書きません。',
  '- 演出強度は入力のとおりにします。',
  '',
  '# 出力の形式',
  '次の順で出力します。',
  '1. 調査の要約',
  '2. ファイルごとの完全なコードブロック（見出しにファイルのパス。省略記号で端折らず、全文を書く）',
  '3. 出典の一覧',
  '4. 確認事項（人が確かめるべきこと）',
  '5. 自己点検の表（上の規則ごとに、守れたかを ○ / × で示す）',
].join('\n');

export const PACK_PROMPT_GHCP = [
  '# 変数（ここだけ書き換える）',
  'CUSTOMER = 【顧客名】',
  'PROJECT = 【Project 名】',
  'GOAL = 【商談の目的・論点】',
  'INTENSITY = 【Executive / Showcase / Entertainment。未記入なら Showcase】',
  'MATERIALS = 【追加資料のパス。なければ なし】',
  'OUT = work/envisioning/${CUSTOMER}/',
  '',
  '# 役割',
  'あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。以降の ${CUSTOMER}・${PROJECT} は上の変数の値です。',
  '',
  '# 手順',
  '1. 社内情報の調査: WorkIQ で ${CUSTOMER} に関するメール・会議・Teams・SharePoint を調べます（${GOAL} に関係するもの優先）。取得できない項目は「未確認」と記録し、推測で埋めません。',
  '2. 公開情報の調査: Web で事業・組織・課題・取り組みを調べます。',
  '3. ブランド調査: 優先順位は ①ブランドガイドライン ②プレスキット ③公式サイト ④IR 資料。出典は公式のみ。不明な項目は既定テーマにします。',
  '4. 生成: `schema/*.json` と `examples/mono/`（形式の参考のみ。内容は流用しない）を読み、${OUT} に次を作ります。',
  '   - public/data/: customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json',
  '   - public/brand/brand-profile.json',
  '   - data/customer-research.md, brand/BRAND-RESEARCH.md（調査記録）',
  '5. 検証: `npm run check:pack -- ${OUT}` と `npm run verify:pack -- ${OUT} --generated` を実行します。エラーは該当箇所だけ再生成し、最大 3 回まで繰り返します。',
  '',
  '# 規則',
  '- 出典のない数値は置かない。AI が作ったデータの作成者種別は「AI生成」。',
  '- WorkIQ 由来の出典には機密区分 internal または shareable を付ける（迷えば internal）。',
  '- 種別 person のエンティティは役割名だけ。個人名・連絡先は、明示指示がない限り書かない。',
  '- entities.json の全エンティティに world（real / digital）と kind を付ける。',
  '- schema にないプロパティを足さない。ID 参照は存在する ID だけ。',
  '- ロゴの利用条件が不明なら logo.status は unknown。',
  '- 日付は ISO 形式、UTF-8、JSON は 2 スペース、コメントなし。演出強度は ${INTENSITY} のまま。',
  '- ${OUT} 以外のファイルを変更しない。コミットしない（顧客の情報のため）。',
  '',
  '# 最終報告（10 行以内）',
  '調査の要約 / 検証結果（コマンドと終了コード） / 未確認・人が確かめる事項 / 自己点検（規則ごとに ○×）',
].join('\n');

export const PACK_COMMANDS = {
  pipeline: 'npm run pipeline -- all --customer "<顧客名>" --project "<Project 名>"',
  check: 'npm run check:pack -- <フォルダー>',
  verify: 'npm run verify:pack -- <作業フォルダー>',
  build: 'npm run build',
  start: 'npm start',
} as const;