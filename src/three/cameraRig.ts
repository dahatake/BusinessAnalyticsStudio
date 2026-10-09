// 3D ビューのカメラ（FR-023 フライスルー遷移 / FR-025 カメラ移動 / FR-067 カメラパス）。
// カメラの位置と注視点を、描画（キャンバス）とは別のストアで持つ。理由は 2 つ。
//   1. 遷移を、キャンバスが非表示（別のタブが前面）でも進められる。次に開いたときは、すでに到着している。
//   2. テスト用フック（scene.camera）と、可視判定の投影（twinProbe）が、描画なしでも同じカメラを読める。
// キャンバス側は、遷移中はストアの位置を描き、止まっているときは利用者の操作（OrbitControls）の結果をストアへ書き戻す（src/three/Twin.tsx の CameraSync）。
//
// アニメーションを停止中（FR-071）は、遷移を省いて、移動後の視点に即座に切り替える。
import { create } from 'zustand';
import { useAnimation } from '../store/animation';
import { usePackStore } from '../store/pack';
import { useSelectionStore } from '../store/selection';
import type { TwinLayout, TwinObject, Vec3 } from './entityLayout';
import { viewportAspect } from './sceneViewport';
import { getTwinLayout, twinLayoutOf } from './twin';

export const CAMERA_FOV = 45;
/** PARAM ではなく、見た目の定数。遷移の長さ（ms） */
export const FLY_MIN_MS = 900;
export const FLY_MAX_MS = 1800;

export interface CameraPose { position: Vec3; target: Vec3 }

interface RigState extends CameraPose {
  moving: boolean;
  /** キャンバスの外（遷移・ホーム）がポーズを変えるたびに増える。キャンバスはこれを見て、ストアのポーズをカメラへ反映する */
  version: number;
  /** ホームのまま、利用者がまだ動かしていない。キャンバスの縦横比がわかったら、ホームを縦横比に合わせて置き直す */
  pristine: boolean;
  /** ホームを作ったときの縦横比 */
  homeAspect: number;
}

export const useCameraRig = create<RigState>(() => ({
  position: [9, 8, 11],
  target: [0, 1, 0],
  moving: false,
  version: 0,
  pristine: false,
  homeAspect: 0,
}));

type V = Vec3;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V): number => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const norm = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 0..1 を滑らかに加減速する（smootherstep） */
export function ease(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 遷移の途中のポーズ。注視点を補間し、注視点からカメラへの向きと距離も補間する。
 * 途中で少し引く（lift）ので、全体を見渡してから近づく「フライスルー」の動きになる。
 */
export function poseAt(from: CameraPose, to: CameraPose, k: number, lift = 0): CameraPose {
  const e = ease(k);
  const target = lerp(from.target, to.target, e);
  const offA = sub(from.position, from.target);
  const offB = sub(to.position, to.target);
  const dir = norm(lerp(norm(offA), norm(offB), e));
  const dist = (len(offA) + (len(offB) - len(offA)) * e) * (1 + lift * Math.sin(Math.PI * Math.min(1, Math.max(0, k))));
  return { position: add(target, mul(dir, dist)), target };
}

/** 2 つのポーズの間の「引き」の量（移動が大きいほど大きい。0.12〜0.5） */
export function liftFor(from: CameraPose, to: CameraPose): number {
  const travel = len(sub(from.target, to.target));
  const scale = Math.max(len(sub(from.position, from.target)), len(sub(to.position, to.target)), 1);
  return Math.min(0.5, Math.max(0.12, 0.12 + 0.3 * (travel / scale)));
}

export function durationFor(from: CameraPose, to: CameraPose): number {
  const travel = len(sub(from.target, to.target)) + Math.abs(len(sub(from.position, from.target)) - len(sub(to.position, to.target)));
  return Math.round(Math.min(FLY_MAX_MS, FLY_MIN_MS + travel * 30));
}

/**
 * 全体を見渡すホームのポーズ（階層の最上位から全体が入る）。aspect はキャンバスの縦横比（幅/高さ）。
 * 配置の幅・奥行き・高さが、斜め上からの視点で画面に収まる距離にする（細長い画面でも、縦長の画面でも全体が入る）。
 */
export function homePose(layout: TwinLayout, aspect = 1.6): CameraPose {
  const dir = norm([0.28, 0.95, 1]);
  const elev = Math.asin(dir[1]);
  const az = Math.atan2(dir[0], dir[2]);
  const t = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));
  const a = Math.min(4, Math.max(0.4, aspect));
  const w = layout.max[0] - layout.min[0];
  const d = layout.max[2] - layout.min[2];
  const h = layout.max[1];
  const apparentW = Math.abs(w * Math.cos(az)) + Math.abs(d * Math.sin(az));
  const apparentH = (Math.abs(d * Math.cos(az)) + Math.abs(w * Math.sin(az))) * Math.sin(elev) + h * Math.cos(elev);
  const fit = Math.max(apparentW / 2 / (t * a), apparentH / 2 / t);
  const dist = Math.max(layout.radius * 0.9 + 3, fit * 1.2 + Math.max(w, d) * 0.15 + 2);
  return { position: add(layout.center, mul(dir, dist)), target: [...layout.center] };
}

