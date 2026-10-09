// デジタルツインの描画（FR-020）と、カメラのストアとの同期（FR-023）。React Three Fiber の中で使う。
// 各エンティティを 1 つの形にし、クリックで共通の選択（FR-024）に反映し、選択・関連・ホバーを強調する（FR-025）。
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSelection } from '../selection/hooks';
import { currentPose, rehomeIfPristine, syncFromCanvas, useCameraRig } from './cameraRig';
import type { TwinLayout, TwinObject, TwinTone } from './entityLayout';
import type { IndustryPreset } from './presets';
import { registerSceneCanvas, viewportAspect } from './sceneViewport';
import { twinGeometry, twinScale } from './twinGeometry';

const ORIGIN = 'view3d';

/** 色分け（業種プリセットの色から）。台（子を持つ項目）は、少し暗くして上に載る項目を目立たせる */
export function toneColor(tone: TwinTone, preset: IndustryPreset, platform: boolean): string {
  const base = tone === 'site' ? preset.color : tone === 'part' ? preset.accent : tone === 'role' ? '#e2e8f0' : '#a0aec0';
  if (!platform) return base;
  return `#${new THREE.Color(base).lerp(new THREE.Color('#1a202c'), 0.45).getHexString()}`;
}

interface Look { emissive: number; opacity: number }

/** 強調の度合い。選択＞ホバー＞関連。選択があるとき、関連しない項目は薄くする */
function lookOf(o: TwinObject, selected: ReadonlySet<string>, related: ReadonlySet<string> | null, hover: string | null): Look {
  if (selected.has(o.entityId)) return { emissive: 1, opacity: 1 };
  if (hover === o.entityId) return { emissive: 0.55, opacity: 1 };
  if (related?.has(o.entityId)) return { emissive: 0.3, opacity: 1 };
  return { emissive: 0, opacity: related ? 0.38 : 1 };
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

function TwinMesh({ o, preset, look, hovered, bind }: {
  o: TwinObject;
  preset: IndustryPreset;
  look: Look;
  hovered: boolean;
  bind: { select: (id: string, additive: boolean) => void; hover: (id: string | null) => void };
}) {
  const color = toneColor(o.tone, preset, o.platform);
  // 名前の表示: 上位の台（拠点・ラインなど）と、選択・ホバー中の項目だけ（全部出すと重なって読めない）
  const label = (o.platform && o.depth <= 1) || look.emissive >= 1 || hovered;
  return (
    <group>
      <mesh
        geometry={twinGeometry(o.shape)}
        position={o.position}
        scale={twinScale(o.shape, o.size)}
        castShadow
        receiveShadow
        userData={{ entityId: o.entityId }}
        onClick={(e) => { e.stopPropagation(); bind.select(o.entityId, e.shiftKey || e.ctrlKey || e.metaKey); }}
        onPointerOver={(e) => { e.stopPropagation(); bind.hover(o.entityId); }}
        onPointerOut={() => bind.hover(null)}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.45}
          metalness={0.15}
          emissive={look.emissive > 0 ? preset.accent : '#000000'}
          emissiveIntensity={look.emissive * 0.9}
          transparent={look.opacity < 1}
          opacity={look.opacity}
        />
      </mesh>
      {label && (
        <Html
          position={[o.position[0], o.top + 0.25, o.platform ? o.position[2] + o.size[2] / 2 - 0.3 : o.position[2]]}
          center
          zIndexRange={[5, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={labelStyle}>{o.name}</div>
        </Html>
      )}
    </group>
  );
}

/** パックのエンティティの 3D 表現。形・位置は layout（entityLayout）に従い、選択の状態は共通のストアから読む。 */
export function EntityTwin({ layout, preset }: { layout: TwinLayout; preset: IndustryPreset }) {
  const { selectedIds, related, hoverId, select, setHover } = useSelection();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const bind = useMemo(() => ({
    select: (id: string, additive: boolean) => select(id, { origin: ORIGIN, additive }),
    hover: (id: string | null) => setHover(id),
  }), [select, setHover]);
  return (
    <group name="entity-twin">
      {layout.objects.map((o) => <TwinMesh key={o.entityId} o={o} preset={preset} look={lookOf(o, selected, related, hoverId)} hovered={hoverId === o.entityId} bind={bind} />)}
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
