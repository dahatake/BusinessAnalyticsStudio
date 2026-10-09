// 議論ツリー（系統ツリー。FR-042）のモデル。画面・ストアを参照しない純粋なモジュール。
// ルート=議題、枝=論点・課題・原因・解決策・決定事項・次のアクション。生成（モックの AI）、編集、出力（Mermaid・SVG・JSON）を受け持つ。
import { newId, type Theme } from '../discussion/model';
import type { PackData } from '../schema';
import { solutionsOfIssue } from './model';

export const TREE_KINDS = ['議題', '論点', '課題', '原因', '解決策', '決定事項', '次のアクション'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

/** 階層ごとの色（#rrggbb。出力にも使う）。色だけに頼らず、記号（アイコン代わりの先頭文字）も付ける */
export const KIND_COLOR: Record<TreeKind, string> = {
  議題: '#0f6cbd', 論点: '#8764b8', 課題: '#c50f1f', 原因: '#da3b01', 解決策: '#107c10', 決定事項: '#038387', 次のアクション: '#986f0b',
};
export const KIND_MARK: Record<TreeKind, string> = {
  議題: '◆', 論点: '？', 課題: '▲', 原因: '↳', 解決策: '★', 決定事項: '✔', 次のアクション: '➜',
};

export type TreeOrigin = 'ai' | 'human' | 'pack';

/** ノードの根拠（議論の該当箇所／出典）。リンクとして表示する */
export interface Rationale {
  label: string;
  kind: 'source' | 'theme';
  refId: string;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  kind: TreeKind;
  title: string;
  origin: TreeOrigin;
  /** 他のビューと連動する項目（課題・解決策などの ID）。選択の共通ストアで使う */
  entityId?: string;
  rationale?: Rationale;
}

export interface TreeDoc {
  themeId: string;
  themeTitle: string;
  nodes: TreeNode[];
  /** 生成した AI の接続（モックか実接続か） */
  mode: 'mock' | 'connected';
}

export type ThemeLike = Pick<Theme, 'id' | 'title' | 'issueId' | 'options' | 'decisions' | 'actions' | 'recommendation' | 'openIssues' | 'rationale'>;

/** 「／」「;」改行などで区切った項目に分ける */
export function splitItems(text: string): string[] {
  return text.split(/[／;；\n\r]+/).map((s) => s.trim()).filter((s) => s !== '');
}

const node = (n: Omit<TreeNode, 'id'>): TreeNode => ({ id: newId('tn'), ...n });

/**
 * 議論テーマからツリーを生成する前の、全体像（読み取り専用）。顧客パックの章・議題と、議題が参照する課題・解決策から作る。
 * 生成・編集すると、議論の記録から作ったツリー（AI 生成・人が編集）に置き換わる。
 */
export function buildPackTree(data: PackData): TreeNode[] {
  const out: TreeNode[] = [];
  const root = node({ parentId: null, kind: '議題', title: data.customer.projectName, origin: 'pack' });
  out.push(root);
  const issues = new Map(data.issues.issues.map((i) => [i.id, i]));
  const solutions = new Map(data.issues.solutions.map((s) => [s.id, s]));
  for (const ch of data.show.chapters) {
    const c = node({ parentId: root.id, kind: '論点', title: ch.title, origin: 'pack' });
    out.push(c);
    for (const t of ch.topics) {
      const topic = node({ parentId: c.id, kind: '論点', title: t.title, origin: 'pack' });
      out.push(topic);
      for (const id of t.entityIds ?? []) {
        const issue = issues.get(id);
        const sol = solutions.get(id);
        if (issue) out.push(node({ parentId: topic.id, kind: '課題', title: issue.title, origin: 'pack', entityId: id }));
        else if (sol) out.push(node({ parentId: topic.id, kind: '解決策', title: sol.title, origin: 'pack', entityId: id }));
      }
    }
  }
  return out;
}

/** 議論の記録から、モックの AI が返すツリー。同じ入力なら同じ構造になる（ID は毎回新しい）。 */
export function buildMockTree(theme: ThemeLike, data: PackData): TreeNode[] {
  const out: TreeNode[] = [];
  const themeRef = (field: string): Rationale => ({ label: `議論の記録（${field}）`, kind: 'theme', refId: theme.id });
  const issue = theme.issueId ? data.issues.issues.find((i) => i.id === theme.issueId) : undefined;
  const root = node({ parentId: null, kind: '議題', title: theme.title, origin: 'ai', ...(issue ? { entityId: issue.id } : {}), rationale: themeRef('議題') });
  out.push(root);

  const options = splitItems(theme.options);
  for (const o of options.length ? options : [`${theme.title} をどう進めるか`]) {
    out.push(node({ parentId: root.id, kind: '論点', title: o, origin: 'ai', rationale: themeRef('選択肢') }));
  }

  const srcOf = (ids: readonly string[] | undefined): Rationale | undefined => {
    const id = ids?.find((s) => data.sources.sources.some((x) => x.id === s));
    const src = id ? data.sources.sources.find((x) => x.id === id) : undefined;
    return src ? { label: `出典: ${src.title}`, kind: 'source', refId: src.id } : undefined;
  };

  const problem = node({
    parentId: root.id, kind: '課題', title: issue ? issue.title : `${theme.title} の課題`, origin: 'ai',
    ...(issue ? { entityId: issue.id } : {}), rationale: srcOf(issue?.sourceIds) ?? themeRef('根拠'),
  });
  out.push(problem);
  for (const c of issue?.causes ?? []) {
    out.push(node({ parentId: problem.id, kind: '原因', title: c.title, origin: 'ai', rationale: srcOf(issue?.sourceIds) ?? themeRef('根拠') }));
  }

  const sols = issue ? solutionsOfIssue(issue.id, data.issues.solutions) : [];
  if (sols.length > 0) {
    for (const s of sols) out.push(node({ parentId: root.id, kind: '解決策', title: s.title, origin: 'ai', entityId: s.id, rationale: srcOf(s.sourceIds) ?? themeRef('戦略的提言') }));
  } else {
    const rec = splitItems(theme.recommendation);
    for (const r of rec.length ? rec : ['解決策の候補を洗い出す']) out.push(node({ parentId: root.id, kind: '解決策', title: r, origin: 'ai', rationale: themeRef('戦略的提言') }));
  }

  const decisions = splitItems(theme.decisions);
  for (const d of decisions.length ? decisions : ['決定事項を確定する（未決）']) {
    out.push(node({ parentId: root.id, kind: '決定事項', title: d, origin: 'ai', rationale: themeRef('決定事項') }));
  }

  const actions = theme.actions.map((a) => a.text.trim()).filter((t) => t !== '');
  for (const a of actions.length ? actions : ['担当と期限を決める']) {
    out.push(node({ parentId: root.id, kind: '次のアクション', title: a, origin: 'ai', rationale: themeRef('次のアクション') }));
  }
  return out;
}

/** AI の回答（JSON のツリー）を読む。形が違えば null。実接続の回答用で、読めなければ呼び出し側がモックに戻す。 */
export function parseAiTree(answer: string, theme: ThemeLike): TreeNode[] | null {
  const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(answer);
  if (!m) return null;
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return null; }
  const list = Array.isArray(raw) ? raw : (raw as { nodes?: unknown })?.nodes;
  if (!Array.isArray(list) || list.length === 0) return null;
  const root = node({ parentId: null, kind: '議題', title: theme.title, origin: 'ai', rationale: { label: '議論の記録（議題）', kind: 'theme', refId: theme.id } });
  const out: TreeNode[] = [root];
  for (const x of list) {
    const r = x as { kind?: string; title?: string; parent?: string };
    if (!r || typeof r.title !== 'string' || !TREE_KINDS.includes(r.kind as TreeKind) || r.kind === '議題') return null;
    out.push(node({ parentId: root.id, kind: r.kind as TreeKind, title: r.title, origin: 'ai', rationale: { label: '議論の記録（根拠）', kind: 'theme', refId: theme.id } }));
  }
  return out;
}

