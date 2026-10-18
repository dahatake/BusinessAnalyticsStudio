// 項目を 3D 空間に描く共通の面の中身（FR-217 AC-501）。位置・大きさ・つながりを、既存の 3D 基盤（DiagramCanvas。FR-065 の描画・フォールバック・FR-147 の負荷対策）の上に置く。
// Items3DSurface が必要になったときにだけ読み込む（最初のフレームの速さのため。three を 2D の表示の読み込みに含めない）。
import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { DiagramCanvas } from './DiagramCanvas';
import { sceneLabelStyle } from './labelStyles';
import { toSpace, type Axes3D, type Item3D, type Link3D } from '../view/items3d';

/** グループの色（色だけに頼らず、ラベルの文字と「表で見る」でも読める） */
const PALETTE = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#e57373', '#4db6ac', '#fff176', '#90a4ae'];

/** ラベルを全部出すと重なるので、項目が多いときは選択中のものだけに出す */
export const LABEL_LIMIT = 40;
/** これを超えると簡略表示（粗い球・つながりの上限） */
export const HEAVY_LIMIT = 200;
const LINK_LIMIT = 300;

export interface Items3DSceneProps {
  label: string;
  items: readonly Item3D[];
  links: readonly Link3D[];
  selected: ReadonlySet<string>;
  axes?: Axes3D;
  onSelect: (id: string, additive: boolean) => void;
}

function Axis({ at, text }: { at: [number, number, number]; text: string }) {
  return <Html center position={at} zIndexRange={[5, 0]}><span style={{ ...sceneLabelStyle, opacity: 0.85 }}>{text}</span></Html>;
}

export default function Items3DScene({ label, items, links, selected, axes, onSelect }: Items3DSceneProps) {
  const groups = useMemo(() => [...new Set(items.map((i) => i.group ?? ''))], [items]);
  const pos = useMemo(() => new Map(items.map((i) => [i.id, [toSpace(i.x), toSpace(i.y), toSpace(i.z)] as [number, number, number]])), [items]);
  const half = 5.4;
  const showAll = items.length <= LABEL_LIMIT;
  // 件数が多いときは球を粗い形にし、つながりの線も上限までにする（FR-147・FR-171 の負荷対策。選択中のつながりは常に描く）
  const heavy = items.length > HEAVY_LIMIT;
  const drawLinks = heavy ? links.filter((l, i) => i < LINK_LIMIT || selected.has(l.from) || selected.has(l.to)) : links;
  return (
    <DiagramCanvas label={label} cameraPosition={[9, 7, 11]}>
      <gridHelper args={[10, 10, '#607d8b', '#37474f']} position={[0, -5, 0]} />
      {axes?.x ? <Axis at={[half, -5, 0]} text={`${axes.x} →`} /> : null}
      {axes?.y ? <Axis at={[-half, half - 0.4, 0]} text={`↑ ${axes.y}`} /> : null}
      {axes?.z ? <Axis at={[0, -5, half]} text={`${axes.z} →`} /> : null}
      {drawLinks.map((l) => {
        const a = pos.get(l.from);
        const b = pos.get(l.to);
        if (!a || !b) return null;
        const on = selected.has(l.from) || selected.has(l.to);
        return <Line key={`${l.from}>${l.to}`} points={[a, b]} color={on ? '#4fc3f7' : '#9aa5b1'} lineWidth={on ? 2.5 : 1.2} />;
      })}
      {items.map((it) => {
        const on = selected.has(it.id);
        const p = pos.get(it.id) as [number, number, number];
        const r = 0.14 + it.size * 0.5;
        const color = PALETTE[groups.indexOf(it.group ?? '') % PALETTE.length];
        return (
          <group key={it.id} position={p}>
            <mesh onClick={(ev) => { ev.stopPropagation(); onSelect(it.id, ev.ctrlKey || ev.metaKey || ev.shiftKey); }} scale={on ? 1.4 : 1}>
              <sphereGeometry args={heavy ? [r, 6, 4] : [r, 16, 12]} />
              <meshStandardMaterial color={color} emissive={on ? color : '#000000'} emissiveIntensity={on ? 0.6 : 0} />
            </mesh>
            {showAll || on ? <Html center position={[0, r + 0.25, 0]} zIndexRange={[5, 0]}><span style={sceneLabelStyle} title={it.label}>{it.label}</span></Html> : null}
          </group>
        );
      })}
    </DiagramCanvas>
  );
}
