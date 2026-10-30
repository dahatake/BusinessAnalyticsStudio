// タスク指向の適応型ワークスペースの「ゾーン」の計算（FR-298）。画面（React）を持たない純粋な関数だけを置く。
// 5 階層: アプリ → ウィンドウ → ゾーン → タスクワークスペース → タスク文脈。この中の「ゾーン」と「モード」を扱う。
//  - ゾーンは意味名（Main／Reference／Communication／Monitor）とロール（主・参照・対話・監視）を持つ（AC-805）。
//  - ロール（どのコンポーネントがどのゾーンか）と、レイアウト（ゾーンの割合）は別々に保持する（AC-806）。
//  - モード（Focus／Compare／Monitor／Meeting／Research）は、どのゾーンをどの重みで出すかの定義だけ（AC-807）。
// 次の項目（FR-299・FR-300）が、同じ計算に「dimmed（減光）」などの描き方の差を足せるよう、結果にゾーンごとの状態を持たせる。

export const ZONE_NAMES = ['main', 'reference', 'communication', 'monitor'] as const;
export type ZoneName = (typeof ZONE_NAMES)[number];

export const ZONE_META: Record<ZoneName, { label: string; role: string }> = {
  main: { label: 'Main', role: '主' },
  reference: { label: 'Reference', role: '参照' },
  communication: { label: 'Communication', role: '対話' },
  monitor: { label: 'Monitor', role: '監視' },
};

export const isZoneName = (v: unknown): v is ZoneName => typeof v === 'string' && (ZONE_NAMES as readonly string[]).includes(v);

/** 割合（%）。既定は Main 60／Reference 25／Communication 15（PARAM-138）。Monitor はモードが決める */
export type Ratios = Record<'main' | 'reference' | 'communication', number>;
export const DEFAULT_RATIOS: Readonly<Ratios> = { main: 60, reference: 25, communication: 15 };
/** モードの切替が画面に反映されるまでの上限（ms。PARAM-139） */
export const SWITCH_LIMIT_MS = 1000;

export const MODES = ['focus', 'compare', 'monitor', 'meeting', 'research'] as const;
export type WorkspaceMode = (typeof MODES)[number];
export const MODE_LABEL: Record<WorkspaceMode, string> = { focus: 'Focus', compare: 'Compare', monitor: 'Monitor', meeting: 'Meeting', research: 'Research' };
export const DEFAULT_MODE: WorkspaceMode = 'research';
export const isMode = (v: unknown): v is WorkspaceMode => typeof v === 'string' && (MODES as readonly string[]).includes(v);

/** 作業領域に対する矩形（0〜1 の割合） */
export interface ZoneRect { x: number; y: number; w: number; h: number }

export interface ZoneBox {
  name: ZoneName;
  /** 出していないゾーン（モードに含まれない・結合で別のゾーンに含まれた）は null */
  rect: ZoneRect | null;
  /** 結合したゾーンの代表の名前（結合していなければ自分）。コンポーネントはこの名前のゾーンへ置く */
  host: ZoneName;
  /** 結合して 1 つのゾーンになっている（代表のゾーンだけ true） */
  merged: boolean;
  /** 主でないために減光・縮小して残しているゾーン（Focus。FR-300 が使う） */
  dimmed: boolean;
}
export type ZoneLayout = Record<ZoneName, ZoneBox>;

/** Focus で、Main 以外のゾーンの 1 つあたりの割合（%）。残してあるものを呼び出せる大きさ（作業領域の 10% 以上）を保つ */
const FOCUS_SIDE = 12;

/** 入力された割合を、正の値に直す（NaN・負数・0 は最小 1） */
export function sanitizeRatio(v: number): number {
  return Number.isFinite(v) ? Math.min(98, Math.max(1, Math.round(v))) : 1;
}

/** モードごとの、出すゾーンとその重み。ロールの割り当てには触れない（割合は ratios から、ほかはモードの定義から） */
export function modeWeights(mode: WorkspaceMode, ratios: Ratios, recalled: readonly ZoneName[] = []): Partial<Record<ZoneName, number>> {
  switch (mode) {
    case 'focus':
      // Main を主にし、Main 以外は縮小して残す。呼び出したゾーンは、割合どおりの大きさで出す（FR-300）
      const ref = recalled.includes('reference') ? ratios.reference : FOCUS_SIDE;
      const com = recalled.includes('communication') ? ratios.communication : FOCUS_SIDE;
      return { main: Math.max(FOCUS_SIDE, 100 - ref - com), reference: ref, communication: com };
    case 'compare':
      return { main: 50, reference: 50 };
    case 'monitor':
      return { monitor: 70, main: 30 };
    case 'meeting':
      return { main: ratios.main, communication: ratios.communication };
    case 'research':
    default:
      return { main: ratios.main, reference: ratios.reference, communication: ratios.communication };
  }
}