/** 項目にカメラを向けるポーズ。向きは今の向きを保ち（仰角だけ 30〜70 度に収める）、末端ほど近づく。 */
export function framePose(o: TwinObject, current: CameraPose): CameraPose {
  const target: V = [o.position[0], o.platform ? o.top : o.position[1], o.position[2]];
  const extent = o.platform ? Math.max(o.size[0], o.size[2]) : Math.max(o.size[0], o.size[1], o.size[2]);
  const dist = o.platform ? extent * 1.5 + 5 : 6 + extent * 1.2;
  const off = sub(current.position, current.target);
  const h = Math.hypot(off[0], off[2]);
  const az = h > 1e-6 ? Math.atan2(off[0], off[2]) : 0;
  const elev = Math.min((70 * Math.PI) / 180, Math.max((30 * Math.PI) / 180, Math.atan2(off[1], h)));
  const dir: V = [Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)];
  return { position: add(target, mul(dir, dist)), target };
}

/** keyframes（業種プリセットのカメラパス。位置と注視点）を、デジタルツインの大きさに合わせたポーズの列にする。 */
export function cameraPathPoses(keyframes: ReadonlyArray<CameraPose>, layout: TwinLayout | null): CameraPose[] {
  const first = keyframes[0];
  if (!first) return [];
  const base = layout ? homePose(layout) : first;
  const baseDist = len(sub(base.position, base.target));
  const firstDist = Math.max(1e-6, len(sub(first.position, first.target)));
  const s = baseDist / firstDist;
  return keyframes.map((k) => {
    const target = add(base.target, mul(sub(k.target, first.target), s));
    const off = sub(k.position, k.target);
    return { position: add(target, mul(norm(off), len(off) * s)), target };
  });
}

// ---- ストアの操作 ----

function applyPose(p: CameraPose, moving: boolean): void {
  useCameraRig.setState((s) => ({ position: [...p.position], target: [...p.target], moving, version: s.version + 1, pristine: false }));
}

/** キャンバスの操作（OrbitControls）の結果を書き戻す。遷移中は書き戻さない。 */
export function syncFromCanvas(p: CameraPose): void {
  const s = useCameraRig.getState();
  if (s.moving) return;
  const same = s.position.every((v, i) => Math.abs(v - p.position[i]!) < 1e-6) && s.target.every((v, i) => Math.abs(v - p.target[i]!) < 1e-6);
  if (same) return;
  useCameraRig.setState({ position: [...p.position], target: [...p.target], pristine: false });
}

export function currentPose(): CameraPose {
  const s = useCameraRig.getState();
  return { position: [...s.position], target: [...s.target] };
}

let run = 0;
let onDoneCurrent: (() => void) | null = null;
let activeTo: CameraPose | null = null;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const schedule = (f: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else setTimeout(f, 16);
};

/** 進行中の遷移を、その場で止める（ポーズはそのまま） */
export function cancelFly(): void {
  run++;
  onDoneCurrent = null;
  activeTo = null;
  if (useCameraRig.getState().moving) useCameraRig.setState({ moving: false });
}

/** ポーズへ即座に切り替える（遷移を省く）。 */
export function setPose(p: CameraPose): void {
  run++;
  onDoneCurrent = null;
  activeTo = null;
  applyPose(p, false);
}

/** 進行中の遷移を終点へ即座に進める（アニメーションを停止にしたとき） */
function finishNow(): void {
  const to = activeTo;
  const done = onDoneCurrent;
  if (!to) return;
  setPose(to);
  done?.();
}

/**
 * ポーズへ連続的に移動する。アニメーション停止中（または duration が 0）は、移動後の視点へ即座に切り替える。
 * 進行中の遷移は、現在のポーズから新しい遷移に置き換える。
 */
