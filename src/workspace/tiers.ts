// コンポーネントの役割による分類と、階層（主役→補助→詳細）の規則（FR-244）。React に依存しない純粋なモデル。
// 階層は、読む順序と自動配置（FR-243。autoLayout.ts）を決めるだけで、表示できるデータの範囲は変えない（FR-112 のペルソナ切替の規則と同じ）。
import { PERSONA_PRIMARY } from './persona';
import type { Persona } from './layoutModel';
import { tr } from '../i18n';

export type Tier = 'primary' | 'supporting' | 'detail';
export const TIERS: readonly Tier[] = ['primary', 'supporting', 'detail'];
/** 階層の表示名（色だけに頼らず、文字でも示す。FR-244 AC-589） */
export const TIER_LABEL: Readonly<Record<Tier, string>> = { primary: '主役', supporting: '補助', detail: '詳細' };
/** 階層の形の違い（Badge の見た目。色以外の手がかり）。主役＝塗り、補助＝薄い塗り、詳細＝枠線 */
export const TIER_APPEARANCE: Readonly<Record<Tier, 'filled' | 'tint' | 'outline'>> = { primary: 'filled', supporting: 'tint', detail: 'outline' };

/** 役割（5 種）: 全体を要約する／判断の中心／判断を補助する／詳細・根拠を示す／操作・入力 */
export type Role = 'summary' | 'core' | 'aid' | 'evidence' | 'input';
export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  summary: '全体を要約する', core: '判断の中心', aid: '判断を補助する', evidence: '詳細・根拠を示す', input: '操作・入力',
};

/** コンポーネントのキー → 役割。載っていないものは「未分類」（補助として扱う。FR-244 AC-589） */
export const ROLE_OF: Readonly<Record<string, Role>> = {
  summary: 'summary',
  matrix: 'core', 'issue-solution': 'core', architecture: 'core', map: 'core', 'twin-view': 'core',
  'kpi-okr': 'aid', ranking: 'aid', 'discussion-tree': 'aid', 'knowledge-graph': 'aid',
  gantt: 'evidence', table: 'evidence', products: 'evidence',
};

/** コンポーネントのキー → 同じ対象を示すグループ。同じ階層で同じグループのものは隣り合わせに置く（FR-244） */
export const GROUP_OF: Readonly<Record<string, string>> = {
  summary: 'overview',
  matrix: 'priority', ranking: 'priority', 'kpi-okr': 'priority',
  'issue-solution': 'issue', 'discussion-tree': 'issue',
  gantt: 'process', table: 'process',
  architecture: 'system', 'knowledge-graph': 'system', products: 'system',
  map: 'field', 'twin-view': 'field',
};

export const roleOf = (key: string): Role | undefined => ROLE_OF[key];
export const groupOf = (key: string): string | undefined => GROUP_OF[key];

export interface TierInfo {
  tier: Tier;
  /** 理由（見出しのメニューで確かめられる文） */
  reason: string;
  role?: Role;
  group?: string;
  /** 利用者が変更した階層か */
  overridden: boolean;
}

/** 利用者が変えた階層（コンポーネントのキー → 階層。ペルソナ別に保存する） */
export type TierOverrides = Readonly<Record<string, Tier>>;

/** 役割から決まる、既定の階層（主役かどうかは別に決める）。役割のないもの（未分類）は補助 */
function baseTier(role: Role | undefined): Exclude<Tier, 'primary'> {
  return role === 'evidence' || role === 'input' ? 'detail' : 'supporting';
}

/**
 * `keys`（表示対象のコンポーネント）を分類する。主役はちょうど 1 つ。
 * 主役: 利用者が「主役」にしたもの。なければペルソナの既定の情報表現（FR-112 の表）。どちらもなければ、階層を変えていない先頭のもの。
 */
export function classify(persona: Persona, keys: readonly string[], overrides: TierOverrides = {}): Record<string, TierInfo> {
  const explicit = keys.find((k) => overrides[k] === 'primary');
  const dflt = PERSONA_PRIMARY[persona];
  let primary: string | undefined = explicit ?? (keys.includes(dflt) && (overrides[dflt] === undefined) ? dflt : undefined);
  if (!primary) primary = keys.find((k) => overrides[k] === undefined) ?? keys[0];
  const out: Record<string, TierInfo> = {};
  for (const k of keys) {
    const role = roleOf(k);
    const group = groupOf(k);
    const o = overrides[k];
    let tier: Tier;
    let reason: string;
    if (k === primary) {
      tier = 'primary';
      reason = o === 'primary'
        ? tr('主役: 利用者が主役に選んだため、最大の領域の先頭に置きます。')
        : role === 'core' && k === dflt
          ? tr('主役: {persona}の既定の情報表現（判断の中心）のため、最大の領域の先頭に置きます。', { persona: tr(persona) })
          : tr('主役: この画面で最初に読む情報として選ばれているため、最大の領域の先頭に置きます。');
    } else if (o && o !== 'primary') {
      tier = o;
      reason = o === 'detail'
        ? tr('詳細: 利用者が変更したため、主役の後ろ（下）に置きます。')
        : tr('補助: 利用者が変更したため、主役の近く（右）に置きます。');
    } else {
      tier = baseTier(role);
      const roleText = role ? tr(ROLE_LABEL[role]) : '';
      reason = tier === 'detail'
        ? tr('詳細: 役割が「{role}」のため、主役の後ろ（下）に置きます。', { role: roleText })
        : role
          ? tr('補助: 役割が「{role}」のため、主役の近く（右）に置きます。', { role: roleText })
          : tr('補助: 役割が決まっていない（未分類の）ため、補助として扱い、主役の近く（右）に置きます。');
    }
    out[k] = { tier, reason, ...(role ? { role } : {}), ...(group ? { group } : {}), overridden: o !== undefined && o === tier };
  }
  return out;
}

/** 階層ごとのキーを、グループが隣り合う順に並べる（元の順序を保つ。同じグループは最初に現れた位置にまとめる） */
export function orderByGroup(keys: readonly string[]): string[] {
  const seen: string[] = [];
  const byGroup = new Map<string, string[]>();
  for (const k of keys) {
    const g = groupOf(k) ?? `__${k}`;
    if (!byGroup.has(g)) { byGroup.set(g, []); seen.push(g); }
    byGroup.get(g)!.push(k);
  }
  return seen.flatMap((g) => byGroup.get(g)!);
}