/**
 * ゾーンを横に並べた配置（合計は作業領域全体を隙間・重なりなく覆う）。
 * `merged` に 2 つ以上の（出している）ゾーンを渡すと、それらは 1 つのゾーン（最初のゾーンが代表）になる。
 */
export function zoneLayout(mode: WorkspaceMode, ratios: Ratios, merged: readonly ZoneName[] = [], recalled: readonly ZoneName[] = []): ZoneLayout {
  const weights = modeWeights(mode, ratios, recalled);
  const shown = ZONE_NAMES.filter((n) => (weights[n] ?? 0) > 0);
  const group = ZONE_NAMES.filter((n) => merged.includes(n) && shown.includes(n));
  const mergedOn = group.length >= 2;
  const rep = mergedOn ? group[0]! : null;
  // 並べる単位（結合したものは 1 つにまとめ、最初のゾーンの位置に置く）
  const units = shown.filter((n) => !mergedOn || !group.includes(n) || n === rep);
  const weightOf = (n: ZoneName): number => (mergedOn && n === rep ? group.reduce((s, g) => s + (weights[g] ?? 0), 0) : weights[n] ?? 0);
  const total = units.reduce((s, n) => s + weightOf(n), 0) || 1;
  const out = {} as ZoneLayout;
  for (const n of ZONE_NAMES) out[n] = { name: n, rect: null, host: mergedOn && group.includes(n) ? rep! : n, merged: false, dimmed: false };
  let x = 0;
  units.forEach((n, i) => {
    const w = i === units.length - 1 ? 1 - x : weightOf(n) / total;
    out[n] = { ...out[n], rect: { x, y: 0, w, h: 1 }, merged: mergedOn && n === rep, dimmed: mode === 'focus' && n !== 'main' && !recalled.includes(n) };
    x += w;
  });
  return out;
}

/** コンポーネントを置くゾーン（結合していれば代表のゾーン）。そのゾーンを出していなければ null */
export function hostRect(layout: ZoneLayout, zone: ZoneName): ZoneRect | null {
  return layout[layout[zone].host].rect;
}

/**
 * ロールを割り当てていないコンポーネントの、モードによる既定の置き先（FR-300: モードの切替でも、位置・大きさが連続して変わる）。
 * 既定の Research では使わない（利用者が置いた分割の配置のまま。呼び出し側が決める）。出しているゾーンだけに置き、情報は欠けない。
 * 主役（tier が primary）はいちばん広いゾーン、それ以外は残りのゾーンへ順に配る。
 */
export function implicitRoles(layout: ZoneLayout, keys: readonly string[], tierOf: (key: string) => string, explicit: Readonly<Record<string, ZoneName>>): Record<string, ZoneName> {
  const shown = ZONE_NAMES.filter((n) => layout[n].rect !== null && layout[n].host === n);
  if (shown.length === 0) return {};
  const area = (n: ZoneName): number => { const r = layout[n].rect!; return r.w * r.h; };
  const lead = shown.reduce((a, b) => (area(b) > area(a) ? b : a));
  const rest = shown.filter((n) => n !== lead);
  const out: Record<string, ZoneName> = {};
  let i = 0;
  for (const k of keys) {
    if (explicit[k]) continue;
    if (tierOf(k) === 'primary' || rest.length === 0) { out[k] = lead; continue; }
    out[k] = rest[i % rest.length]!;
    i += 1;
  }
  return out;
}

/**
 * ロールの割り当て（コンポーネント → ゾーン）から、各コンポーネントの矩形を求める。同じゾーンに複数あるときは縦に等分する。
 * 出していないゾーンのコンポーネントは `hidden` に入れる（描かない。状態は保つ）。
 */
export function placeByRole(layout: ZoneLayout, roles: Readonly<Record<string, ZoneName>>, order: readonly string[]): { rects: Record<string, ZoneRect>; hidden: string[] } {
  const rects: Record<string, ZoneRect> = {};
  const hidden: string[] = [];
  const byHost = new Map<ZoneName, string[]>();
  for (const k of order) {
    const z = roles[k];
    if (!z) continue;
    const host = layout[z].host;
    if (!layout[host].rect) { hidden.push(k); continue; }
    byHost.set(host, [...(byHost.get(host) ?? []), k]);
  }
  for (const [host, keys] of byHost) {
    const r = layout[host].rect!;
    keys.forEach((k, i) => { rects[k] = { x: r.x, y: r.y + (r.h * i) / keys.length, w: r.w, h: r.h / keys.length }; });
  }
  return { rects, hidden };
}
