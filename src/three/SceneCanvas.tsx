// 3D シーンの描画（React Three Fiber + drei）。WebGPU を優先し、使えなければ WebGL2 に切り替える。FR-065 / FR-066
// モデルは外部から取得せず、すべて手続き生成する（FR-068）。
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './scene.css';
import { RESIZE_SETTLE_MS, SettlingResizeObserver, needsResize, registerSceneResizer } from './sceneViewport';
import { useAnimation } from '../store/animation';
import { countFrame, useIndustryPreset, useView3D } from '../store/view3d';
import { goHome, setPose } from './cameraRig';
import { Cinematic, Hologram } from './Cinematic';
import {
  MORPH_COUNT, SINK_NODE, SOURCE_NODES, heroObjects, kpiTowerObjects, morphLayouts, particlePosition,
  type IndustryPreset, type ObjectSpec, type SceneKey,
} from './presets';
import { QUALITY_PROFILES, type Quality } from './quality';
import { useTwinLayout } from './twin';
import { CameraSync, EntityTwin } from './TwinScene';

type Kind = 'trying-webgpu' | 'webgl2';
const FIRST_FRAME_MAX_WAIT_MS = 8000;

/**
 * 最初の描画は、シェーダーのコンパイル（プログラムごとに同期で数百ミリ秒）で画面が 1 秒以上止まる。
 * 描画を始める前に、材質ごとに 1 つずつコンパイルし、間で制御を返す。その間も描画面の大きさの追従・操作・測定を受け付けられる（FR-146 AC-243）。
 * コンパイルが終わる（または上限に達する）まで、onDone は呼ばない。
 */
function FirstFrameGate({ onDone }: { onDone: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    const finish = () => { if (alive) { alive = false; clearInterval(matrices); onDone(); } };
    // 描き始める前でも、クリックの当たり判定（レイキャスト）が現在の配置で働くよう、行列だけは更新しておく
    const matrices = setInterval(() => { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }, 50);
    const limit = setTimeout(finish, FIRST_FRAME_MAX_WAIT_MS);
    const r = gl as unknown as { compile?: (o: THREE.Object3D, c: THREE.Camera, t: THREE.Object3D) => void; isWebGLRenderer?: boolean; getContext?: () => WebGL2RenderingContext; info?: { programs?: { program?: WebGLProgram }[] | null } };
    const tick = () => new Promise<void>((res) => setTimeout(res, 0));
    void (async () => {
      await tick(); // 子の要素が組み上がるのを待つ
      if (r.isWebGLRenderer && r.compile) {
        const targets: THREE.Object3D[] = [];
        const seen = new Set<string>();
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m) return;
          const key = (Array.isArray(m) ? m.map((x) => x.uuid).join() : m.uuid) + ((o as THREE.InstancedMesh).isInstancedMesh ? ':i' : '');
          if (!seen.has(key)) { seen.add(key); targets.push(o); }
        });
        const ctx = r.getContext?.();
        const linked = new Set<WebGLProgram>();
        for (const o of targets) {
          if (!alive) return;
          try { r.compile(o, camera, scene); } catch { /* 描画のときに改めて扱われる */ }
          // プログラムのリンクは、最初の描画で初めて待たされる。1 つずつここで待ち、間で制御を返す
          for (const info of r.info?.programs ?? []) {
            const pr = info.program;
            if (!ctx || !pr || linked.has(pr)) continue;
            linked.add(pr);
            ctx.getProgramParameter(pr, ctx.LINK_STATUS);
            await tick();
            if (!alive) return;
          }
          await tick();
        }
      }
      finish();
    })();
    return () => { alive = false; clearInterval(matrices); clearTimeout(limit); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  return null;
}
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