export function flyTo(to: CameraPose, opts: { duration?: number; onDone?: () => void } = {}): void {
  const from = currentPose();
  const duration = opts.duration ?? durationFor(from, to);
  if (!useAnimation.getState().playing || duration <= 0) {
    setPose(to);
    opts.onDone?.();
    return;
  }
  const id = ++run;
  onDoneCurrent = opts.onDone ?? null;
  activeTo = to;
  const lift = liftFor(from, to);
  const start = now();
  useCameraRig.setState({ moving: true });
  const tick = (): void => {
    if (id !== run) return;
    const k = (now() - start) / duration;
    if (k >= 1) {
      const done = onDoneCurrent;
      onDoneCurrent = null;
      activeTo = null;
      applyPose(to, false);
      done?.();
      return;
    }
    applyPose(poseAt(from, to, k, lift), true);
    schedule(tick);
  };
  schedule(tick);
}

/** ポーズの列を順にたどる（カメラパス。FR-067）。停止中は最後のポーズへ即座に切り替える。 */
export function flyPath(poses: readonly CameraPose[], onDone?: () => void): void {
  const last = poses[poses.length - 1];
  if (!last) { onDone?.(); return; }
  if (!useAnimation.getState().playing) { setPose(last); onDone?.(); return; }
  let i = 0;
  const next = (): void => {
    const p = poses[i++];
    if (!p) { onDone?.(); return; }
    flyTo(p, { duration: Math.max(FLY_MIN_MS, 1400), onDone: next });
  };
  next();
}

/** ホーム（全体を見渡す視点）へ。 */
export function goHome(animated = false): void {
  const layout = getTwinLayout();
  if (!layout) return;
  const aspect = viewportAspect();
  if (animated) flyTo(homePose(layout, aspect), { onDone: () => useCameraRig.setState({ pristine: true, homeAspect: aspect }) });
  else setHome(layout, aspect);
}

/** ホームの視点に即座に切り替える。利用者が動かすまで pristine（縦横比が変わったら置き直せる） */
export function setHome(layout: TwinLayout, aspect: number): void {
  run++;
  onDoneCurrent = null;
  activeTo = null;
  const p = homePose(layout, aspect);
  useCameraRig.setState((s) => ({ position: [...p.position], target: [...p.target], moving: false, version: s.version + 1, pristine: true, homeAspect: aspect }));
}

/** ホームのまま動かされていなければ、キャンバスの縦横比に合わせてホームを置き直す（初回の描画で縦横比が決まったとき・窓の大きさが変わったとき） */
export function rehomeIfPristine(aspect: number): void {
  const s = useCameraRig.getState();
  if (!s.pristine || s.moving || Math.abs(aspect - s.homeAspect) <= 0.08) return;
  const layout = getTwinLayout();
  if (layout) setHome(layout, aspect);
}

let started = false;
/**
 * 次の 3 つを、アプリで 1 回だけ始める。
 *   - パックが読み込まれたら、全体を見渡すホームの視点にする
 *   - 選択が変わったら（起こしたのが 3D 自身以外なら）、選ばれた項目へ遷移する（FR-025・FR-023）
 *   - アニメーションを停止にしたら、進行中の遷移を終点へ即座に切り替える（FR-071）
 */
export function startCameraFollow(): () => void {
  if (started) return () => undefined;
  started = true;
  const offs: Array<() => void> = [];

  let packData: object | null = null;
  const onPack = (): void => {
    const st = usePackStore.getState().state;
    const data = st.status === 'ready' ? st.pack.data : null;
    if (data && data !== packData) { packData = data; setHome(twinLayoutOf(data), viewportAspect()); }
  };
  offs.push(usePackStore.subscribe(onPack));
  onPack();

  offs.push(useSelectionStore.subscribe((s, prev) => {
    if (s.seq === prev.seq || s.origin === 'view3d') return;
    const id = s.selectedIds[s.selectedIds.length - 1];
    const o = id ? getTwinLayout()?.byId.get(id) : undefined;
    if (o) flyTo(framePose(o, currentPose()));
  }));

  let wasPlaying = useAnimation.getState().playing;
  offs.push(useAnimation.subscribe((s) => {
    if (wasPlaying && !s.playing && useCameraRig.getState().moving) finishNow();
    wasPlaying = s.playing;
  }));

  return () => { started = false; offs.forEach((f) => f()); };
}
