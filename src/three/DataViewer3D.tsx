// データビュアーの 3D 表示（FR-169）。3D の図の枠（DiagramCanvas）の上に、塊・エンティティ・列を手続きで描く（FR-068）。
// 倍率はカメラの距離に対応させ、詳細度（鳥観図／エンティティ／列）に応じてラベルの内容を替える。ラベルは DOM（drei の Html）で、
// 2D と同じ属性（data-viewer-entity・data-viewer-column・aria-selected）と操作（クリック・Enter）を持つ。
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { DiagramCanvas } from './DiagramCanvas';
import { DETAIL_LABELS, fitDistance, type DetailLevel, type ViewerCluster, type ViewerLayout } from '../datacatalog/viewer';
import { highlightOf, lineStyleOf, type relatedOf, type ViewerRelation } from '../datacatalog/relations';
import { NO_COLUMNS_LABEL } from '../datacatalog/model';

const card = {
  background: 'rgba(255,255,255,0.95)', color: '#111', border: '2px solid #5b6b7b', borderRadius: 6, padding: '4px 8px', minWidth: 110, maxWidth: 200,
  fontSize: 12, textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
} as const;
const cardOn = { ...card, border: '3px solid #0f6cbd', background: '#ffffff' } as const;

function CameraDriver({ zoom, focus, extent }: { zoom: number; focus: [number, number, number]; extent: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const d = fitDistance(extent) / zoom;
    camera.position.set(focus[0] + d * 0.35, focus[1] + d * 0.8, focus[2] + d * 0.6);
    camera.lookAt(focus[0], focus[1], focus[2]);
    if (controls) { controls.target.set(focus[0], focus[1], focus[2]); controls.update(); }
    invalidate();
  }, [camera, controls, invalidate, zoom, focus[0], focus[1], focus[2], extent]);
  return null;
}

export interface DataViewer3DProps {
  clusters: readonly ViewerCluster[];
  layout: ViewerLayout;
  level: DetailLevel;
  zoom: number;
  selectedKey: string | null;
  activeCluster: string | null;
  onSelect: (key: string) => void;
  onCluster: (name: string) => void;
  /** FR-170: 関連（①の線を描く）と、選択に関連する対象（強調・減光） */
  relations?: readonly ViewerRelation[];
  related?: ReturnType<typeof relatedOf>;
  /** FR-171: 簡略表示のとき、詳細（ラベル）を出す対象。null は全件 */
  detailKeys?: ReadonlySet<string> | null;
}

export function DataViewer3D({ clusters, layout, level, zoom, selectedKey, activeCluster, onSelect, onCluster, relations = [], related = null, detailKeys = null }: DataViewer3DProps) {
  const pos = useMemo(() => new Map(layout.entities.map((p) => [p.key, p])), [layout]);
  const sel = selectedKey ? pos.get(selectedKey) : undefined;
  const focus: [number, number, number] = sel ? [sel.x, 0, sel.z] : [0, 0, 0];
  // ①の線（エンティティ間）。簡略表示では選択に関わるものだけ描く。線の種類は線種（実線）とラベルで示す（色だけに頼らない）
  const lines = useMemo(() => relations.filter((r) => r.kind === 'entity' && (!detailKeys || (related?.relations.includes(r) ?? false))), [relations, detailKeys, related]);
  return (
    <DiagramCanvas label={`データビュアー（3D）。詳細度は ${DETAIL_LABELS[level]}。ホイール・ピンチ・ボタン・キーで拡大縮小できます`} cameraPosition={[6, 12, 10]}>
      <CameraDriver zoom={zoom} focus={focus} extent={layout.extent} />
      {lines.map((r) => {
        const a = pos.get(r.entityKeys[0]!); const b = pos.get(r.entityKeys[1]!);
        if (!a || !b) return null;
        const hot = !related || related.relations.includes(r);
        return (
          <group key={r.id} data-relation-line={r.id}>
            <Line points={[[a.x, 0.3, a.z], [b.x, 0.3, b.z]]} color={hot ? '#0f6cbd' : '#8a8a8a'} lineWidth={hot ? 3 : 1} transparent opacity={hot ? 1 : 0.3} />
            {hot && level !== 'bird' ? (
              <Html center position={[(a.x + b.x) / 2, 0.5, (a.z + b.z) / 2]} zIndexRange={[4, 0]}>
                <div style={{ background: '#fff', color: '#111', border: '1px solid #5b6b7b', borderRadius: 4, padding: '0 4px', fontSize: 11 }} data-relation-label={r.label}>{lineStyleOf(r).label}: {r.label}</div>
              </Html>
            ) : null}
          </group>
        );
      })}
      {layout.clusters.map((c) => (
        <group key={`c:${c.name}`} position={[c.x, 0, c.z]}>
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[c.w - 0.3, 0.12, c.d - 0.3]} />
            <meshStandardMaterial color={activeCluster === c.name ? '#7fb3e6' : '#9aa8b8'} />
          </mesh>
          {level === 'bird' ? (
            <Html center position={[0, 0.3, 0]} zIndexRange={[5, 0]}>
              <div
                role="option" aria-selected={activeCluster === c.name} tabIndex={-1} data-viewer-cluster={c.name} style={activeCluster === c.name ? cardOn : card}
                onClick={() => onCluster(c.name)}
              >
                <strong>{c.name}</strong><div>{clusters.find((k) => k.name === c.name)?.entities.length ?? 0} 件</div>
              </div>
            </Html>
          ) : null}
        </group>
      ))}
      {clusters.flatMap((c) => c.entities).map((e) => {
        const p = pos.get(e.key);
        if (!p) return null;
        const on = e.key === selectedKey;
        const h = highlightOf(related, e.key, selectedKey);
        const dim = h === 'dimmed';
        const showLabel = level !== 'bird' && (!detailKeys || detailKeys.has(e.key));
        return (
          <group key={e.key} position={[p.x, 0, p.z]}>
            <mesh position={[0, 0.25, 0]} scale={on ? 1.25 : 1} onClick={(ev) => { ev.stopPropagation(); onSelect(e.key); }}>
              <boxGeometry args={[0.9, 0.5, 0.9]} />
              <meshStandardMaterial color={on || h === 'related' ? '#0f6cbd' : '#5b8bb5'} emissive={on ? '#0f6cbd' : '#000000'} emissiveIntensity={on ? 0.5 : 0} transparent={dim} opacity={dim ? 0.3 : 1} />
            </mesh>
            {showLabel ? (
              <Html center position={[0, 0.9, 0]} zIndexRange={[5, 0]}>
                <div
                  role="option" aria-selected={on} tabIndex={-1} data-viewer-entity={e.name} data-highlight={h} style={{ ...(on ? cardOn : card), ...(dim ? { opacity: 0.4 } : {}), ...(h === 'related' ? { borderStyle: 'dashed' } : {}) }}
                  onClick={() => onSelect(e.key)}
                >
                  <strong>{on ? `${e.name}（選択中）` : h === 'related' ? `${e.name}（関連）` : e.name}</strong>
                  <div style={{ fontSize: 11 }}>{e.description}</div>
                  {level === 'column' ? (
                    e.columns.length === 0
                      ? <div data-viewer-nocolumns>{NO_COLUMNS_LABEL}</div>
                      : <ul style={{ margin: '2px 0 0', paddingLeft: 14 }}>{e.columns.map((col, i) => <li key={i} data-viewer-column={col.name}>{col.name}{col.type ? `（${col.type}）` : ''}</li>)}</ul>
                  ) : null}
                </div>
              </Html>
            ) : null}
          </group>
        );
      })}
    </DiagramCanvas>
  );
}
