// 選択状態の純粋なロジック（FR-024〜FR-028）。DOM・React・ストアを参照しない。
// 関連する節の集合（AND/OR）、ハイライトの状態、URL ハッシュとの相互変換。
import type { EntityGraph } from './graph';

export type CombineMode = 'AND' | 'OR';
/** 選択と関連しない項目の扱い（FR-026）: 非表示にする／減光して残す */
export type UnrelatedMode = 'hide' | 'dim';

/** data-highlight の語（tests/system/CONTRACT.md §4）。空白区切りで複数が付くことがある */
export type HighlightState = 'selected' | 'hover' | 'related' | 'dimmed';

export const DEFAULT_COMBINE: CombineMode = 'OR';
export const DEFAULT_UNRELATED: UnrelatedMode = 'hide';

/**
 * 選択に関連する節の集合。それぞれの選択項目の「自分＋直接つながる節」を、AND は積集合、OR は和集合で合わせる。
 * 選択がないときは null（絞り込まない）。グラフにない ID は無視する。
 */
export function relatedSet(graph: EntityGraph, ids: readonly string[], mode: CombineMode): ReadonlySet<string> | null {
  const known = ids.filter((id) => graph.has(id));
  if (known.length === 0) return null;
  const sets = known.map((id) => graph.related(id));
  const out = new Set<string>();
  if (mode === 'OR') {
    for (const s of sets) for (const id of s) out.add(id);
  } else {
    for (const id of sets[0]!) if (sets.every((s) => s.has(id))) out.add(id);
  }
  return out;
}

export interface HighlightContext {
  selected: ReadonlySet<string>;
  /** relatedSet の結果。選択がなければ null */
  related: ReadonlySet<string> | null;
  hoverId: string | null;
  unrelated: UnrelatedMode;
}

/**
 * ある項目の data-highlight の値（語の空白区切り）。何もなければ undefined。
 * `filterable` は表・リスト・カードのように絞り込む部品のとき true にする（減光の指定があれば関連しない項目に dimmed が付く）。
 */
export function highlightTokens(id: string, ctx: HighlightContext, filterable = false): string | undefined {
  const out: HighlightState[] = [];
  const isSelected = ctx.selected.has(id);
  if (isSelected) out.push('selected');
  else if (ctx.related?.has(id)) out.push('related');
  if (ctx.hoverId === id) out.push('hover');
  if (filterable && ctx.unrelated === 'dim' && ctx.related && !ctx.related.has(id)) out.push('dimmed');
  return out.length ? out.join(' ') : undefined;
}

/** 表・リスト・カードの 1 件が、絞り込みで見えるか（非表示モードで関連しないときだけ false） */
export function isVisibleInFilter(id: string, related: ReadonlySet<string> | null, unrelated: UnrelatedMode): boolean {
  return related === null || unrelated === 'dim' || related.has(id);
}

// ---- URL ハッシュ（FR-028）。`#sel=<ID>,<ID>&mode=or&dim=1` の形。ほかのハッシュの項目は保つ ----

export interface UrlSelection {
  ids: string[];
  mode: CombineMode;
  unrelated: UnrelatedMode;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** URL に入れる選択の最大数（長すぎる URL を作らない） */
export const MAX_URL_IDS = 50;

/** ハッシュ（`#…` または `…`）から選択状態を読む。壊れた値は黙って捨てる（例外を投げない）。 */
export function parseSelectionHash(hash: string): UrlSelection {
  const params = splitHash(hash);
  const raw = params.find(([k]) => k === 'sel')?.[1] ?? '';
  const ids: string[] = [];
  for (const part of raw.split(',')) {
    let id = part;
    try { id = decodeURIComponent(part); } catch { continue; }
    if (ID_PATTERN.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_URL_IDS) break;
  }
  const modeText = params.find(([k]) => k === 'mode')?.[1]?.toLowerCase();
  const mode: CombineMode = modeText === 'and' ? 'AND' : modeText === 'or' ? 'OR' : DEFAULT_COMBINE;
  const unrelated: UnrelatedMode = params.find(([k]) => k === 'dim')?.[1] === '1' ? 'dim' : DEFAULT_UNRELATED;
  return { ids, mode, unrelated };
}

/**
 * 選択状態を反映したハッシュ（`#…`。空なら空文字）。`current` にあるほかの項目は、順序を保って残す。
 * 既定値（OR・非表示）の項目は書かない。
 */
export function formatSelectionHash(state: UrlSelection, current = ''): string {
  const others = splitHash(current).filter(([k]) => k !== 'sel' && k !== 'mode' && k !== 'dim');
  const parts = others.map(([k, v]) => (v === '' ? k : `${k}=${v}`));
  if (state.ids.length > 0) parts.push(`sel=${state.ids.slice(0, MAX_URL_IDS).map(encodeURIComponent).join(',')}`);
  if (state.mode !== DEFAULT_COMBINE) parts.push(`mode=${state.mode.toLowerCase()}`);
  if (state.unrelated !== DEFAULT_UNRELATED) parts.push('dim=1');
  return parts.length ? `#${parts.join('&')}` : '';
}

function splitHash(hash: string): Array<[string, string]> {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!body) return [];
  return body.split('&').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
}