function Ground({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
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

/**
 * 業種が変わったときだけ、視点を置き直す（FR-103）。デジタルツインがあれば全体を見渡す視点、なければ業種プリセットのカメラパスの先頭。
 * 最初の描画ではパック読み込み後のホーム（cameraRig）のままにする。
 */
function PresetHome({ preset, scene, hasTwin }: { preset: IndustryPreset; scene: SceneKey; hasTwin: boolean }) {
  const placed = useRef<string | null>(null);
  useEffect(() => {
    const key = `${preset.id}|${scene}|${hasTwin}`;
    if (placed.current === key) return;
    const first = preset.cameraPath[0];
    if (placed.current !== null) {
      if (hasTwin) goHome();
      else if (first) setPose({ position: [...first.position], target: [...first.target] });
    }
    placed.current = key;
  }, [preset, scene, hasTwin]);
  return null;
}

function SceneContent({ scene, preset, quality, toBe }: { scene: SceneKey; preset: IndustryPreset; quality: Quality; toBe: boolean }) {
  const profile = QUALITY_PROFILES[quality];
  const layout = useTwinLayout();
  const twin = scene === 'hero' && layout !== null && layout.objects.length > 0;
  // 装飾の街並み・設備（業種プリセット）は、デジタルツインの後ろに置く（ツインを隠さない）
  const backZ = twin && layout ? layout.min[2] - 8 : 0;
  const groundSize = twin && layout ? Math.max(24, (Math.abs(backZ) + 8) * 2, (layout.radius + 10) * 2) : 24;
  const decor = scene === 'hero' ? heroObjects(preset) : [];
  const core = decor.find((o) => o.id === 'hero-core');
  return (
    <>
      <color attach="background" args={[preset.scene.background]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} castShadow={profile.shadows} shadow-mapSize={[1024, 1024]} />
      <Ground color={preset.scene.ground} size={groundSize} />
      {scene === 'hero' && (
        <group position={[0, 0, backZ]}>
          <Objects specs={decor.filter((o) => o.id !== 'hero-core')} />
          {core && <Hologram spec={core} accent={preset.accent} />}
        </group>
      )}
      {twin && layout && <EntityTwin layout={layout} preset={preset} />}
      {scene === 'kpi-tower' && <Objects specs={kpiTowerObjects(preset)} />}
      {scene === 'dataflow' && <Particles count={profile.particles} preset={preset} />}
      {scene === 'asis-tobe' && <Morph toBe={toBe} preset={preset} />}
      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2.05} />
      <CameraSync />
      <PresetHome preset={preset} scene={scene} hasTwin={twin} />
      <Cinematic preset={preset} quality={quality} gridSize={groundSize} />
      <FrameCounter />
    </>
  );
}

/**
 * 描画面を表示領域の大きさに追従させる（FR-146 AC-243）。見た目の大きさ（CSS）は scene.css が即座に追従させ、
 * ここでは中身（ピクセル）の大きさを、表示領域に合わせる。中身の大きさの変更は重いので、変更が続く間はまとめて、止まってから 1 回だけ行う。
 * 座標を返す前（flushSceneSize）は、待たずにすぐ合わせる（クリックが外れない）。
 */
function SizeSync() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const setSize = useThree((s) => s.setSize);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const area = gl.domElement.parentElement;
    if (!area) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const r = area.getBoundingClientRect();
      if (needsResize(get().size, r)) setSize(r.width, r.height);
      invalidate();
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, RESIZE_SETTLE_MS);
    };
    apply();
    const unregister = registerSceneResizer(apply);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(area);
    window.addEventListener('resize', schedule);
    return () => { if (timer) clearTimeout(timer); ro?.disconnect(); window.removeEventListener('resize', schedule); unregister(); };
  }, [gl, get, setSize, invalidate]);
  return null;
}

/**
 * 描画方式（WebGPU → WebGL2）の選択と Canvas。3D ビューと地図（src/map）が共有する。
 * children は Canvas の中身（シーン）。アニメーション停止中は、必要なときだけ描く（frameloop=demand。FR-071）。
 */
export function RenderCanvas({ children, cameraPosition, fov = 45, paused = false, deferFirstFrame = false }: { children: ReactNode; cameraPosition: [number, number, number]; fov?: number; paused?: boolean; deferFirstFrame?: boolean }) {
  const quality = useView3D((s) => s.quality);
  const setRenderer = useView3D((s) => s.setRenderer);
  const playing = useAnimation((s) => s.playing);
  const [kind, setKind] = useState<Kind | null>(null);
  const [ready, setReady] = useState(false);
  // 最初の描画を少し遅らせる（3D ビューだけ。地図は遅らせない。FirstFrameGate。FR-146 AC-243）
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!kind) setSettled(false);
  }, [kind]);
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
      className="r3f-fill"
      resize={{ scroll: true, debounce: { scroll: 50, resize: 0 }, polyfill: SettlingResizeObserver as never }}
      gl={glFactory as never}
      shadows={profile.shadows}
      dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, profile.maxDpr)}
      frameloop={ready && (settled || !deferFirstFrame) && !paused ? (playing ? 'always' : 'demand') : 'never'}
      camera={{ position: cameraPosition, fov }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <SizeSync />
      {deferFirstFrame && <FirstFrameGate onDone={() => setSettled(true)} />}
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}

export function SceneCanvas({ toBe }: { toBe: boolean }) {
  const scene = useView3D((s) => s.scene);
  const quality = useView3D((s) => s.quality);
  const preset = useIndustryPreset();
  return (
    <RenderCanvas cameraPosition={preset.cameraPath[0]?.position ?? [7, 6, 9]} deferFirstFrame>
      <SceneContent scene={scene} preset={preset} quality={quality} toBe={toBe} />
    </RenderCanvas>
  );
}
