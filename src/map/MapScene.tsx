// 地球儀・3D マップの描画（FR-021）。拠点の位置、流れの弧、流れの粒子（時間軸で量が変わり、停止中は静止する）。React Three Fiber の中で使う。
// 地球儀の外形は手続きで作る（球・緯線経線・大気の輝き）。外部の地図画像・モデルは取得しない（FR-068）。
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAnimation } from '../store/animation';
import { QUALITY_PROFILES, type Quality } from '../three/quality';
import { type MapData } from './data';
import { flowColor, particleCount, particleU } from './flows';
import { arcPoints, centroid, facesCamera, graticule, pointOnArc, spread, toMap, type LatLng, type MapMode, type Vec3 } from './geo';

/** 粒子の最大数（流れごと）。品質プリセットの粒子数を、流れの数で割る */
export function particlesPerFlow(quality: Quality, flows: number): number {
  return Math.max(40, Math.min(900, Math.round(QUALITY_PROFILES[quality].particles / Math.max(1, flows))));
}

/** 拠点の重心を見る、初期のカメラの位置（地球儀は重心の真上、平面は少し手前の上） */
export function initialView(mode: MapMode, points: readonly LatLng[]): { position: Vec3; target: Vec3 } {
  const c = centroid(points) ?? { lat: 20, lng: 140 };
  const sp = Math.min(1.2, spread(points));
  if (mode === 'globe') {
    const d = 1 + Math.max(0.25, 3.6 * Math.sin(sp));
    return { position: toMap('globe', c, d), target: [0, 0, 0] };
  }
  const t = toMap('flat', c);
  const h = Math.max(0.8, 5 * sp + 0.6);
  return { position: [t[0], h, t[2] + h * 0.8], target: t };
}

