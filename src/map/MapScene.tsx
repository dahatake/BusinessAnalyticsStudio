// 地球儀・3D マップの描画（FR-021）。拠点の位置、流れの弧、流れの粒子（時間軸で量が変わり、停止中は静止する）。React Three Fiber の中で使う。
// 地球儀の外形は手続きで作る（球・緯線経線・大気の輝き）。外部の地図画像・モデルは取得しない（FR-068）。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DURATION, scaledDuration } from '../motion/fluent';
import { useMotionProfile } from '../motion/useMotion';
import { easedProgress, sampleVectorTransition, type VectorTransition } from '../three/interpolation';
import { useObjectVectorTransition, useSceneMotionAllowed } from '../three/useSceneTransition';
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
  return (
    <group>
      {data.sites.map((site) => <SiteDot key={site.id} site={site} mode={mode} selected={selected.has(site.id)} accent={accent} />)}
    </group>
  );
}

function SiteDot({ site, mode, selected, accent }: { site: MapData['sites'][number]; mode: MapMode; selected: boolean; accent: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const position = toMap(mode, site, mode === 'globe' ? 1.004 : 1);
  if (mode === 'flat') position[1] = 0.012;
  useObjectVectorTransition(mesh, position, 'position');
  useObjectVectorTransition(mesh, selected ? [1.8, 1.8, 1.8] : [1, 1, 1], 'scale');
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[mode === 'globe' ? 0.014 : 0.024, 16, 12]} />
      <meshBasicMaterial color={selected ? '#ffffff' : accent} />
    </mesh>
  );
}

