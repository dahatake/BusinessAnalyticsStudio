// シネマティック表現（FR-067）: ブルーム・被写界深度・HDRI（手続き生成の環境光）・グリッド・ホログラム。
// すべて手続きで作り、外部のモデル・画像は取得しない（FR-068）。
// ブルームと被写界深度は、品質プリセットで切り替える（Low は無効、Medium はブルームのみ、High 以上は両方）。
// 後処理（EffectComposer）と環境マップ（PMREM）は WebGL レンダラーが対象。WebGPU のときはグリッドとホログラムだけになる（実際に描いているものは scene.info().effects で読める）。
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useAnimation } from '../store/animation';
import { useView3D } from '../store/view3d';
import type { IndustryPreset, ObjectSpec } from './presets';
import { QUALITY_PROFILES, type Quality } from './quality';

/** 後処理（ブルーム・被写界深度）。WebGL レンダラーのときだけ使う。描画を引き取る（優先度 1）ので、必要なときだけ配置する。 */
function PostFx({ bloom, dof }: { bloom: boolean; dof: boolean }) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGLRenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const built = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    let bokeh: BokehPass | null = null;
    if (dof) {
      // 注視点にピントを合わせ、手前・奥を少しぼかす（値はシーンの大きさ 20〜40 に合わせた控えめな量）
      bokeh = new BokehPass(scene, camera as THREE.PerspectiveCamera, { focus: 20, aperture: 0.00018, maxblur: 0.006 });
      composer.addPass(bokeh);
    }
    if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.5, 0.6, 0.82));
    composer.addPass(new OutputPass());
    return { composer, bokeh };
    // size は別の effect で追従する（作り直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, bloom, dof]);
  useEffect(() => {
    built.composer.setPixelRatio(gl.getPixelRatio());
    built.composer.setSize(size.width, size.height);
  }, [built, gl, size]);
  useEffect(() => () => built.composer.dispose(), [built]);
  useFrame(() => {
    if (built.bokeh) {
      const t = controls?.target;
      const d = t ? camera.position.distanceTo(t) : 20;
      (built.bokeh.uniforms as { focus: { value: number } }).focus.value = d;
    }
    built.composer.render();
  }, 1);
  return null;
}

/** グリッド（ホログラム調の床の格子）。LineBasicMaterial だけを使うので、WebGL2・WebGPU のどちらでも描ける。 */
function HoloGrid({ size, color }: { size: number; color: string }) {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(size, Math.round(size / 1.5), color, color);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.28;
    m.depthWrite = false;
    g.position.y = 0.012;
    return g;
  }, [size, color]);
  useEffect(() => () => { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }, [grid]);
  return <primitive object={grid} />;
}

/** ホログラム（半透明の面と輪郭の線）。アニメーション再生中だけゆっくり回る。 */
export function Hologram({ spec, accent }: { spec: ObjectSpec; accent: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current && useAnimation.getState().playing) ref.current.rotation.y += dt * 0.5;
  });
  const geo = useMemo(() => {
    switch (spec.shape) {
      case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      case 'sphere': return new THREE.SphereGeometry(1, 24, 16);
      case 'cone': return new THREE.ConeGeometry(0.5, 1, 24);
      default: return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [spec.shape]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group ref={ref} position={spec.position} scale={spec.size}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={accent} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** HDRI（手続き生成の環境光）。スタジオ調の部屋の環境マップを、その場で作る。外部の画像は使わない。 */
function Hdri() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGLRenderer;
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    invalidate();
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); invalidate(); };
  }, [gl, scene, invalidate]);
  return null;
}

export function Cinematic({ preset, quality, gridSize }: { preset: IndustryPreset; quality: Quality; gridSize: number }) {
  const gl = useThree((s) => s.gl) as unknown as { isWebGLRenderer?: boolean };
  const setEffects = useView3D((s) => s.setEffects);
  const isWebGL = gl.isWebGLRenderer === true;
  const profile = QUALITY_PROFILES[quality];
  const bloom = isWebGL && profile.bloom;
  const dof = isWebGL && profile.dof;
  useEffect(() => {
    setEffects({ bloom, dof, hdri: isWebGL, grid: true, hologram: true });
    return () => setEffects({ bloom: false, dof: false, hdri: false, grid: false, hologram: false });
  }, [setEffects, bloom, dof, isWebGL]);
  return (
    <>
      <HoloGrid size={gridSize} color={preset.accent} />
      {isWebGL && <Hdri />}
      {(bloom || dof) && <PostFx bloom={bloom} dof={dof} />}
    </>
  );
}
