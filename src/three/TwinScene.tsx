// デジタルツインの描画（FR-020）と、カメラのストアとの同期（FR-023）。React Three Fiber の中で使う。
// 各エンティティを 1 つの形にし、クリックで共通の選択（FR-024）に反映し、選択・関連・ホバーを強調する（FR-025）。
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSelection } from '../selection/hooks';
import { useLod } from '../store/lod';
import { currentPose, rehomeIfPristine, syncFromCanvas, useCameraRig } from './cameraRig';
import type { TwinLayout, TwinObject, TwinTone } from './entityLayout';
import type { IndustryPreset } from './presets';
import { registerSceneCanvas, viewportAspect } from './sceneViewport';
import { buildDrawables, disposeDrawables, entityIdOfHit, planDraw, setDrawOpacity } from './twinDraw';
import { twinGeometry, twinScale } from './twinGeometry';

const ORIGIN = 'view3d';

/** 色分け（業種プリセットの色から）。台（子を持つ項目）は、少し暗くして上に載る項目を目立たせる */
export function toneColor(tone: TwinTone, preset: IndustryPreset, platform: boolean): string {
  const base = tone === 'site' ? preset.color : tone === 'part' ? preset.accent : tone === 'role' ? '#e2e8f0' : '#a0aec0';
  if (!platform) return base;
  return `#${new THREE.Color(base).lerp(new THREE.Color('#1a202c'), 0.45).getHexString()}`;
}

/** 選択があるとき、関連しない項目を薄くする不透明度 */
const DIM_OPACITY = 0.38;

/** 強調の度合い。選択＞ホバー＞関連。強調しない項目は 0 */
function emissiveOf(id: string, selected: ReadonlySet<string>, related: ReadonlySet<string> | null, hover: string | null): number {
  if (selected.has(id)) return 1;
  if (hover === id) return 0.55;
  if (related?.has(id)) return 0.3;
  return 0;
}

const labelStyle: CSSProperties = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: '16px',
  background: 'rgba(15, 23, 42, 0.78)',
  color: '#ffffff',
  border: '1px solid rgba(255, 255, 255, 0.35)',
};

type HitEvent = { object: THREE.Object3D; instanceId?: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; stopPropagation: () => void };

