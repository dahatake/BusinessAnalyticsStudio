// 操作の慣習（Windows／macOS）の判別と、ゾーンの操作のキー（FR-299）。画面（React）を持たない純粋な関数だけを置く。
//  - 判別できない環境（Linux など）は Windows の慣習で扱う。設定（自動／Windows／macOS）があれば、それを優先する（AC-812）。
//  - 5 つの操作（Snap・Group・Switch・Expand・Move）と Focus の切替は、修飾キー Ctrl+Alt（macOS の表示は ⌃⌥）と 1 つのキー。
//    ブラウザーは Win キーと ⌘ + 方向キーを横取りできないため、これらは使わない（AC-813）。
//  - 押下の判定は物理キー（KeyboardEvent.code）で行う。macOS の Option は文字を変えるため、key では判別できない。
//  - 既存のキー（Shift+F・H・Esc・コマンドパレットの Ctrl+K）とは重ならない。

export type OsKind = 'windows' | 'mac';
export type OsPref = 'auto' | OsKind;
export const OS_PREFS: readonly OsPref[] = ['auto', 'windows', 'mac'];
export const OS_PREF_LABEL: Record<OsPref, string> = { auto: '自動', windows: 'Windows', mac: 'macOS' };

/** 判別に使う環境の値（navigator の値を、そのまま渡す） */
export interface OsEnv {
  platform?: string;
  userAgent?: string;
  /** navigator.userAgentData.platform */
  uaPlatform?: string;
}

/** 環境の値から OS の慣習を分類する。macOS（iPadOS 含まない）は mac、それ以外（Windows・Linux・不明）は windows */
export function detectOs(env: OsEnv): OsKind {
  const hay = [env.uaPlatform, env.platform].filter((v): v is string => typeof v === 'string' && v !== '');
  if (hay.some((v) => /mac/i.test(v))) return 'mac';
  if (hay.some((v) => /win/i.test(v))) return 'windows';
  // platform がないときだけ userAgent で補う（Macintosh。iPhone・iPad の Safari は対象外）
  if (hay.length === 0 && typeof env.userAgent === 'string' && /Macintosh/.test(env.userAgent) && !/Mobile/.test(env.userAgent)) return 'mac';
  return 'windows';
}

/** 設定の上書きがあればそれ、「自動」なら環境の判別 */
export function resolveOs(pref: OsPref, env: OsEnv): OsKind {
  return pref === 'windows' || pref === 'mac' ? pref : detectOs(env);
}

/** いまのブラウザーの環境の値 */
export function currentEnv(): OsEnv {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return { platform: nav.platform, userAgent: nav.userAgent, uaPlatform: nav.userAgentData?.platform };
}

/** ゾーンの操作（5 つ）と、その補助（Move の逆向き・Focus の切替） */
export type ZoneOp = 'snap' | 'group' | 'switch' | 'expand' | 'move' | 'moveBack' | 'focus';

interface Chord { code: string; label: string }
/** 操作 → 物理キーと、キーの表記。修飾キーは Ctrl+Alt（macOS の表示は ⌃⌥）で共通 */
export const ZONE_CHORDS: Record<ZoneOp, Chord> = {
  move: { code: 'ArrowRight', label: '→' },
  moveBack: { code: 'ArrowLeft', label: '←' },
  snap: { code: 'ArrowDown', label: '↓' },
  expand: { code: 'ArrowUp', label: '↑' },
  group: { code: 'KeyG', label: 'G' },
  switch: { code: 'KeyW', label: 'W' },
  focus: { code: 'Enter', label: 'Enter' },
};

/** 修飾キーの表記 */
export function modifierLabel(os: OsKind): string {
  return os === 'mac' ? '⌃⌥' : 'Ctrl+Alt+';
}

/** キーの表示（Windows は「Ctrl+Alt+→」、macOS は「⌃⌥→」） */
export function chordLabel(os: OsKind, op: ZoneOp): string {
  return `${modifierLabel(os)}${ZONE_CHORDS[op].label}`;
}

export interface KeyEventLike { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }

/** 押されたキーが、どの操作か（Ctrl と Alt だけを押している場合。OS の設定にかかわらず、同じ物理キーで動く） */
export function matchZoneOp(e: KeyEventLike): ZoneOp | null {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return null;
  for (const op of Object.keys(ZONE_CHORDS) as ZoneOp[]) if (ZONE_CHORDS[op].code === e.code) return op;
  return null;
}

/** 文字を入力するキー（AltGr が Ctrl+Alt として届く配列での誤動作を避けるため、入力欄の中では動かさない） */
export function isLetterChord(op: ZoneOp): boolean {
  return /^Key/.test(ZONE_CHORDS[op].code);
}
