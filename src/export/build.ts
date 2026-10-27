// 全量エクスポートの Markdown の組み立て（FR-052〜FR-055）。純粋な関数だけで書き、画面の部品を参照しない（NFR-MAINT-001）。
// 15 種類の節（FR-053）・出力範囲（FR-054）・匿名化（FR-054、anonymizeInternal）・フォローアップ文書（FR-055）をここで作る。
import { buildDiscussionMemo } from '../discussion/memo';
import { tr } from '../i18n/translate';
import {
  RECORD_FIELDS, STATUS_DISPLAY_LABEL, defaultMemoFileName, sanitizeFilePart, statusOrigin, yyyymmdd, type Theme,
} from '../discussion/model';
import type { Board } from '../ink/model';
import { buildEntityGraph } from '../selection/graph';
import { ANONYMIZED_LABEL, anonymizeInternal, type PackData } from '../schema';
import type { ChangeEntry } from './changelog';
import { buildFollowUps } from './followup';
import { architectureSvg, boardSvg } from './svg';

export type ExportScope = 'all' | 'screen' | 'theme' | 'decisions';
export type ExportFormat = 'md' | 'zip';

export const SCOPE_LABELS: Record<ExportScope, string> = {
  all: '全体', screen: '画面別', theme: 'テーマ別', decisions: '決定事項のみ',
};

export interface ExportOptions {
  scope: ExportScope;
  /** scope が screen のとき、画面の key */
  screenKey?: string;
  /** scope が theme のとき、テーマの ID */
  themeId?: string;
  /** 機密区分 `internal` の項目を匿名化する（FR-054） */
  anonymize: boolean;
  format: ExportFormat;
  /** フォローアップ文書（次回アジェンダ・確認依頼事項・合意事項サマリー）を同時に作る（FR-055） */
  followUp: boolean;
}

export interface ExportInput {
  customerName: string;
  projectName: string;
  data: PackData;
  themes: readonly Theme[];
  boards?: readonly Board[];
  changes?: readonly ChangeEntry[];
  /** `registerSnapshotSource` で登録された、復元に使うデータ（全体の範囲だけ、機械可読の JSON ブロックに入れる） */
  snapshotData?: Record<string, unknown>;
  now?: Date;
}

export interface ExportFile {
  /** ZIP 内のパス、または単一ファイルの名前 */
  path: string;
  content: string;
}

export interface ExportResult {
  /** 出力の既定のファイル名（拡張子つき） */
  fileName: string;
  /** 単一の Markdown（format=md）。フォローアップ文書は末尾に続ける */
  markdown: string;
  /** ZIP の中身（format=zip）。`.md`・`assets/`・`followup/` */
  files: ExportFile[];
  /** プレビュー用の Markdown（front matter と機械可読データは除く） */
  preview: string;
  /** 機密区分 `internal` の項目の数（匿名化の前のデータで数える） */
  internalCount: number;
  anonymized: boolean;
}

