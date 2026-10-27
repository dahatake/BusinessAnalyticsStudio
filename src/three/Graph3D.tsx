// ナレッジグラフの 3D 表示（FR-037）。節の種別を色・形（ジオメトリ）で、関係の種別を線種・太さ・粒子で区別する。
// 3D の基盤（DiagramCanvas）を使い、モデルは手続きで作る（FR-068）。節を押すと共通の選択に反映する。
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { EDGE_STYLE, KIND_STYLE, to3D } from '../analysis/graphView';
import type { GraphEdge, GraphNode } from '../selection/graph';
import { useAnimation } from '../store/animation';
import { DiagramCanvas } from './DiagramCanvas';
import { sceneLabelStyle } from './labelStyles';
import { useT } from '../i18n';

const labelStyle = sceneLabelStyle;

/** 関係（relation）の線の上を流れる粒子 */
function Particles({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const playing = useAnimation((s) => s.playing);
  useFrame((state) => {
    const m = ref.current;
    if (!m || !playing) return;
    const t = (state.clock.elapsedTime * 0.4) % 1;
    m.position.set(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
  });
  return (
    <mesh ref={ref} position={from}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color="#4fc3f7" />
    </mesh>
  );
}

export interface Graph3DProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  pos: (id: string) => { x: number; y: number };
  size: { width: number; height: number };
  selected: ReadonlySet<string>;
  onSelect: (id: string, additive: boolean) => void;
}

export function Graph3D({ nodes, edges, pos, size, selected, onSelect }: Graph3DProps) {
  const t3 = useT();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const p3 = (id: string): [number, number, number] => {
    const n = byId.get(id);
    return n ? to3D(pos(id), n.kind, size) : [0, 0, 0];
  };
  return (
    <DiagramCanvas label={t3('ナレッジグラフ（3D）。ドラッグで回転、ホイールで拡大縮小')}>
      {edges.map((e) => {
        const st = EDGE_STYLE[e.kind];
        const a = p3(e.from);
        const b = p3(e.to);
        return (
          <group key={e.id}>
            <Line points={[a, b]} color={selected.has(e.from) || selected.has(e.to) ? '#4fc3f7' : '#9aa5b1'} lineWidth={st.width} dashed={st.dash !== ''} dashSize={0.25} gapSize={0.15} />
            {st.particles ? <Particles from={a} to={b} /> : null}
          </group>
        );
      })}
      {nodes.map((n) => {
        const st = KIND_STYLE[n.kind];
        const on = selected.has(n.id);
        return (
          <group key={n.id} position={p3(n.id)}>
            <mesh onClick={(ev) => { ev.stopPropagation(); onSelect(n.id, ev.ctrlKey || ev.metaKey || ev.shiftKey); }} scale={on ? 1.4 : 1}>
              {st.geometry === 'sphere' && <sphereGeometry args={[0.22, 20, 14]} />}
              {st.geometry === 'box' && <boxGeometry args={[0.36, 0.36, 0.36]} />}
              {st.geometry === 'octahedron' && <octahedronGeometry args={[0.26]} />}
              {st.geometry === 'cone' && <coneGeometry args={[0.22, 0.4, 20]} />}
              {st.geometry === 'cylinder' && <cylinderGeometry args={[0.2, 0.2, 0.36, 20]} />}
              {st.geometry === 'torus' && <torusGeometry args={[0.2, 0.08, 12, 24]} />}
              {st.geometry === 'dodecahedron' && <dodecahedronGeometry args={[0.24]} />}
              {st.geometry === 'icosahedron' && <icosahedronGeometry args={[0.24]} />}
              {st.geometry === 'tetrahedron' && <tetrahedronGeometry args={[0.28]} />}
              <meshStandardMaterial color={st.hex} emissive={on ? st.hex : '#000000'} emissiveIntensity={on ? 0.6 : 0} />
            </mesh>
            <Html center position={[0, 0.42, 0]} zIndexRange={[5, 0]}><span style={labelStyle} title={n.label}>{n.label}</span></Html>
          </group>
        );
      })}
    </DiagramCanvas>
  );
}
