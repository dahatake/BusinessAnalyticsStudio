// 階層の LOD の状態（カメラ距離 → 各レベルの表示・不透明度）。FR-031 / FR-032 / FR-034 / FR-036
// カメラのストア（cameraRig）の変化を直接読み、キャンバスが非表示でも、同じ状態をパンくずリスト・可視判定（twinProbe）・描画が読めるようにする。
// アニメーション停止中は、不透明度を即座に目標へ合わせる（FR-034）。再生中は、時間をかけてクロスフェードする（FR-031）。
import { create } from 'zustand';
import { useCameraRig } from '../three/cameraRig';
import {
  cameraDistance, initialLevel, isRendered, renderedDepth, resolveLevels, stepLevel,
  type LevelState, type LodLevelSpec,
} from '../three/lod';
import { viewportAspect } from '../three/sceneViewport';
import { getTwinLayout } from '../three/twin';
import type { TwinLayout } from '../three/entityLayout';
import { useAnimation } from './animation';
import { usePackStore } from './pack';

interface LodState {
  /** 注視点からカメラまでの距離 */
  distance: number;
  /** 深さごとのしきい値 */
  specs: LodLevelSpec[];
  /** 深さごとの状態 */
  levels: LevelState[];
  /** 表示中のいちばん深いレベル */
  shownDepth: number;
  /** 生成する（描画する）レベルの並び（例 "1110"）。これが変わったときだけ、描画の項目を作り直す */
  key: string;
}

const EMPTY: LodState = { distance: 0, specs: [], levels: [], shownDepth: 0, key: '' };

export const useLod = create<LodState>(() => EMPTY);

/** 1 回の更新で進める時間の上限（秒）。長く止まっていた後の最初の更新で、フェードを飛ばさないため */
const MAX_DT = 0.05;

let lastAt: number | null = null;
let initializedFor: TwinLayout | null = null;
let pending = false;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const schedule = (f: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else setTimeout(f, 16);
};

function packLevels() {
  const st = usePackStore.getState().state;
  return st.status === 'ready' ? st.pack.data.entities.levels ?? null : null;
}

/** カメラの今の距離から、各レベルの状態を更新する。dt を渡さなければ、前回からの実時間を使う（テストは dt を渡す）。 */
export function syncLod(opts: { dt?: number } = {}): void {
  const layout = getTwinLayout();
  if (!layout) {
    if (useLod.getState() !== EMPTY) useLod.setState(EMPTY, true);
    initializedFor = null;
    return;
  }
  const cam = useCameraRig.getState();
  const distance = cameraDistance(cam.position, cam.target);
  const specs = resolveLevels(layout, viewportAspect(), packLevels());
  const t = now();
  const dt = Math.min(MAX_DT, opts.dt ?? (lastAt === null ? 0 : (t - lastAt) / 1000));
  lastAt = t;
  const instant = !useAnimation.getState().playing;
  const prev = useLod.getState().levels;
  const first = initializedFor !== layout || prev.length !== specs.length;
  initializedFor = layout;
  const levels = specs.map((sp, i) => (first || !prev[i] ? initialLevel(distance, sp.threshold) : stepLevel(prev[i]!, distance, sp.threshold, { dt, instant })));
  const key = levels.map((l) => (isRendered(l) ? '1' : '0')).join('');
  const s = useLod.getState();
  const same = s.distance === distance && s.key === key && s.levels.length === levels.length
    && s.levels.every((l, i) => l.visible === levels[i]!.visible && l.opacity === levels[i]!.opacity)
    && s.specs.length === specs.length && s.specs.every((sp, i) => sp.threshold === specs[i]!.threshold && sp.meta === specs[i]!.meta);
  if (!same) useLod.setState({ distance, specs, levels, shownDepth: renderedDepth(levels), key });
  // フェードの途中は、次のフレームでも進める
  if (!instant && levels.some((l) => l.opacity !== (l.visible ? 1 : 0)) && !pending) {
    pending = true;
    schedule(() => { pending = false; syncLod(); });
  }
}

/** 今生成している（表示中のレベルの）デジタルツインの項目の数（FR-036） */
export function generatedObjectCount(layout: TwinLayout | null = getTwinLayout()): number {
  if (!layout) return 0;
  const key = useLod.getState().key;
  return layout.objects.filter((o) => key[o.depth] === '1').length;
}

/** テスト用: 状態を初期に戻す */
export function resetLodForTest(): void {
  lastAt = null;
  initializedFor = null;
  pending = false;
  useLod.setState(EMPTY, true);
}

let started = false;
/** カメラ・パック・アニメーションの切替で状態を更新する。アプリで 1 回だけ始める。 */
export function startLodFollow(): () => void {
  if (started) return () => undefined;
  started = true;
  const offs: Array<() => void> = [];
  offs.push(useCameraRig.subscribe(() => syncLod()));
  offs.push(usePackStore.subscribe(() => syncLod()));
  offs.push(useAnimation.subscribe((s, p) => { if (s.playing !== p.playing) syncLod(); }));
  syncLod();
  return () => { started = false; offs.forEach((f) => f()); };
}

startLodFollow();
