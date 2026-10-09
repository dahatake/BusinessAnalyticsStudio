// 3D シーンの描画（React Three Fiber + drei）。WebGPU を優先し、使えなければ WebGL2 に切り替える。FR-065 / FR-066
// モデルは外部から取得せず、すべて手続き生成する（FR-068）。
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAnimation } from '../store/animation';
import { countFrame, useIndustryPreset, useView3D } from '../store/view3d';
import {
  MORPH_COUNT, SINK_NODE, SOURCE_NODES, heroObjects, kpiTowerObjects, morphLayouts, particlePosition,
  type IndustryPreset, type ObjectSpec, type SceneKey,
} from './presets';
import { QUALITY_PROFILES, type Quality } from './quality';

type Kind = 'trying-webgpu' | 'webgl2';
type WebGPUModule = { WebGPURenderer: new (p: Record<string, unknown>) => { init(): Promise<unknown> } & Record<string, unknown> };

/** WebGPU が使えるかを確かめ、使えるなら three/webgpu を読み込む。使えなければ null。 */
async function detectWebGPU(): Promise<WebGPUModule | null> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu;
    if (!gpu) return null;
    if (!(await gpu.requestAdapter())) return null;
    return (await import('three/webgpu')) as unknown as WebGPUModule;
  } catch {
    return null;
  }
}

function Geometry({ shape }: { shape: ObjectSpec['shape'] }) {
  switch (shape) {
    case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
    case 'sphere': return <sphereGeometry args={[1, 24, 16]} />;
    case 'cone': return <coneGeometry args={[0.5, 1, 24]} />;
    default: return <boxGeometry args={[1, 1, 1]} />;
  }
}

function Objects({ specs }: { specs: ObjectSpec[] }) {
  return (
    <group>
      {specs.map((o) => (
        <mesh key={o.id} position={o.position} scale={o.size} castShadow receiveShadow>
          <Geometry shape={o.shape} />
          <meshStandardMaterial color={o.color} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function Ground({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[24, 24]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Particles({ count, preset }: { count: number; preset: IndustryPreset }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);
  const tmp = useMemo<[number, number, number]>(() => [0, 0, 0], []);
  useFrame((state) => {
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const t = state.clock.elapsedTime * 0.15;
    for (let i = 0; i < count; i++) {
      particlePosition(i, t, tmp);
      attr.setXYZ(i, tmp[0], tmp[1], tmp[2]);
    }
    attr.needsUpdate = true;
  });
  return (
    <group>
      {[...SOURCE_NODES, SINK_NODE].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.35, 24, 16]} />
          <meshStandardMaterial color={i === SOURCE_NODES.length ? preset.color : preset.accent} />
        </mesh>
      ))}
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial color={preset.accent} size={0.07} sizeAttenuation />
      </points>
    </group>
  );
}

function Morph({ toBe, preset }: { toBe: boolean; preset: IndustryPreset }) {
  const layouts = useMemo(() => morphLayouts(MORPH_COUNT), []);
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [toBe, invalidate]);
  useFrame((_, dt) => {
    const target = toBe ? 1 : 0;
    t.current += (target - t.current) * Math.min(1, dt * 4);
    if (Math.abs(target - t.current) < 0.002) t.current = target;
    const g = group.current;
    if (g) {
      g.children.forEach((c, i) => {
        const a = layouts.asIs[i] as [number, number, number];
        const b = layouts.toBe[i] as [number, number, number];
        c.position.set(a[0] + (b[0] - a[0]) * t.current, a[1] + (b[1] - a[1]) * t.current, a[2] + (b[2] - a[2]) * t.current);
      });
    }
    if (t.current !== target) invalidate();
  });
  return (
    <group ref={group}>
      {layouts.asIs.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.7, 0.5, 0.7]} />
          <meshStandardMaterial color={i % 2 ? preset.color : preset.accent} />
        </mesh>
      ))}
    </group>
  );
}

function FrameCounter() {
  useFrame(() => countFrame());
  return null;
}

