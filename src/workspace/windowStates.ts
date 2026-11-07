// 開いているコンポーネントの一覧（FR-295）の状態の求め方。React に依存しない純粋な計算。
// 一覧の状態: front（前面）／visible（表示中）／minimized（最小化）／closed（閉じた＝非表示にした）／behind（背面＝非表示扱い。FR-305 の雛形・FR-152 の最大化で背面へ回ったもの。AC-797・872）。
// FR-296: 既定のレイアウトに収まらない・領域が足りなくなって外したコンポーネントは、閉じずに最小化として一覧に残す。
import { keysOf, type Layout } from './layoutModel';

export type WindowState = 'front' | 'visible' | 'minimized' | 'closed' | 'behind';
export const WINDOW_STATE_LABEL: Readonly<Record<WindowState, string>> = { front: '前面', visible: '表示中', minimized: '最小化', closed: '閉じた', behind: '背面' };

/** 没入表示（FR-297）で、最大化したコンポーネントの背面を暗くする割合（%）。PARAM-137 */
export const IMMERSIVE_DIM_PERCENT = 60;

export interface WindowStateInput {
  /** 一覧に載せるコンポーネントのキー（登録済みのもの）。並びはそのまま */
  keys: readonly string[];
  /** 表示するレイアウト */
  layout: Layout;
  /** 見出しだけに畳んだもの */
  minimized: ReadonlySet<string>;
  /** 利用者が閉じた（非表示にした）もの */
  closed: ReadonlySet<string>;
  /** 雛形で配置して背面へ回ったもの（非表示扱い。一覧からの呼び出しまで背面のまま。FR-305 AC-865・FR-295 AC-872） */
  behind?: ReadonlySet<string>;
  /** 最後に使った順の目印（大きいほど最近） */
  usedAt: Readonly<Record<string, number>>;
}

/** コンポーネントごとの状態。前面は、表示中のうち最も最近使ったもの 1 つだけ（使った記録がなければ、並びの先頭の表示中） */
export function windowStates(input: WindowStateInput): Record<string, WindowState> {
  const inTree = new Set(keysOf(input.layout));
  const out: Record<string, WindowState> = {};
  const shown: string[] = [];
  for (const k of input.keys) {
    if (inTree.has(k)) {
      if (input.minimized.has(k)) out[k] = 'minimized';
      else if (input.behind?.has(k)) out[k] = 'behind';
      else { out[k] = 'visible'; shown.push(k); }
    } else {
      out[k] = input.closed.has(k) ? 'closed' : 'minimized';
    }
  }
  let front: string | undefined;
  for (const k of shown) if (front === undefined || (input.usedAt[k] ?? 0) > (input.usedAt[front] ?? 0)) front = k;
  if (front !== undefined) out[front] = 'front';
  return out;
}

/** 切替（Ctrl+Alt+PageDown／PageUp。FR-295 AC-798）の候補。閉じたものを除き、前面に近い順（前面が先頭） */
export function switchOrder(states: Readonly<Record<string, WindowState>>, usedAt: Readonly<Record<string, number>>): string[] {
  const keys = Object.keys(states).filter((k) => states[k] !== 'closed' && states[k] !== 'behind'); // 背面は巡回に含めない（AC-872）
  const rank = (k: string) => (states[k] === 'front' ? Infinity : usedAt[k] ?? 0);
  return keys.map((k, i) => ({ k, i })).sort((a, b) => (rank(b.k) - rank(a.k)) || a.i - b.i).map((x) => x.k);
}

/** 切替の次の位置（PageDown＝奥へ進む、PageUp＝手前へ戻る。端で循環する） */
export function nextSwitchIndex(index: number, count: number, dir: 'down' | 'up'): number {
  if (count <= 0) return 0;
  return (index + (dir === 'down' ? 1 : -1) + count) % count;
}

/** 切替のキー（Ctrl+Alt+PageDown／PageUp。macOS は ⌃⌥）。ほかのキー（Ctrl+Alt+方向・Enter）とは重ならない */
export function switchKey(e: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): 'down' | 'up' | null {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return null;
  return e.key === 'PageDown' ? 'down' : e.key === 'PageUp' ? 'up' : null;
}

// ---- 左メニューのタスクバー化（FR-295 AC-824・AC-825。契約: CONTRACT.md §34）----
/** コンポーネント（Window）が属する画面（左メニューの項目）の key。宣言がなければ自分自身 */
export function screenKeyOf(sc: { key: string; screenKey?: string }): string {
  return sc.screenKey ?? sc.key;
}

export interface NavSummary {
  /** 閉じていない Window の数（表示中・最小化中。閉じたものは数えない） */
  count: number;
  /** 前面の Window がある（長い青いバー）か。false は前面でない Window だけ（短い青いバー） */
  hasFront: boolean;
}

/** 画面ごとの Window の件数と前面の有無。Window がない（すべて閉じた・未表示の）画面は含めない */
export function navSummary(states: Readonly<Record<string, WindowState>>, screenOf: Readonly<Record<string, string>>): Record<string, NavSummary> {
  const out: Record<string, NavSummary> = {};
  for (const [k, st] of Object.entries(states)) {
    if (st === 'closed' || st === 'behind') continue; // 背面は閉じたものと同じ非表示扱いで数えない（AC-797・824）
    const sc = screenOf[k] ?? k;
    const cur = out[sc] ?? { count: 0, hasFront: false };
    out[sc] = { count: cur.count + 1, hasFront: cur.hasFront || st === 'front' };
  }
  return out;
}

/**
 * 左メニューの項目を押したときの対象と、その時点の状態。
 * 前面の Window があればそれ（→最小化）、なければ最後に前面にした開いている Window（最小化中→復元、表示中→前面へ）、
 * 開いているものがなければ閉じた Window（最後に使ったもの。なければ画面と同じ key のもの、なければ先頭）を表示する。属する Window がなければ null
 */
export function navTarget(screen: string, states: Readonly<Record<string, WindowState>>, screenOf: Readonly<Record<string, string>>, usedAt: Readonly<Record<string, number>>): { key: string; state: WindowState } | null {
  const mine = Object.keys(states).filter((k) => (screenOf[k] ?? k) === screen);
  const latest = (ks: string[]) => ks.reduce<string | undefined>((best, k) => (best === undefined || (usedAt[k] ?? 0) > (usedAt[best] ?? 0) ? k : best), undefined);
  const front = mine.find((k) => states[k] === 'front');
  // 前面でも使用記録がない（usedAt が 0）Window は、既定で前面になっているだけなので最小化せず前面に出す（使用後に押すと最小化）
  if (front !== undefined) return { key: front, state: (usedAt[front] ?? 0) > 0 ? 'front' : 'visible' };
  const open = latest(mine.filter((k) => states[k] !== 'closed' && states[k] !== 'behind'));
  if (open !== undefined) return { key: open, state: states[open]! };
  const closed = mine.filter((k) => states[k] === 'closed');
  const key = latest(closed.filter((k) => (usedAt[k] ?? 0) > 0)) ?? (closed.includes(screen) ? screen : closed[0]);
  return key === undefined ? null : { key, state: 'closed' };
}

/** 表示中（前面・表示中）のコンポーネントの数。背面・最小化・閉じたものは数えない（PARAM-136・AC-874） */
export function shownCount(states: Readonly<Record<string, WindowState>>): number {
  return Object.values(states).filter((s) => s === 'front' || s === 'visible').length;
}

