// フォローアップ文書の生成（FR-055）。エクスポートと同時に、次の 3 種類を作る。
// - 次回アジェンダ: 未決事項・決定の確認・次のアクション
// - 顧客への確認依頼事項: 未決事項
// - 合意事項サマリー（メール本文用）: 決定事項
// 純粋な関数だけで書く。入力は議論テーマ（匿名化の済んだもの）だけで、元の課題の機密を引き継ぐ置き換えは呼び出し側が行う。
import { STATUS_DISPLAY_LABEL, type Theme } from '../discussion/model';
import { tr } from '../i18n/translate';

export interface FollowUpInput {
  customerName: string;
  projectName: string;
  themes: readonly Theme[];
  now?: Date;
}

export interface FollowUpDoc {
  /** ZIP 内の `followup/` の下のファイル名 */
  fileName: string;
  title: string;
  content: string;
}

export const FOLLOWUP_TITLES = {
  agenda: '次回アジェンダ',
  requests: '顧客への確認依頼事項',
  summary: '合意事項サマリー（メール本文用）',
} as const;

const oneLine = (s: string): string => s.replace(/\s*\r?\n\s*/g, ' / ').trim();
const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function perTheme(themes: readonly Theme[], pick: (t: Theme) => string): string[] {
  const out: string[] = [];
  for (const t of themes) {
    const ls = lines(pick(t));
    if (ls.length === 0) continue;
    out.push(`### ${oneLine(t.title)}`, '', ...ls.map((l) => `- ${l}`), '');
  }
  return out;
}

export function buildFollowUps(input: FollowUpInput): FollowUpDoc[] {
  const { themes } = input;
  const NA = tr('該当なし');
  const unset = tr('未定');
  const noText = tr('（内容なし）');
  const who = `${input.customerName} ${input.projectName}`;
  const date = ymd(input.now ?? new Date());

  const openIssues = perTheme(themes, (t) => t.openIssues);
  const decisions = perTheme(themes, (t) => t.decisions);
  const pending = themes.filter((t) => t.status !== 'decided');
  const actions = themes.flatMap((t) => t.actions.map((a) => ({ t, a })));
  const created = `${who}（${tr('作成日')}: ${date}）`;

  const agenda = [
    `# ${tr(FOLLOWUP_TITLES.agenda)}`, '', created, '',
    `## 1. ${tr('未決事項の確認')}`, '', ...(openIssues.length > 0 ? openIssues : [NA, '']),
    `## 2. ${tr('決定事項の確認')}`, '', ...(decisions.length > 0 ? decisions : [NA, '']),
    `## 3. ${tr('継続して検討するテーマ')}`, '',
    ...(pending.length > 0 ? pending.map((t) => `- ${oneLine(t.title)}（${tr(STATUS_DISPLAY_LABEL[t.status])}）`) : [NA]), '',
    `## 4. ${tr('次のアクションの進捗')}`, '',
    ...(actions.length > 0 ? actions.map(({ t, a }) => `- ${oneLine(a.text) || noText}（${tr('テーマ')}: ${oneLine(t.title)}／${tr('担当')}: ${a.owner || unset}／${tr('期限')}: ${a.due || unset}）`) : [NA]), '',
  ].join('\n');

  const requests = [
    `# ${tr(FOLLOWUP_TITLES.requests)}`, '', created, '',
    tr('次回までに、次の点をご確認ください。'), '',
    ...(openIssues.length > 0 ? openIssues : [NA, '']),
  ].join('\n');

  const summary = [
    `# ${tr(FOLLOWUP_TITLES.summary)}`, '', `${tr('件名')}: 【${who}】${tr('合意事項のご確認')}（${date}）`, '',
    tr('お世話になっております。本日の議論で合意した事項を、次のとおりまとめました。内容に相違があればお知らせください。'), '',
    ...(decisions.length > 0 ? decisions : [NA, '']),
    `${tr('次のアクション')}:`, '',
    ...(actions.length > 0 ? actions.map(({ a }) => `- ${oneLine(a.text) || noText}（${tr('担当')}: ${a.owner || unset}／${tr('期限')}: ${a.due || unset}）`) : [NA]), '',
    tr('どうぞよろしくお願いいたします。'), '',
  ].join('\n');

  return [
    { fileName: `${tr('次回アジェンダ')}.md`, title: tr(FOLLOWUP_TITLES.agenda), content: agenda },
    { fileName: `${tr('顧客への確認依頼事項')}.md`, title: tr(FOLLOWUP_TITLES.requests), content: requests },
    { fileName: `${tr('合意事項サマリー')}.md`, title: tr(FOLLOWUP_TITLES.summary), content: summary },
  ];
}