// ---- 構造 ----

export interface TreeRow { node: TreeNode; level: number; hasChildren: boolean; expanded: boolean }

export function childrenOf(nodes: readonly TreeNode[], id: string | null): TreeNode[] {
  return nodes.filter((n) => n.parentId === id);
}

/** 深さ優先の並び。折りたたまれた枝の子孫は含めない。 */
export function flattenTree(nodes: readonly TreeNode[], collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parent: string | null, level: number): void => {
    for (const n of childrenOf(nodes, parent)) {
      const kids = childrenOf(nodes, n.id);
      const expanded = !collapsed.has(n.id);
      rows.push({ node: n, level, hasChildren: kids.length > 0, expanded });
      if (kids.length > 0 && expanded) walk(n.id, level + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function descendantIds(nodes: readonly TreeNode[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (p: string): void => { for (const c of childrenOf(nodes, p)) { out.add(c.id); walk(c.id); } };
  walk(id);
  return out;
}

const DEFAULT_CHILD: Record<TreeKind, TreeKind> = {
  議題: '論点', 論点: '課題', 課題: '原因', 原因: '解決策', 解決策: '決定事項', 決定事項: '次のアクション', 次のアクション: '次のアクション',
};
export const defaultChildKind = (k: TreeKind): TreeKind => DEFAULT_CHILD[k];

export type TreeEdit = { ok: true; nodes: TreeNode[]; id?: string } | { ok: false; reason: string };

/** ノードを追加する（人が追加したので「人が編集」）。 */
export function addChild(nodes: readonly TreeNode[], parentId: string, title: string, kind?: TreeKind): TreeEdit {
  const t = title.trim();
  if (t === '') return { ok: false, reason: 'ノードの名前を入力してください。' };
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { ok: false, reason: '追加先のノードを選んでください。' };
  const added = node({ parentId, kind: kind ?? defaultChildKind(parent.kind), title: t, origin: 'human' });
  // 親の子の末尾（子孫の後）に挿入する
  const sub = descendantIds(nodes, parentId);
  let at = nodes.findIndex((n) => n.id === parentId);
  nodes.forEach((n, i) => { if (sub.has(n.id)) at = Math.max(at, i); });
  return { ok: true, nodes: [...nodes.slice(0, at + 1), added, ...nodes.slice(at + 1)], id: added.id };
}

export function renameNode(nodes: readonly TreeNode[], id: string, title: string): TreeEdit {
  const t = title.trim();
  if (t === '') return { ok: false, reason: 'ノードの名前を入力してください。' };
  if (!nodes.some((n) => n.id === id)) return { ok: false, reason: 'ノードが見つかりません。' };
  return { ok: true, nodes: nodes.map((n) => (n.id === id ? { ...n, title: t, origin: 'human' as const } : n)) };
}

/** ノードを子孫ごと削除する。ルートは削除できない。 */
export function removeTreeNode(nodes: readonly TreeNode[], id: string): TreeEdit {
  const n = nodes.find((x) => x.id === id);
  if (!n) return { ok: false, reason: 'ノードが見つかりません。' };
  if (n.parentId === null) return { ok: false, reason: 'ルート（議題）は削除できません。' };
  const gone = descendantIds(nodes, id);
  gone.add(id);
  return { ok: true, nodes: nodes.filter((x) => !gone.has(x.id)) };
}

/** 移動できる先（自分と子孫、いまの親を除く）。 */
export function moveTargets(nodes: readonly TreeNode[], id: string): TreeNode[] {
  const n = nodes.find((x) => x.id === id);
  if (!n || n.parentId === null) return [];
  const gone = descendantIds(nodes, id);
  return nodes.filter((x) => x.id !== id && !gone.has(x.id) && x.id !== n.parentId);
}

/** ノードを別の親へ移動する（人が編集したので「人が編集」）。自分や子孫の下へは移動できない。 */
export function moveNode(nodes: readonly TreeNode[], id: string, newParentId: string): TreeEdit {
  const n = nodes.find((x) => x.id === id);
  if (!n) return { ok: false, reason: 'ノードが見つかりません。' };
  if (n.parentId === null) return { ok: false, reason: 'ルート（議題）は移動できません。' };
  if (id === newParentId || descendantIds(nodes, id).has(newParentId)) return { ok: false, reason: '自分自身や子孫の下には移動できません。' };
  if (!nodes.some((x) => x.id === newParentId)) return { ok: false, reason: '移動先のノードが見つかりません。' };
  const moving = new Set([id, ...descendantIds(nodes, id)]);
  const block = nodes.filter((x) => moving.has(x.id)).map((x) => (x.id === id ? { ...x, parentId: newParentId, origin: 'human' as const } : x));
  const rest = nodes.filter((x) => !moving.has(x.id));
  const sub = descendantIds(rest, newParentId);
  let at = rest.findIndex((x) => x.id === newParentId);
  rest.forEach((x, i) => { if (sub.has(x.id)) at = Math.max(at, i); });
  return { ok: true, nodes: [...rest.slice(0, at + 1), ...block, ...rest.slice(at + 1)] };
}

/** ノードの分解をやり直す。子孫を捨て、名前を「、」「・」などで区切った項目から子を作り直す（なければ検討の 1 件）。 */
export function redecompose(nodes: readonly TreeNode[], id: string): TreeEdit {
  const n = nodes.find((x) => x.id === id);
  if (!n) return { ok: false, reason: 'ノードが見つかりません。' };
  const gone = descendantIds(nodes, id);
  const kept = nodes.filter((x) => !gone.has(x.id));
  const parts = n.title.split(/[、,，・／/]+/).map((s) => s.trim()).filter((s) => s !== '');
  const kind = defaultChildKind(n.kind);
  const kids = (parts.length > 1 ? parts : [`${n.title} の詳細を検討する`]).map((t) =>
    node({ parentId: id, kind, title: t, origin: 'ai', rationale: n.rationale }),
  );
  const at = kept.findIndex((x) => x.id === id);
  return { ok: true, nodes: [...kept.slice(0, at + 1), ...kids, ...kept.slice(at + 1)] };
}

// ---- 出力 ----

const q = (s: string): string => s.replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');

export function treeToMermaid(doc: TreeDoc): string {
  const lines = [`%% ${q(doc.themeTitle)}`, 'flowchart TD'];
  const ids = new Map(doc.nodes.map((n, i) => [n.id, `t${i + 1}`]));
  for (const n of doc.nodes) lines.push(`  ${ids.get(n.id)}["${q(n.kind)}: ${q(n.title)}${n.origin === 'human' ? '（人が編集）' : ''}"]`);
  for (const n of doc.nodes) if (n.parentId && ids.has(n.parentId)) lines.push(`  ${ids.get(n.parentId)} --> ${ids.get(n.id)}`);
  return `${lines.join('\n')}\n`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function treeToSvg(doc: TreeDoc): { svg: string; width: number; height: number } {
  const rows = flattenTree(doc.nodes, new Set());
  const ROW = 36;
  const PAD = 20;
  const W = 560;
  const width = PAD * 2 + W + rows.reduce((m, r) => Math.max(m, r.level * 28), 0);
  const height = PAD * 2 + 30 + rows.length * ROW;
  const body = rows.map((r, i) => {
    const x = PAD + r.level * 28;
    const y = PAD + 30 + i * ROW;
    const color = KIND_COLOR[r.node.kind];
    const origin = r.node.origin === 'human' ? '（人が編集）' : r.node.origin === 'ai' ? '（AI 生成）' : '';
    const label = `${KIND_MARK[r.node.kind]} ${r.node.kind}: ${r.node.title}${origin}`;
    return `<g><rect x="${x}" y="${y}" width="${W}" height="${ROW - 8}" rx="6" fill="#ffffff" stroke="${color}" stroke-width="2"/>` +
      `<rect x="${x}" y="${y}" width="6" height="${ROW - 8}" rx="3" fill="${color}"/>` +
      `<text x="${x + 16}" y="${y + 19}" font-size="13" fill="#242424">${esc(label)}</text></g>`;
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Segoe UI Variable','Segoe UI','Noto Sans JP',sans-serif">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<text x="${PAD}" y="${PAD + 12}" font-size="16" font-weight="700" fill="#242424">${esc(doc.themeTitle)}（議論ツリー）</text>${body}</svg>`;
  return { svg, width, height };
}

export function treeToJson(doc: TreeDoc): string {
  return JSON.stringify(doc, null, 2);
}