/** 15 種類の節（FR-053）。見出しは要求の文言のとおり。 */
export const SECTIONS = [
  { id: 'overview', title: '顧客・案件の概要' },
  { id: 'summary', title: 'エグゼクティブサマリー' },
  { id: 'research', title: '調査データと出典' },
  { id: 'matrix', title: '課題-解決策マトリクスと優先順位' },
  { id: 'references', title: '参考文献' },
  { id: 'themes', title: 'テーマ別の議論' },
  { id: 'decisions', title: '決定事項・未決事項・次のアクション' },
  { id: 'graph', title: 'ナレッジグラフの関係表' },
  { id: 'architecture', title: 'アーキテクチャ' },
  { id: 'products', title: 'Microsoft 製品' },
  { id: 'gantt', title: 'ガント表' },
  { id: 'kpi', title: 'KPI・ROI' },
  { id: 'whiteboard', title: 'ホワイトボード' },
  { id: 'attribution', title: 'AI と人の区別' },
  { id: 'changes', title: '変更履歴' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export const NOT_APPLICABLE = '該当なし';

/** 画面別の範囲で出す節（画面の key → 節）。対応のない画面は概要だけを出す。 */
const SCREEN_SECTIONS: Record<string, readonly SectionId[]> = {
  'issue-solution': ['matrix', 'research', 'references'],
  table: ['overview', 'research', 'matrix', 'references', 'graph', 'products', 'gantt', 'kpi', 'attribution'],
  gantt: ['gantt'],
  whiteboard: ['whiteboard'],
  themes: ['themes', 'decisions'],
  settings: ['overview'],
  chat: ['summary'],
};

// ---------- 小さな書式の道具 ----------

const oneLine = (s: unknown): string => String(s ?? '').replace(/\s*\r?\n\s*/g, ' / ').trim();
const cell = (s: unknown): string => oneLine(s).replace(/\|/g, '\\|') || '—';

function table(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string[] {
  if (rows.length === 0) return [];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ];
}

/** 引用ブロックにして、本文中のフェンスや見出しが構造を壊さないようにする。 */
function quote(text: string): string {
  const t = text.trim();
  if (t === '') return `> ${tr('（未記入）')}`;
  return t.split(/\r?\n/).map((l) => (l === '' ? '>' : `> ${l}`)).join('\n');
}

const bullets = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`);

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

interface EvalValue { value?: number | string; unit?: string }
const evalText = (e: EvalValue | undefined): string => (e && e.value !== undefined ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : '');

// ---------- 入力の整え（匿名化） ----------

/** 機密区分 `internal` の項目を数える。 */
export function countInternal(value: unknown): number {
  let n = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Rec;
    if (o.classification === 'internal') n++;
    for (const x of Object.values(o)) walk(x);
  };
  walk(value);
  return n;
}

/** 機密区分 `internal` の項目の ID。 */
function collectInternalIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Rec;
    if (o.classification === 'internal' && typeof o.id === 'string') ids.add(o.id);
    for (const x of Object.values(o)) walk(x);
  };
  walk(value);
  return ids;
}

/** 機密区分 `internal` の課題から作ったテーマは、本文を置き換える（利用者が書いた内容も、元の課題の機密を引き継ぐ）。 */
function maskThemes(themes: readonly Theme[], internalIssueIds: ReadonlySet<string>): { themes: Theme[]; maskedIds: Set<string> } {
  const maskedIds = new Set<string>();
  const out = themes.map((t) => {
    if (!t.issueId || !internalIssueIds.has(t.issueId)) return t;
    maskedIds.add(t.id);
    const m: Theme = { ...t, title: ANONYMIZED_LABEL, aiProposal: t.aiProposal ? ANONYMIZED_LABEL : '' };
    for (const f of RECORD_FIELDS) m[f.key] = t[f.key].trim() === '' ? '' : ANONYMIZED_LABEL;
    m.actions = t.actions.map((a) => ({ ...a, text: a.text ? ANONYMIZED_LABEL : '', owner: a.owner ? ANONYMIZED_LABEL : '' }));
    return m;
  });
  return { themes: out, maskedIds };
}

// ---------- 節 ----------

interface Ctx {
  data: PackData;
  themes: readonly Theme[];
  boards: readonly Board[];
  changes: readonly ChangeEntry[];
  customerName: string;
  projectName: string;
  now: Date;
  withImages: boolean;
  /** 出力に含める画像（相対パス → SVG） */
  assets: Map<string, string>;
  label: (id: string) => string;
}

const sourceIdsText = (ids: unknown): string => (Array.isArray(ids) ? ids.map(String).join(', ') : '');

function priorityRank(e: EvalValue | undefined): number {
  if (!e || typeof e.value !== 'number') return Number.POSITIVE_INFINITY;
  return e.unit && e.unit.includes('位') ? e.value : -e.value;
}

function sectionOverview(c: Ctx): string[] {
  const cu = c.data.customer;
  const lines = [
    `- ${tr('顧客名')}: ${oneLine(cu.name)}`,
    `- ${tr('案件（Project）名')}: ${oneLine(cu.projectName)}`,
  ];
  if (cu.industryPreset) lines.push(`- ${tr('業種のプリセット')}: ${oneLine(cu.industryPreset)}`);
  const cands = cu.coreObject.candidates;
  if (cands.length > 0) {
    const sel = cu.coreObject.selectedId;
    lines.push(`- ${tr('中核となる対象')}: ${cands.map((x) => (x.id === sel ? `**${oneLine(x.label)}**（${tr('選択中')}）` : oneLine(x.label))).join(tr('、'))}`);
  }
  lines.push(`- ${tr('書き出した日時')}: ${c.now.toISOString()}`);
  return lines;
}

function sectionSummary(c: Ctx): string[] {
  const { issues, solutions } = c.data.issues;
  const ext = issues.filter((i) => i.audience === 'external').length;
  const themes = c.themes;
  const count = (s: Theme['status']) => themes.filter((t) => t.status === s).length;
  const lines = [
    `- ${tr('課題 {n} 件（社内向け {i} 件／社外向け {e} 件）、解決策 {s} 件、製品 {p} 件、計画のタスク {t} 件。', { n: issues.length, i: issues.length - ext, e: ext, s: solutions.length, p: c.data.products.products.length, t: c.data.plan.tasks.length })}`,
    `- ${tr('議論テーマ {n} 件（顧客決定 {a}／検討中 {b}／保留 {c}／AI 提案 {d}）。', { n: themes.length, a: count('decided'), b: count('considering'), c: count('on-hold'), d: count('ai-proposed') })}`,
  ];
  const ranked = [...issues].filter((i) => i.evaluation?.priority).sort((a, b) => priorityRank(a.evaluation?.priority) - priorityRank(b.evaluation?.priority)).slice(0, 3);
  if (ranked.length > 0) {
    lines.push(`- ${tr('優先度の高い課題')}:`);
    for (const i of ranked) lines.push(`  - ${oneLine(i.title)}（${tr('優先度')}: ${evalText(i.evaluation?.priority)}）`);
  }
  const decided = themes.filter((t) => t.decisions.trim() !== '');
  if (decided.length > 0) {
    lines.push(`- ${tr('決定事項')}:`);
    for (const t of decided) lines.push(`  - ${oneLine(t.title)}: ${oneLine(t.decisions)}`);
  }
  lines.push('', tr('（この要約は、顧客パックと議論テーマから自動で集計したものです。）'));
  return lines;
}

function sectionResearch(c: Ctx): string[] {
  const lines: string[] = [];
  const srcs = c.data.sources.sources;
  lines.push(...(srcs.length > 0 ? table(['ID', tr('種別', undefined, 'export'), tr('題名'), tr('取得日'), tr('確度'), tr('機密区分')], srcs.map((s) => [s.id, s.kind, s.title, s.retrievedAt, s.confidence, s.classification ?? ''])) : [`${tr('出典')}: ${tr(NOT_APPLICABLE, undefined, 'export')}`]));
  const metrics: unknown[][] = [];
  for (const e of [...c.data.entities.entities, ...c.data.products.products]) {
    for (const m of e.metrics ?? []) metrics.push([c.label(e.id), m.label, m.value, m.unit ?? '', sourceIdsText(m.sourceIds)]);
  }
  if (metrics.length > 0) lines.push('', `### ${tr('数値データ')}`, '', ...table([tr('対象'), tr('指標'), tr('値'), tr('単位'), tr('出典')], metrics));
  return lines;
}

function sectionMatrix(c: Ctx): string[] {
  const { issues, solutions } = c.data.issues;
  const ranked = [...issues].sort((a, b) => priorityRank(a.evaluation?.priority) - priorityRank(b.evaluation?.priority));
  const rows = ranked.map((i, n) => {
    const sols = solutions.filter((s) => s.issueId === i.id || (s.issueIds ?? []).includes(i.id)).map((s) => s.title);
    const ev = i.evaluation;
    return [n + 1, i.title, i.audience === 'external' ? tr('社外向け') : tr('社内向け'), evalText(ev?.priority), evalText(ev?.cost), evalText(ev?.roi), evalText(ev?.feasibility), evalText(ev?.risk), sols.join(tr('、'))];
  });
  return table([tr('順'), tr('課題'), tr('区分'), tr('優先度'), tr('コスト'), 'ROI', tr('実現性'), tr('リスク'), tr('解決策')], rows);
}

function sectionReferences(c: Ctx): string[] {
  return c.data.sources.sources.map((s, i) => {
    const url = s.url ? ` ${s.url}` : '';
    return `${i + 1}. [${s.id}] ${oneLine(s.title)}${url}（${tr('取得日')}: ${s.retrievedAt}／${tr('確度')}: ${s.confidence}）`;
  });
}

function themeBlock(t: Theme, level: number): string[] {
  const h = '#'.repeat(level);
  const h2 = '#'.repeat(level + 1);
  const origin = statusOrigin(t.status) === 'ai' ? tr('AI の提案') : tr('顧客の選択');
  const lines = [`${h} ${tr('テーマ')}: ${oneLine(t.title)}`, '', `- ${tr('決定ステータス')}: ${tr(STATUS_DISPLAY_LABEL[t.status])}（${origin}）`];
  if (t.aiProposal.trim() !== '') lines.push('', `${h2} ${tr('AI の提案')}`, '', quote(t.aiProposal));
  for (const f of RECORD_FIELDS) lines.push('', `${h2} ${tr(f.label)}`, '', quote(t[f.key]));
  lines.push('', `${h2} ${tr('次のアクション')}`, '');
  if (t.actions.length === 0) lines.push(tr('（なし）'));
  for (const a of t.actions) lines.push(`- ${oneLine(a.text) || tr('（内容なし）')}（${tr('担当')}: ${a.owner || tr('未定')}／${tr('期限', undefined, 'export')}: ${a.due || tr('未定')}）`);
  return lines;
}

function sectionThemes(c: Ctx): string[] {
  return c.themes.flatMap((t, i) => (i === 0 ? themeBlock(t, 3) : ['', ...themeBlock(t, 3)]));
}

function sectionDecisions(c: Ctx): string[] {
  if (c.themes.length === 0) return [];
  const lines = table([tr('テーマ'), tr('決定ステータス'), tr('決定事項'), tr('未決事項')], c.themes.map((t) => [t.title, tr(STATUS_DISPLAY_LABEL[t.status]), t.decisions, t.openIssues]));
  const actions = c.themes.flatMap((t) => t.actions.map((a) => [t.title, a.text, a.owner || tr('未定'), a.due || tr('未定')]));
  if (actions.length > 0) lines.push('', `### ${tr('次のアクション')}`, '', ...table([tr('テーマ'), tr('内容', undefined, 'export'), tr('担当'), tr('期限', undefined, 'export')], actions));
  return lines;
}

function sectionGraph(c: Ctx): string[] {
  const g = buildEntityGraph(c.data);
  return table(['from', tr('関係'), 'to'], g.edges.map((e) => [`${c.label(e.from)}（${e.from}）`, e.label ?? (e.kind === 'contain' ? tr('含む') : tr('参照')), `${c.label(e.to)}（${e.to}）`]));
}

const mermaidText = (s: string): string => oneLine(s).replace(/["\\]/g, "'").replace(/[[\]{}()<>]/g, ' ');

function sectionArchitecture(c: Ctx): string[] {
  const { nodes, edges } = c.data.architecture;
  if (nodes.length === 0) return [];
  const ids = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const lines = ['```mermaid', 'flowchart LR'];
  const layers = [...new Set(nodes.map((n) => n.layer ?? ''))];
  layers.forEach((layer, li) => {
    const members = nodes.filter((n) => (n.layer ?? '') === layer);
    if (layer) lines.push(`  subgraph L${li + 1}["${mermaidText(layer)}"]`);
    for (const n of members) lines.push(`    ${ids.get(n.id)}["${mermaidText(n.label)}"]`);
    if (layer) lines.push('  end');
  });
  for (const e of edges) {
    const a = ids.get(e.from), b = ids.get(e.to);
    if (a && b) lines.push(e.label ? `  ${a} -->|"${mermaidText(e.label)}"| ${b}` : `  ${a} --> ${b}`);
  }
  lines.push('```');
  const svg = architectureSvg(nodes.map((n) => ({ id: n.id, label: n.label, layer: n.layer })), edges.map((e) => ({ from: e.from, to: e.to, label: e.label })), tr('アーキテクチャ図'));
  if (svg && c.withImages) {
    c.assets.set('assets/architecture.svg', svg);
    lines.push('', `![${tr('アーキテクチャ図')}](assets/architecture.svg)`);
  }
  return lines;
}

function sectionProducts(c: Ctx): string[] {
  const { products } = c.data.products;
  const { solutions } = c.data.issues;
  return table([tr('製品', undefined, 'export'), tr('提供元'), tr('概要'), tr('適合する解決策と理由')], products.map((p) => {
    const fits = solutions.flatMap((s) => (s.productFits ?? []).filter((f) => f.productId === p.id).map((f) => `${s.title}: ${f.reason}`));
    return [p.name, p.vendor ?? '', p.summary ?? '', fits.join(' ／ ')];
  }));
}

const mermaidId = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

function sectionGantt(c: Ctx): string[] {
  const { tasks, features } = c.data.plan;
  if (tasks.length === 0) return [];
  const lines = table([tr('タスク'), tr('機能', undefined, 'export'), tr('担当'), tr('作業内容'), tr('開始'), tr('終了', undefined, 'export'), tr('先行')], tasks.map((t) => [
    t.title, t.featureId ? c.label(t.featureId) : '', t.owner ?? '', t.work ?? '', t.start ?? '', t.end ?? '', (t.dependsOn ?? []).map((d) => c.label(d)).join(tr('、')),
  ]));
  const dated = tasks.filter((t) => t.start && t.end);
  if (dated.length > 0) {
    lines.push('', '```mermaid', 'gantt', '  dateFormat YYYY-MM-DD');
    const featOf = new Map(features.map((f) => [f.id, f.title]));
    let section = '\u0000';
    for (const t of dated) {
      const s = t.featureId ? featOf.get(t.featureId) ?? '' : '';
      if (s !== section) { section = s; lines.push(`  section ${mermaidText(s || tr('（機能なし）'))}`); }
      lines.push(`  ${mermaidText(t.title).replace(/:/g, '：')} :${mermaidId(t.id)}, ${t.start}, ${t.end}`);
    }
    lines.push('```');
  }
  return lines;
}

function sectionKpi(c: Ctx): string[] {
  const rows: unknown[][] = [];
  for (const i of c.data.issues.issues) {
    const ev = i.evaluation;
    if (ev?.roi || ev?.cost) rows.push([i.title, evalText(ev?.roi), evalText(ev?.cost), sourceIdsText([...(ev?.roi?.sourceIds ?? []), ...(ev?.cost?.sourceIds ?? [])])]);
  }
  const lines = table([tr('課題'), 'ROI', tr('コスト'), tr('出典')], rows);
  const metrics: unknown[][] = [];
  for (const e of [...c.data.entities.entities, ...c.data.products.products]) for (const m of e.metrics ?? []) metrics.push([c.label(e.id), m.label, m.value, m.unit ?? '', sourceIdsText(m.sourceIds)]);
  if (metrics.length > 0) {
    if (lines.length > 0) lines.push('', `### ${tr('KPI（指標）')}`, '');
    lines.push(...table([tr('対象'), tr('指標'), tr('値'), tr('単位'), tr('出典')], metrics));
  }
  return lines;
}

function sectionWhiteboard(c: Ctx): string[] {
  const boards = c.boards.filter((b) => b.kind === 'board' && (b.strokes.length > 0 || b.items.length > 0));
  const lines: string[] = [];
  boards.forEach((b, n) => {
    if (n > 0) lines.push('');
    lines.push(`### ${oneLine(b.name)}`, '', `- ${tr('手書きの線 {n} 本、図形・付箋・文字 {m} 件', { n: b.strokes.length, m: b.items.length })}`);
    const texts = b.items.map((i) => oneLine(i.text)).filter((t) => t !== '' && t !== '—');
    for (const t of texts) lines.push(`  - ${t}`);
    const svg = boardSvg(b);
    if (svg && c.withImages) {
      const p = `assets/whiteboard-${n + 1}.svg`;
      c.assets.set(p, svg);
      lines.push('', `![${oneLine(b.name)}](${p})`);
    }
  });
  return lines;
}

function sectionAttribution(c: Ctx): string[] {
  const counts = new Map<string, Record<string, number>>();
  const walk = (name: string, v: unknown): void => {
    if (Array.isArray(v)) { v.forEach((x) => walk(name, x)); return; }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Rec;
    if (typeof o.createdBy === 'string') {
      const r = counts.get(name) ?? {};
      r[o.createdBy] = (r[o.createdBy] ?? 0) + 1;
      counts.set(name, r);
    }
    for (const [k, x] of Object.entries(o)) if (typeof x === 'object' && x !== null) walk(k, x);
  };
  for (const [file, v] of Object.entries(c.data)) for (const [k, x] of Object.entries(rec(v))) walk(`${file}.${k}`, x);
  const lines: string[] = [];
  const rows = [...counts.entries()].map(([k, r]) => [k, r.ai ?? 0, r.human ?? 0, r.sample ?? 0]);
  lines.push(tr('値の作成者（`createdBy`）の件数です。AI が作った値と、人が作った・編集した値を区別します。'), '');
  lines.push(...table([tr('データ'), 'AI', tr('人', undefined, 'export'), tr('サンプル')], rows));
  const ai = c.themes.filter((t) => statusOrigin(t.status) === 'ai').length;
  lines.push('', `- ${tr('議論テーマ: AI の提案 {a} 件、顧客の選択 {b} 件', { a: ai, b: c.themes.length - ai })}`);
  return lines;
}

function sectionChanges(c: Ctx): string[] {
  return table([tr('日時'), tr('変更', undefined, 'export'), tr('対象'), tr('内容', undefined, 'export'), tr('変更した者')], c.changes.map((e) => [
    e.at, e.kind === 'added' ? tr('追加', undefined, 'export') : e.kind === 'removed' ? tr('削除', undefined, 'export') : tr('変更', undefined, 'export'), e.target, e.detail, e.by === 'ai' ? 'AI' : tr('人', undefined, 'export'),
  ]));
}

const BUILDERS: Record<SectionId, (c: Ctx) => string[]> = {
  overview: sectionOverview, summary: sectionSummary, research: sectionResearch, matrix: sectionMatrix, references: sectionReferences,
  themes: sectionThemes, decisions: sectionDecisions, graph: sectionGraph, architecture: sectionArchitecture, products: sectionProducts,
  gantt: sectionGantt, kpi: sectionKpi, whiteboard: sectionWhiteboard, attribution: sectionAttribution, changes: sectionChanges,
};

function renderSections(c: Ctx, ids: readonly SectionId[]): string {
  const out: string[] = [];
  for (const id of ids) {
    const s = SECTIONS.find((x) => x.id === id)!;
    const body = BUILDERS[id](c);
    out.push(`## ${tr(s.title)}`, '', ...(body.length > 0 ? body : [tr(NOT_APPLICABLE, undefined, 'export')]), '');
  }
  return out.join('\n');
}

/** 決定事項のみの範囲: テーマごとの決定事項だけを書く。 */
function decisionsOnly(themes: readonly Theme[]): string {
  const withDecisions = themes.filter((t) => t.decisions.trim() !== '');
  if (withDecisions.length === 0) return tr(NOT_APPLICABLE, undefined, 'export');
  return withDecisions.flatMap((t) => [`## ${tr('テーマ')}: ${oneLine(t.title)}`, '', `- ${tr('決定ステータス')}: ${tr(STATUS_DISPLAY_LABEL[t.status])}`, ...bullets(t.decisions), '']).join('\n');
}

// ---------- 全体 ----------

const yamlString = (s: string): string => JSON.stringify(s);

/** 画面別の範囲に出す節（画面の key から）。 */
export function sectionsForScreen(screenKey: string | undefined): readonly SectionId[] {
  return (screenKey && SCREEN_SECTIONS[screenKey]) || ['overview'];
}

export function buildExport(input: ExportInput, options: ExportOptions): ExportResult {
  const now = input.now ?? new Date();
  const internalIssueIds = new Set(input.data.issues.issues.filter((i) => rec(i).classification === 'internal').map((i) => i.id));
  const internalCount = countInternal(input.data);
  const internalIds = collectInternalIds(input.data);
  const anonymize = options.anonymize;
  const data = anonymize ? anonymizeInternal(input.data) : input.data;
  const masked = anonymize ? maskThemes(input.themes, internalIssueIds) : { themes: [...input.themes], maskedIds: new Set<string>() };
  const changes = (input.changes ?? []).map((e) => (masked.maskedIds.has(e.targetId) || internalIds.has(e.targetId) ? { ...e, target: ANONYMIZED_LABEL, detail: ANONYMIZED_LABEL } : e));
  const snapshotData = anonymize && input.snapshotData ? anonymizeInternal(input.snapshotData) : input.snapshotData;

  const scopeThemes = options.scope === 'theme' ? masked.themes.filter((t) => t.id === options.themeId) : masked.themes;
  const graph = buildEntityGraph(data);
  const assets = new Map<string, string>();
  const ctx: Ctx = {
    data, themes: scopeThemes, boards: input.boards ?? [], changes, customerName: input.customerName, projectName: input.projectName, now,
    withImages: options.format === 'zip', assets, label: (id) => graph.node(id)?.label ?? id,
  };

  const who = `${input.customerName} ${input.projectName}`;
  let title: string;
  let body: string;
  if (options.scope === 'decisions') {
    title = `${tr('決定事項')}（${who}）`;
    body = decisionsOnly(scopeThemes);
  } else if (options.scope === 'theme') {
    const t = scopeThemes[0];
    title = `${who} ${tr('議論メモ')}（${tr('テーマ別')}）`;
    body = t ? [`## ${tr('テーマ別の議論')}`, '', ...themeBlock(t, 3), '', ...renderSections({ ...ctx, themes: [t] }, ['decisions'])].join('\n') : tr(NOT_APPLICABLE);
  } else if (options.scope === 'screen') {
    title = `${who} ${tr('議論メモ')}（${tr('画面別')}）`;
    body = renderSections(ctx, sectionsForScreen(options.screenKey));
  } else {
    title = `${who} ${tr('議論メモ')}`;
    body = renderSections(ctx, SECTIONS.map((s) => s.id));
  }

  const notice = anonymize && internalCount > 0
    ? `> ${tr('機密区分 `internal` の項目 {n} 件の値を「{label}」に置き換えています。', { n: internalCount, label: ANONYMIZED_LABEL })}\n\n`
    : '';
  const bodyWithNotice = `${notice}${body}`;

  const followUps = options.followUp ? buildFollowUps({ customerName: input.customerName, projectName: input.projectName, themes: masked.themes, now }) : [];
  const followMd = followUps.map((f) => f.content).join('\n---\n\n');

  // 完成した Markdown
  let doc: string;
  if (options.scope === 'all') {
    doc = buildDiscussionMemo({
      customerName: input.customerName, projectName: input.projectName, themes: masked.themes, data: snapshotData, now,
      body: bodyWithNotice,
    });
  } else {
    doc = [
      '---', 'format: edb-export', `scope: ${options.scope}`, `customer: ${yamlString(input.customerName)}`, `project: ${yamlString(input.projectName)}`,
      `exported_at: ${yamlString(now.toISOString())}`, '---', '', `# ${title}`, '', bodyWithNotice, '',
    ].join('\n');
  }

  const base = options.scope === 'all'
    ? defaultMemoFileName(input.customerName, input.projectName, now).replace(/\.md$/, '')
    : `${yyyymmdd(now)}-${sanitizeFilePart(input.customerName)}-${sanitizeFilePart(input.projectName)}-export-${options.scope}`;

  const files: ExportFile[] = [{ path: `${base}.md`, content: doc }];
  for (const [p, c] of assets) files.push({ path: p, content: c });
  for (const f of followUps) files.push({ path: `followup/${f.fileName}`, content: f.content });

  const markdown = followMd ? `${doc.trimEnd()}\n\n---\n\n${followMd}` : doc;
  const preview = [`# ${title}`, '', bodyWithNotice, ...(followMd ? ['', '---', '', followMd] : [])].join('\n');

  return {
    fileName: options.format === 'zip' ? `${base}.zip` : `${base}.md`,
    markdown, files, preview, internalCount, anonymized: anonymize,
  };
}