/** 強調する項目（選択・ホバー・関連）の重ね描き。元の形のすぐ外側に、光る同じ形を置く。当たり判定はもたない（元の形が受ける） */
function Highlight({ o, preset, emissive, opacity }: { o: TwinObject; preset: IndustryPreset; emissive: number; opacity: number }) {
  const s = twinScale(o.shape, o.size);
  return (
    <mesh
      geometry={twinGeometry(o.shape)}
      position={o.position}
      scale={[s[0] * 1.004, s[1] * 1.004, s[2] * 1.004]}
      raycast={() => null}
      renderOrder={1}
    >
      <meshStandardMaterial
        color={toneColor(o.tone, preset, o.platform)}
        roughness={0.45}
        metalness={0.15}
        emissive={preset.accent}
        emissiveIntensity={emissive * 0.9}
        transparent={opacity < 1}
        opacity={opacity}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

/**
 * パックのエンティティの 3D 表現。形・位置は layout（entityLayout）に従い、選択の状態は共通のストアから読む。
 * 表示中のレベルの項目だけを作り（FR-036）、同じ形・色・階層はインスタンス描画にまとめる。レベルの現れ方はクロスフェード（FR-031）。
 */
export function EntityTwin({ layout, preset }: { layout: TwinLayout; preset: IndustryPreset }) {
  const { selectedIds, related, hoverId, select, setHover } = useSelection();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const invalidate = useThree((s) => s.invalidate);
  const key = useLod((s) => s.key);
  const levels = useLod((s) => s.levels);
  const bind = useMemo(() => ({
    select: (id: string, additive: boolean) => select(id, { origin: ORIGIN, additive }),
    hover: (id: string | null) => setHover(id),
  }), [select, setHover]);

  const groups = useMemo(
    () => planDraw(layout, (o) => toneColor(o.tone, preset, o.platform), (d) => key[d] === '1'),
    [layout, preset, key],
  );
  const root = useMemo(() => buildDrawables(layout, groups), [layout, groups]);
  useEffect(() => () => disposeDrawables(root), [root]);

  // レベルの不透明度（フェード）を材質に反映する。選択があるとき、関連しない項目は薄くする
  const dim = related ? DIM_OPACITY : 1;
  useEffect(() => {
    const apply = (): void => {
      const lv = useLod.getState().levels;
      setDrawOpacity(root, (d) => lv[d]?.opacity ?? 0, dim);
      invalidate();
    };
    apply();
    return useLod.subscribe(apply);
  }, [root, dim, invalidate]);

  const onClick = (e: HitEvent): void => {
    const id = entityIdOfHit(e.object, e.instanceId);
    if (!id) return;
    e.stopPropagation();
    bind.select(id, e.shiftKey || e.ctrlKey || e.metaKey);
  };
  const onOver = (e: HitEvent): void => {
    const id = entityIdOfHit(e.object, e.instanceId);
    if (!id) return;
    e.stopPropagation();
    bind.hover(id);
  };

  const shown = layout.objects.filter((o) => key[o.depth] === '1');
  const lit = shown.map((o) => ({ o, emissive: emissiveOf(o.entityId, selected, related, hoverId) })).filter((x) => x.emissive > 0);
  return (
    <group name="entity-twin">
      <primitive object={root} onClick={onClick} onPointerOver={onOver} onPointerOut={() => bind.hover(null)} />
      {lit.map(({ o, emissive }) => (
        <Highlight key={o.entityId} o={o} preset={preset} emissive={emissive} opacity={levels[o.depth]?.opacity ?? 0} />
      ))}
      {shown.map((o) => {
        // 名前の表示: 上位の台（拠点・ラインなど）と、選択・ホバー中の項目だけ（全部出すと重なって読めない）
        const label = (o.platform && o.depth <= 1) || selected.has(o.entityId) || hoverId === o.entityId;
        if (!label) return null;
        return (
          <Html
            key={o.entityId}
            position={[o.position[0], o.top + 0.25, o.platform ? o.position[2] + o.size[2] / 2 - 0.3 : o.position[2]]}
            center
            zIndexRange={[5, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={labelStyle}>{o.name}</div>
          </Html>
        );
      })}
    </group>
  );
}

/**
 * カメラのストア（cameraRig）とキャンバスのカメラを同期する。
 *   - 遷移中・ホームへの切替では、ストアのポーズをカメラと OrbitControls の注視点へ反映する
 *   - 止まっているときは、利用者の操作（回転・拡大縮小）の結果をストアへ書き戻す
 */
export function CameraSync() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const applied = useMemo(() => ({ version: -1 }), []);

  useEffect(() => {
    registerSceneCanvas(gl.domElement);
    return () => registerSceneCanvas(null);
  }, [gl]);

  // 最初の描画の前でも、ホームを描画面の縦横比に置き直し、カメラをストアの視点に置く
  // （クリックの当たり判定が、見えている位置と合う。大きさを変えた直後も同じ。FR-146 AC-244）
  useEffect(() => {
    const place = (): void => {
      rehomeIfPristine(viewportAspect());
      const r = useCameraRig.getState();
      camera.position.set(...r.position);
      camera.lookAt(...r.target);
      camera.updateMatrixWorld(true);
    };
    place();
    const unsub = useCameraRig.subscribe(place);
    const area = gl.domElement.parentElement;
    const ro = typeof ResizeObserver === 'undefined' || !area ? null : new ResizeObserver(place);
    if (area) ro?.observe(area);
    window.addEventListener('resize', place);
    return () => { unsub(); ro?.disconnect(); window.removeEventListener('resize', place); };
  }, [camera, gl]);

  // ストアが変わったら描画を要求する（アニメーション停止中は、変わったときだけ描く）
  useEffect(() => useCameraRig.subscribe(() => invalidate()), [invalidate]);

  useFrame(() => {
    // ホームのまま動かされていなければ、キャンバスの縦横比に合わせてホームを置き直す
    rehomeIfPristine(viewportAspect());
    const r = useCameraRig.getState();
    if (r.moving || r.version !== applied.version) {
      camera.position.set(...r.position);
      if (controls) { controls.target.set(...r.target); controls.update(); } else camera.lookAt(...r.target);
      applied.version = r.version;
      return;
    }
    const p = camera.position;
    const t = controls?.target;
    if (!t) return;
    const cur = currentPose();
    if (Math.abs(p.x - cur.position[0]) + Math.abs(p.y - cur.position[1]) + Math.abs(p.z - cur.position[2])
      + Math.abs(t.x - cur.target[0]) + Math.abs(t.y - cur.target[1]) + Math.abs(t.z - cur.target[2]) > 1e-6) {
      syncFromCanvas({ position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] });
    }
  }, -1);
  return null;
}
