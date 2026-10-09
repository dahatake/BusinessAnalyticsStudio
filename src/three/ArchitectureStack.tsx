// アーキテクチャのレイヤー積層図（3D。FR-040）。層ごとの板に要素を並べ、差分（追加・削除・変更）を色とラベルで示す。
// 3D の基盤（DiagramCanvas）を使い、モデルは手続きで作る（FR-068）。要素を押すと共通の選択に反映する。
import { Html, Line } from '@react-three/drei';
import { DIFF_LABEL, type ArchSection, type DiffKind, type DiffModel } from '../analysis/architecture';
import { DiagramCanvas } from './DiagramCanvas';

const DIFF_COLOR_3D: Record<DiffKind, string> = { same: '#8a8a8a', added: '#2ea043', removed: '#d1242f', changed: '#d4a72c' };
const labelStyle = {
  color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: '3px', fontSize: '11px', whiteSpace: 'nowrap', pointerEvents: 'none',
} as const;

export interface ArchitectureStackProps {
  sections: readonly ArchSection[];
  model: DiffModel;
  onSelect: (id: string) => void;
}

export function ArchitectureStack({ sections, model, onSelect }: ArchitectureStackProps) {
  const pos = new Map<string, [number, number, number]>();
  sections.forEach((sec, i) => sec.items.forEach((it, j) => pos.set(it.element.id, [(j - (sec.items.length - 1) / 2) * 1.7, i * 1.5, 0])));
  return (
    <DiagramCanvas label="アーキテクチャのレイヤー積層図（3D）。ドラッグで回転、ホイールで拡大縮小" cameraPosition={[0, sections.length * 0.8 + 2, 11]}>
      {sections.map((sec, i) => (
        <mesh key={sec.title} position={[0, i * 1.5 - 0.35, 0]}>
          <boxGeometry args={[Math.max(4, sec.items.length * 1.7 + 0.8), 0.12, 2]} />
          <meshStandardMaterial color="#334155" transparent opacity={0.8} />
        </mesh>
      ))}
      {sections.flatMap((sec) => sec.items.map((it) => (
        <group key={it.element.id} position={pos.get(it.element.id) ?? [0, 0, 0]}>
          <mesh onClick={(ev) => { ev.stopPropagation(); onSelect(it.element.id); }}>
            <boxGeometry args={[1.4, 0.6, 1.2]} />
            <meshStandardMaterial color={DIFF_COLOR_3D[it.diff]} />
          </mesh>
          <Html center position={[0, 0.55, 0]} zIndexRange={[5, 0]}>
            <span style={labelStyle}>{it.diff === 'same' ? '' : `【${DIFF_LABEL[it.diff]}】`}{it.element.name}</span>
          </Html>
        </group>
      )))}
      {model.links.map((l, i) => {
        const a = pos.get(l.from);
        const b = pos.get(l.to);
        return a && b ? <Line key={i} points={[a, b]} color={l.diff === 'removed' ? '#d1242f' : '#cbd5e1'} lineWidth={1.5} dashed={l.diff === 'removed'} /> : null;
      })}
    </DiagramCanvas>
  );
}