function Graticule({ mode, color }: { mode: MapMode; color: string }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (const line of graticule(mode)) for (let i = 0; i < line.length - 1; i++) pts.push(...(line[i] as Vec3), ...(line[i + 1] as Vec3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [mode]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
    </lineSegments>
  );
}

function Base({ mode }: { mode: MapMode }) {
  if (mode === 'globe') {
    return (
      <group>
        <mesh>
          <sphereGeometry args={[1, 64, 40]} />
          <meshStandardMaterial color="#12315a" roughness={0.9} metalness={0.05} />
        </mesh>
        <mesh scale={1.045}>
          <sphereGeometry args={[1, 48, 32]} />
          <meshBasicMaterial color="#4cc9f0" transparent opacity={0.1} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
      <planeGeometry args={[4, 2]} />
      <meshStandardMaterial color="#12315a" roughness={0.95} />
    </mesh>
  );
}

function SiteDots({ data, mode, selected, accent }: { data: MapData; mode: MapMode; selected: ReadonlySet<string>; accent: string }) {
  const r = mode === 'globe' ? 0.014 : 0.024;
  return (
    <group>
      {data.sites.map((s) => {
        const p = toMap(mode, s, mode === 'globe' ? 1.004 : 1);
        if (mode === 'flat') p[1] = 0.012;
        const on = selected.has(s.id);
        return (
          <mesh key={s.id} position={p} scale={on ? 1.8 : 1}>
            <sphereGeometry args={[r, 16, 12]} />
            <meshBasicMaterial color={on ? '#ffffff' : accent} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 流れ。弧（太さと濃さが時刻で変わる）と粒子（数と位置が時刻で変わる）。 */
function Flows({ data, mode, hour, quality }: { data: MapData; mode: MapMode; hour: number; quality: Quality }) {
  const invalidate = useThree((s) => s.invalidate);
  const playing = useAnimation((s) => s.playing);
  const animT = useRef(0);
  const maxPer = particlesPerFlow(quality, data.flows.length);
  const maxVolume = useMemo(() => data.flows.reduce((m, f) => Math.max(m, f.volume), 0), [data.flows]);
  const arcs = useMemo(() => data.flows.map((f) => arcPoints(f.fromSite, f.toSite, mode)), [data.flows, mode]);

  const tubes = useMemo(() => data.flows.map((f, i) => {
    const share = maxVolume > 0 ? f.volume / maxVolume : 1;
    const n = particleCount(f, hour, maxPer, maxVolume) / maxPer;
    const base = mode === 'globe' ? 0.0035 : 0.006;
    const curve = new THREE.CatmullRomCurve3((arcs[i] as Vec3[]).map((p) => new THREE.Vector3(...p)));
    return { geometry: new THREE.TubeGeometry(curve, 48, base * (0.5 + 2.4 * share * n), 6, false), opacity: 0.25 + 0.6 * n };
  }), [data.flows, arcs, hour, maxPer, maxVolume, mode]);
  useEffect(() => () => tubes.forEach((t) => t.geometry.dispose()), [tubes]);

  const clouds = useMemo(() => data.flows.map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPer * 3), 3));
    return g;
  }), [data.flows, maxPer]);
  useEffect(() => () => clouds.forEach((g) => g.dispose()), [clouds]);

  const tmp = useMemo<Vec3>(() => [0, 0, 0], []);
  const update = (t: number): void => {
    data.flows.forEach((f, i) => {
      const g = clouds[i];
      const arc = arcs[i];
      if (!g || !arc) return;
      const count = particleCount(f, hour, maxPer, maxVolume);
      const attr = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < count; k++) {
        pointOnArc(arc, particleU(k, hour, t), tmp);
        attr.setXYZ(k, tmp[0], tmp[1], tmp[2]);
      }
      attr.needsUpdate = true;
      g.setDrawRange(0, count);
    });
  };

  // 停止中: 時刻・方式・品質が変わったときだけ位置を求め直して 1 回描く（animT は止まっているので、同じ時刻なら同じ位置）
  useEffect(() => { update(animT.current); invalidate(); });
  // 再生中: 経過時間を進める（停止中は進めない＝粒子が静止する。FR-071）
  useFrame((_, dt) => {
    if (!playing) return;
    animT.current += dt;
    update(animT.current);
  });

  return (
    <group>
      {data.flows.map((f, i) => {
        const color = flowColor(f.kind);
        return (
          <group key={f.id}>
            {tubes[i] && (
              <mesh geometry={tubes[i]!.geometry}>
                <meshBasicMaterial color={color} transparent opacity={tubes[i]!.opacity} depthWrite={false} />
              </mesh>
            )}
            {clouds[i] && (
              <points geometry={clouds[i]} frustumCulled={false}>
                <pointsMaterial color={color} size={mode === 'globe' ? 0.016 : 0.03} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
              </points>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** カメラの初期位置。方式・拠点が変わったときだけ置き直す（利用者の操作は、その後も保つ） */
function InitialView({ data, mode }: { data: MapData; mode: MapMode }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const v = initialView(mode, data.sites);
    camera.position.set(...v.position);
    if (controls) { controls.target.set(...v.target); controls.update(); } else camera.lookAt(...v.target);
    invalidate();
  }, [camera, controls, data.sites, mode, invalidate]);
  return null;
}

/** DOM の拠点ボタンを、3D の位置へ合わせる（毎フレーム）。地球儀の裏側は隠す。 */
function MarkerProjector({ data, mode, refs }: { data: MapData; mode: MapMode; refs: MutableRefObject<Map<string, HTMLElement>> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const v = useMemo(() => new THREE.Vector3(), []);
  const place = (): void => {
    for (const s of data.sites) {
      const el = refs.current.get(s.id);
      if (!el) continue;
      const p = toMap(mode, s, 1.004);
      if (mode === 'flat') p[1] = 0.012;
      v.set(...p).project(camera);
      const front = mode === 'flat' || facesCamera(p, [camera.position.x, camera.position.y, camera.position.z]);
      const inside = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1.1 && Math.abs(v.y) <= 1.1;
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
      el.style.visibility = front && inside ? 'visible' : 'hidden';
    }
  };
  useFrame(place);
  // 初回と、拠点のボタンが増えたとき
  useEffect(() => { place(); invalidate(); });
  return null;
}

export interface MapSceneProps {
  data: MapData;
  mode: MapMode;
  hour: number;
  quality: Quality;
  selected: ReadonlySet<string>;
  markerRefs: MutableRefObject<Map<string, HTMLElement>>;
}

export function MapScene({ data, mode, hour, quality, selected, markerRefs }: MapSceneProps) {
  return (
    <>
      <color attach="background" args={['#0b1b33']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <Base mode={mode} />
      <Graticule mode={mode} color="#7fb3ff" />
      <SiteDots data={data} mode={mode} selected={selected} accent="#fbd38d" />
      <Flows data={data} mode={mode} hour={hour} quality={quality} />
      <OrbitControls
        makeDefault
        enableDamping={false}
        enablePan={mode === 'flat'}
        minDistance={mode === 'globe' ? 1.12 : 0.4}
        maxDistance={mode === 'globe' ? 6 : 8}
        maxPolarAngle={mode === 'flat' ? Math.PI / 2.1 : Math.PI}
      />
      <InitialView data={data} mode={mode} />
      <MarkerProjector data={data} mode={mode} refs={markerRefs} />
    </>
  );
}
