// 業種プリセットと、3D シーンの手続き生成の定義。外部のモデルは使わない（FR-068）。
export interface IndustryPreset {
  id: string;
  label: string;
  color: string;
  accent: string;
}

/** FR-103 の 5 業種（金融・製造・小売・物流・公共） */
export const INDUSTRY_PRESETS: readonly IndustryPreset[] = [
  { id: 'finance', label: '金融', color: '#2b6cb0', accent: '#90cdf4' },
  { id: 'manufacturing', label: '製造', color: '#dd6b20', accent: '#fbd38d' },
  { id: 'retail', label: '小売', color: '#d53f8c', accent: '#fbb6ce' },
  { id: 'logistics', label: '物流', color: '#2f855a', accent: '#9ae6b4' },
  { id: 'public', label: '公共', color: '#6b46c1', accent: '#d6bcfa' },
];

export function resolvePreset(idOrLabel: string | undefined | null): IndustryPreset {
  return INDUSTRY_PRESETS.find((p) => p.id === idOrLabel || p.label === idOrLabel) ?? (INDUSTRY_PRESETS[1] as IndustryPreset);
}

export const SCENE_KEYS = ['hero', 'kpi-tower', 'dataflow', 'asis-tobe'] as const;
export type SceneKey = (typeof SCENE_KEYS)[number];
export const SCENE_LABELS: Record<SceneKey, string> = {
  hero: 'ヒーロー（デジタルツイン）',
  'kpi-tower': 'KPI タワー',
  dataflow: 'データフロー',
  'asis-tobe': 'AsIs → ToBe',
};

export type Shape = 'box' | 'cylinder' | 'sphere' | 'cone';
export interface ObjectSpec {
  id: string;
  shape: Shape;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

/** ヒーローのデジタルツイン。業種ごとに形・並び・色が変わる。 */
export function heroObjects(p: IndustryPreset): ObjectSpec[] {
  const out: ObjectSpec[] = [];
  const add = (shape: Shape, position: [number, number, number], size: [number, number, number], color = p.color) =>
    out.push({ id: `hero-${out.length}`, shape, position, size, color });
  switch (p.id) {
    case 'finance': // 高さの違う高層ビル群
      for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
        const h = 1 + ((i * 7 + j * 3) % 6) * 0.8;
        add('box', [(i - 3) * 1.1, h / 2, (j - 1) * 1.4], [0.8, h, 0.8], i % 2 ? p.color : p.accent);
      }
      break;
    case 'manufacturing': // 工場の建屋・煙突・ライン
      add('box', [0, 0.6, 0], [5, 1.2, 2.4]);
      for (let i = 0; i < 3; i++) add('cylinder', [-1.8 + i * 1.8, 2, -0.6], [0.35, 1.6, 0.35], p.accent);
      for (let i = 0; i < 5; i++) add('box', [-2 + i, 0.2, 2.2], [0.6, 0.4, 0.6], p.accent);
      break;
    case 'retail': // 球の陳列
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) add('sphere', [(i - 2.5) * 1, 0.4, (j - 1.5) * 1], [0.4, 0.4, 0.4], (i + j) % 2 ? p.color : p.accent);
      break;
    case 'logistics': // コンテナの積み上げ
      for (let i = 0; i < 5; i++) for (let k = 0; k < 1 + (i % 3); k++) add('box', [(i - 2) * 1.5, 0.4 + k * 0.8, 0], [1.3, 0.7, 0.7], (i + k) % 2 ? p.color : p.accent);
      break;
    default: // 公共: 円柱の列柱と屋根
      for (let i = 0; i < 6; i++) add('cylinder', [(i - 2.5) * 0.9, 1, 0], [0.25, 2, 0.25], p.accent);
      add('box', [0, 2.15, 0], [5.6, 0.3, 1.6]);
      add('cone', [0, 3.0, 0], [1.4, 1.4, 1.4]);
  }
  return out;
}

/** KPI タワー（サンプルの値。実データはパックから差し替える想定）。 */
export function kpiTowerObjects(p: IndustryPreset): ObjectSpec[] {
  const values = [3.2, 5.1, 2.4, 4.3, 6.0, 3.7];
  return values.map((v, i) => ({
    id: `kpi-${i}`,
    shape: 'box' as const,
    position: [(i - 2.5) * 1.3, v / 2, 0] as [number, number, number],
    size: [0.9, v, 0.9] as [number, number, number],
    color: i % 2 ? p.color : p.accent,
  }));
}

/** AsIs の配置と ToBe の配置。同じ数の要素を、AsIs（ばらばら）から ToBe（整列）へ補間する。 */
export function morphLayouts(count = 24): { asIs: [number, number, number][]; toBe: [number, number, number][] } {
  const asIs: [number, number, number][] = [];
  const toBe: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const r = 1 + ((i * 37) % 17) / 4;
    asIs.push([Math.cos(a) * r, 0.3 + ((i * 13) % 7) * 0.35, Math.sin(a) * r]);
    toBe.push([((i % 6) - 2.5) * 1, 0.3, (Math.floor(i / 6) - 1.5) * 1]);
  }
  return { asIs, toBe };
}

export const MORPH_COUNT = 24;
export const SOURCE_NODES: [number, number, number][] = [[-4, 0.5, 0], [0, 0.5, -2.5], [0, 0.5, 2.5]];
export const SINK_NODE: [number, number, number] = [4, 0.5, 0];

/** データフローの粒子 i の、時刻 t（0..1 を周回）での位置 */
export function particlePosition(i: number, t: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const src = SOURCE_NODES[i % SOURCE_NODES.length] as [number, number, number];
  const phase = (t + ((i * 0.6180339) % 1)) % 1;
  const k = phase;
  out[0] = src[0] + (SINK_NODE[0] - src[0]) * k;
  out[1] = src[1] + Math.sin(k * Math.PI) * 1.2 + (((i * 7) % 5) - 2) * 0.05;
  out[2] = src[2] + (SINK_NODE[2] - src[2]) * k + (((i * 11) % 7) - 3) * 0.06;
  return out;
}

export function objectCount(scene: SceneKey, preset: IndustryPreset, particles: number): number {
  switch (scene) {
    case 'hero': return heroObjects(preset).length;
    case 'kpi-tower': return kpiTowerObjects(preset).length;
    case 'dataflow': return SOURCE_NODES.length + 1 + particles;
    default: return MORPH_COUNT;
  }
}
