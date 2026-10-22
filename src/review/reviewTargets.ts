// 「Copilot で分析実行」（FR-278）の対象のコンポーネントとそのデータを集める。範囲は [ASSUMPTION] A-70 の運用:
// (1) いま画面にあるコンポーネント（component-<key> で、データの欄 component-data を持つもの）は、その欄に表示されている文字。
// (2) 画面にまだ出ていないコンポーネント（ワークスペースの配置に入っていない画面）は、画面の宣言（registry の view.kinds）に当たる顧客パックの項目の表示名。
//     どちらでもデータを持たないコンポーネントは、データなしの対象として返す（実行の完了後に「案なし」と示される）。
import { KIND_LABELS, type EntityGraph } from '../selection/graph';
import type { ReviewTarget } from './reviewFlow';

/** 対象にしないコンポーネント。設定（キー欄を持つ）・チャット（会話の履歴は別の送信経路 FR-286 で扱う） */
export const EXCLUDED_KEYS: ReadonlySet<string> = new Set(['settings', 'chat']);

export interface ScreenLike { key: string; label: string; view?: { kinds?: readonly string[] } }

/** 画面にあるコンポーネントの key・見出し・表示中の文字 */
export function collectDomTargets(root: ParentNode = document): ReviewTarget[] {
  const out: ReviewTarget[] = [];
  root.querySelectorAll<HTMLElement>('section[data-testid^="component-"]').forEach((el) => {
    const id = (el.getAttribute('data-testid') ?? '').slice('component-'.length);
    if (!id || EXCLUDED_KEYS.has(id) || out.some((t) => t.id === id)) return;
    const data = el.querySelector<HTMLElement>('[data-testid="component-data"]');
    if (!data) return;
    out.push({ id, label: el.getAttribute('aria-label') ?? id, data: (data.textContent ?? '').replace(/\s+/g, ' ').trim() });
  });
  return out;
}

/** 画面の宣言の kinds に当たる顧客パックの項目を、「種類: 表示名」の並びの文字にする。当たる項目がなければ空 */
export function graphDataOf(screen: ScreenLike, graph: EntityGraph | null): string {
  const kinds = screen.view?.kinds;
  if (!graph || !kinds || kinds.length === 0) return '';
  return graph.nodes.filter((n) => kinds.includes(n.kind)).map((n) => `${KIND_LABELS[n.kind]}: ${n.label}`).join(' / ');
}

/** 画面にあるコンポーネントに、まだ出ていない画面のコンポーネントを加えた、対象の全体 */
export function collectTargetsFor(screens: readonly ScreenLike[], graph: EntityGraph | null, root: ParentNode = document): ReviewTarget[] {
  const dom = collectDomTargets(root);
  const have = new Set(dom.map((t) => t.id));
  const extra = screens
    .filter((s) => !have.has(s.key) && !EXCLUDED_KEYS.has(s.key))
    .map((s): ReviewTarget => ({ id: s.key, label: s.label, data: graphDataOf(s, graph) }));
  return [...dom, ...extra];
}