/** 業種プリセットのカメラパスの先頭を初期の視点にする。業種が変わったときだけ視点を置き直す（FR-103）。 */
function CameraRig({ preset }: { preset: IndustryPreset }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const placed = useRef<string | null>(null);
  useEffect(() => {
    if (placed.current === preset.id) return;
    const first = preset.cameraPath[0];
    if (!first) return;
    // 最初の描画（既定の視点）では動かさず、業種を切り替えたときだけ置き直す
    if (placed.current !== null) {
      camera.position.set(...first.position);
      if (controls) { controls.target.set(...first.target); controls.update(); } else camera.lookAt(...first.target);
    }
    placed.current = preset.id;
  }, [preset, camera, controls]);
  return null;
}

function SceneContent({ scene, preset, quality, toBe }: { scene: SceneKey; preset: IndustryPreset; quality: Quality; toBe: boolean }) {
  const profile = QUALITY_PROFILES[quality];
  return (
    <>
      <color attach="background" args={[preset.scene.background]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} castShadow={profile.shadows} shadow-mapSize={[1024, 1024]} />
      <Ground color={preset.scene.ground} />
      {scene === 'hero' && <Objects specs={heroObjects(preset)} />}
      {scene === 'kpi-tower' && <Objects specs={kpiTowerObjects(preset)} />}
      {scene === 'dataflow' && <Particles count={profile.particles} preset={preset} />}
      {scene === 'asis-tobe' && <Morph toBe={toBe} preset={preset} />}
      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig preset={preset} />
      <FrameCounter />
    </>
  );
}

export function SceneCanvas({ toBe }: { toBe: boolean }) {
  const scene = useView3D((s) => s.scene);
  const quality = useView3D((s) => s.quality);
  const setRenderer = useView3D((s) => s.setRenderer);
  const playing = useAnimation((s) => s.playing);
  const preset = useIndustryPreset();
  const [kind, setKind] = useState<Kind | null>(null);
  const [ready, setReady] = useState(false);
  const gpuModule = useRef<WebGPUModule | null>(null);
  const rendererRef = useRef<{ init(): Promise<unknown> } | null>(null);
  const profile = QUALITY_PROFILES[quality];

  useEffect(() => {
    let alive = true;
    void detectWebGPU().then((m) => {
      if (!alive) return;
      gpuModule.current = m;
      if (m) setKind('trying-webgpu');
      else { setKind('webgl2'); setRenderer('WebGL2'); setReady(true); }
    });
    return () => { alive = false; };
  }, [setRenderer]);

  // WebGPU の初期化に失敗したら WebGL2 に切り替える
  useEffect(() => {
    if (kind !== 'trying-webgpu') return;
    let alive = true;
    const t = setTimeout(() => {
      const r = rendererRef.current;
      if (!r) return;
      r.init().then(() => { if (alive) { setRenderer('WebGPU'); setReady(true); } })
        .catch(() => { if (alive) { setKind('webgl2'); setRenderer('WebGL2'); setReady(true); } });
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [kind, setRenderer]);

  if (!kind) return null;
  const glFactory = kind === 'trying-webgpu'
    ? (props: { canvas: HTMLCanvasElement | OffscreenCanvas }) => {
      const r = new (gpuModule.current as WebGPUModule).WebGPURenderer({ canvas: props.canvas, antialias: profile.antialias });
      rendererRef.current = r;
      return r as never;
    }
    : { antialias: profile.antialias, preserveDrawingBuffer: true, powerPreference: 'high-performance' as const };

  return (
    <Canvas
      key={kind}
      gl={glFactory as never}
      shadows={profile.shadows}
      dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, profile.maxDpr)}
      frameloop={ready && playing ? 'always' : ready ? 'demand' : 'never'}
      camera={{ position: preset.cameraPath[0]?.position ?? [7, 6, 9], fov: 45 }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <Suspense fallback={null}>
        <SceneContent scene={scene} preset={preset} quality={quality} toBe={toBe} />
      </Suspense>
    </Canvas>
  );
}
