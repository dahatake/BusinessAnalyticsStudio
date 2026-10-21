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
export const PACK_SAMPLE = 'examples/mono';

/** M365 Copilot に貼る Prompt の要点（全文は docs/prompts/m365-copilot-customer-pack.md） */
export const PACK_PROMPT_POINTS = [
  'あなたは、商談の分析ボード用の「顧客パック」を作る調査・編集担当です。',
  '顧客名と Project 名を入れて、顧客とブランドを調べ、出典つきで次のファイルを作ってください。',
  '- public/data/ の customer.json, entities.json, issues.json, products.json, plan.json, architecture.json, mocks.json, show.json, sources.json',
  '- public/brand/brand-profile.json',
  '規則: 添付の schema/*.json に従う。出典のない数値は置かない。AI が作ったデータは「AI生成」にする。',
].join('\n');

export const PACK_COMMANDS = {
  pipeline: 'npm run pipeline -- all --customer "<顧客名>" --project "<Project 名>"',
  check: 'npm run check:pack -- <フォルダー>',
  verify: 'npm run verify:pack -- <作業フォルダー>',
  build: 'npm run build',
  start: 'npm start',
} as const;