function AnimatedFlowTube({ geometry, color, opacity }: { geometry: THREE.BufferGeometry; color: string; opacity: number }) {
  const [displayGeometry] = useState(() => geometry.clone());
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const currentOpacity = useRef(0);
  const opacityTransition = useRef<VectorTransition | null>(null);
  const geometryTransition = useRef<{ from: Float32Array; to: Float32Array; elapsedMs: number; durationMs: number } | null>(null);
  const allowed = useSceneMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const durationMs = scaledDuration(DURATION.gentle, tempo, allowed);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    if (!allowed || durationMs === 0) {
      currentOpacity.current = opacity;
      opacityTransition.current = null;
    } else if (currentOpacity.current !== opacity) {
      opacityTransition.current = { from: [currentOpacity.current], to: [opacity], elapsedMs: 0, durationMs };
    }
    if (material.current) material.current.opacity = currentOpacity.current;
    invalidate();
  }, [allowed, durationMs, invalidate, opacity]);

  useLayoutEffect(() => {
    const currentAttribute = displayGeometry.getAttribute('position') as THREE.BufferAttribute;
    const targetAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (currentAttribute.count !== targetAttribute.count) {
      displayGeometry.copy(geometry);
      geometryTransition.current = null;
      return;
    }
    const from = (currentAttribute.array as Float32Array).slice();
    const to = (targetAttribute.array as Float32Array).slice();
    if (!allowed || durationMs === 0 || from.every((value, index) => value === to[index])) {
      (currentAttribute.array as Float32Array).set(to);
      currentAttribute.needsUpdate = true;
      geometryTransition.current = null;
    } else geometryTransition.current = { from, to, elapsedMs: 0, durationMs };
    invalidate();
  }, [allowed, displayGeometry, durationMs, geometry, invalidate]);

  useFrame((_, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const activeOpacity = opacityTransition.current;
    if (activeOpacity && material.current) {
      const sample = sampleVectorTransition(activeOpacity, delta * 1000);
      currentOpacity.current = sample.value[0] ?? opacity;
      material.current.opacity = currentOpacity.current;
      opacityTransition.current = sample.done ? null : { ...activeOpacity, elapsedMs: activeOpacity.elapsedMs + delta * 1000 };
      if (!sample.done) invalidate();
    }
    const activeGeometry = geometryTransition.current;
    if (!activeGeometry) return;
    const attribute = displayGeometry.getAttribute('position') as THREE.BufferAttribute;
    const elapsedMs = activeGeometry.elapsedMs + delta * 1000;
    const progress = Math.min(1, elapsedMs / activeGeometry.durationMs);
    const eased = easedProgress(progress);
    const values = attribute.array as Float32Array;
    for (let i = 0; i < values.length; i++) values[i] = activeGeometry.from[i]! + (activeGeometry.to[i]! - activeGeometry.from[i]!) * eased;
    attribute.needsUpdate = true;
    if (progress >= 1) geometryTransition.current = null;
    else {
      geometryTransition.current = { ...activeGeometry, elapsedMs };
      invalidate();
    }
  });

  useEffect(() => () => {
    opacityTransition.current = null;
    geometryTransition.current = null;
    displayGeometry.dispose();
  }, [displayGeometry]);
  return (
    <mesh geometry={displayGeometry} frustumCulled={false}>
      <meshBasicMaterial ref={material} color={color} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** 流れ。弧（太さと濃さが時刻で変わる）と粒子（数と位置が時刻で変わる）。 */
function Flows({ data, mode, hour, quality }: { data: MapData; mode: MapMode; hour: number; quality: Quality }) {
  const invalidate = useThree((s) => s.invalidate);
  const playing = useSceneMotionAllowed();
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
  const update = useCallback((t: number): void => {
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
  }, [arcs, clouds, data.flows, hour, maxPer, maxVolume, tmp]);

  // 停止中: 時刻・方式・品質が変わったときだけ位置を求め直して 1 回描く（animT は止まっているので、同じ時刻なら同じ位置）
  useEffect(() => {
    if (data.flows.length === 0) return;
    update(animT.current);
    invalidate();
  }, [data.flows.length, invalidate, update]);
  // 再生中だけ粒子の位置を進め、空・非表示・停止時は更新しない。
  useFrame((_, dt) => {
    if (!playing || data.flows.length === 0 || (typeof document !== 'undefined' && document.hidden)) return;
    animT.current += dt;
    update(animT.current);
    invalidate();
  });

  return (
    <group>
      {data.flows.map((f, i) => {
        const color = flowColor(f.kind);
        return (
          <group key={f.id}>
            {tubes[i] && (
              <AnimatedFlowTube geometry={tubes[i]!.geometry} color={color} opacity={tubes[i]!.opacity} />
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
  const allowed = useSceneMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const durationMs = scaledDuration(DURATION.gentle, tempo, allowed);
  const allowedRef = useRef(allowed);
  const durationRef = useRef(durationMs);
  allowedRef.current = allowed;
  durationRef.current = durationMs;
  const transition = useRef<{ position: VectorTransition; target: VectorTransition } | null>(null);

  useLayoutEffect(() => {
    const view = initialView(mode, data.sites);
    const target = controls?.target ?? new THREE.Vector3();
    const nextPosition = [...view.position] as [number, number, number];
    const nextTarget = [...view.target] as [number, number, number];
    if (!allowedRef.current || durationRef.current === 0 || data.sites.length === 0) {
      camera.position.set(...nextPosition);
      target.set(...nextTarget);
      if (controls) controls.update(); else camera.lookAt(...nextTarget);
      transition.current = null;
    } else {
      transition.current = {
        position: { from: camera.position.toArray(), to: nextPosition, elapsedMs: 0, durationMs: durationRef.current },
        target: { from: target.toArray(), to: nextTarget, elapsedMs: 0, durationMs: durationRef.current },
      };
    }
    invalidate();
  }, [camera, controls, data.sites, invalidate, mode]);

  useLayoutEffect(() => {
    const pending = transition.current;
    if (allowed || !pending) return;
    camera.position.set(...(pending.position.to as [number, number, number]));
    if (controls) {
      controls.target.set(...(pending.target.to as [number, number, number]));
      controls.update();
    } else camera.lookAt(...(pending.target.to as [number, number, number]));
    transition.current = null;
    invalidate();
  }, [allowed, camera, controls, invalidate]);

  useFrame((_, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const current = transition.current;
    if (!current) return;
    const elapsedMs = current.position.elapsedMs + delta * 1000;
    const position = sampleVectorTransition(current.position, delta * 1000);
    const target = sampleVectorTransition(current.target, delta * 1000);
    camera.position.set(...(position.value as [number, number, number]));
    if (controls) {
      controls.target.set(...(target.value as [number, number, number]));
      controls.update();
    } else camera.lookAt(...(target.value as [number, number, number]));
    if (position.done && target.done) transition.current = null;
    else {
      transition.current = {
        position: { ...current.position, elapsedMs },
        target: { ...current.target, elapsedMs },
      };
      invalidate();
    }
  });

  useEffect(() => () => { transition.current = null; }, []);
  return null;
}

/** DOM の拠点ボタンを、カメラ操作時に 3D の位置へ合わせる。地球儀の裏側は隠す。 */
function MarkerProjector({ data, mode, refs }: { data: MapData; mode: MapMode; refs: MutableRefObject<Map<string, HTMLElement>> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as { addEventListener?(type: string, listener: () => void): void; removeEventListener?(type: string, listener: () => void): void } | null;
  const v = useMemo(() => new THREE.Vector3(), []);
  const place = useCallback((): void => {
    for (const s of data.sites) {
      const el = refs.current.get(s.id);
      if (!el) continue;
      const p = toMap(mode, s, 1.004);
      if (mode === 'flat') p[1] = 0.012;
      v.set(...p).project(camera);
      const front = mode === 'flat' || facesCamera(p, [camera.position.x, camera.position.y, camera.position.z]);
      const inside = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1.1 && Math.abs(v.y) <= 1.1;
      // 位置は left/top（px）で置き、transform は固定（地図の枠の大きさ・カメラが変わっても、項目自身の変形は変わらない）
      el.style.left = `${((v.x + 1) / 2) * size.width}px`;
      el.style.top = `${((1 - v.y) / 2) * size.height}px`;
      el.style.transform = 'translate(-50%, -100%)';
      el.style.visibility = front && inside ? 'visible' : 'hidden';
    }
  }, [camera, data.sites, mode, refs, size, v]);
  // Camera changes are event-driven so a static map does not keep a frame loop alive.
  useEffect(() => {
    place();
    if (data.sites.length === 0) return;
    const onVisibilityChange = (): void => { if (!document.hidden) { place(); invalidate(); } };
    controls?.addEventListener?.('change', place);
    document.addEventListener('visibilitychange', onVisibilityChange);
    invalidate();
    return () => {
      controls?.removeEventListener?.('change', place);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [controls, data.sites.length, invalidate, place]);
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
