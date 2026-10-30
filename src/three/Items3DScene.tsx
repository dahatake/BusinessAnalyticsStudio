// 項目を 3D 空間に描く共通の面の中身（FR-217 AC-501）。位置・大きさ・つながりを、既存の 3D 基盤（DiagramCanvas。FR-065 の描画・フォールバック・FR-147 の負荷対策）の上に置く。
// Items3DSurface が必要になったときにだけ読み込む（最初のフレームの速さのため。three を 2D の表示の読み込みに含めない）。
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { AnimatedLine } from './AnimatedLine';
import { DiagramCanvas } from './DiagramCanvas';
import { sceneLabelStyle } from './labelStyles';
import { toSpace, type Axes3D, type Item3D, type Link3D } from '../view/items3d';
import { useObjectVectorTransition, useSceneMotionAllowed } from './useSceneTransition';
import { usePresenceItems, useTweenedValue } from '../motion/usePresence';
import { DURATION, EASING, scaledDuration } from '../motion/fluent';
import { useMotionProfile } from '../motion/useMotion';

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
  // 出入り（FR-070 AC-086）: 削除された項目は縮んで消えるまで残す。値の補間は three 側が行い、React は撤去の時刻だけ更新する
  const nodeItems = usePresenceItems(items, (i) => i.id, (i) => pos.get(i.id) ?? [0, 0, 0], { perFrame: false });
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
        return <AnimatedLine key={`${l.from}>${l.to}`} points={[a, b]} color={on ? '#4fc3f7' : '#9aa5b1'} lineWidth={on ? 2.5 : 1.2} />;
      })}
      {nodeItems.map(({ item, vec, exiting }) => (
        <ItemNode key={item.id} item={item} position={exiting ? [vec[0]!, vec[1]!, vec[2]!] : pos.get(item.id) as [number, number, number]} color={PALETTE[groups.indexOf(item.group ?? '') % PALETTE.length] ?? PALETTE[0]!} selected={!exiting && selected.has(item.id)} exiting={exiting} showLabel={!exiting && (showAll || selected.has(item.id))} heavy={heavy} onSelect={onSelect} />
      ))}
    </DiagramCanvas>
  );
}


function ItemNode({ item, position, color, selected, exiting, showLabel, heavy, onSelect }: {
  item: Item3D;
  position: [number, number, number];
  color: string;
  selected: boolean;
  exiting: boolean;
  showLabel: boolean;
  heavy: boolean;
  onSelect: (id: string, additive: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const radius = 0.14 + item.size * 0.5;
  const scale = exiting ? 0 : radius * (selected ? 1.4 : 1);
  // 値の遷移（FR-070 AC-086）: value があれば、ラベルの数値は中間値を経て最新へ収束する（停止中・動きの軽減中は即時）
  const tweened = useTweenedValue(item.value ?? 0);
  const labelText = item.value !== undefined && item.valueText ? item.valueText(tweened) : item.label;
  useObjectVectorTransition(group, position, 'position');
  useObjectVectorTransition(mesh, [scale, scale, scale], 'scale');
  return (
    <group ref={group}>
      <mesh ref={mesh} onClick={exiting ? undefined : (ev) => { ev.stopPropagation(); onSelect(item.id, ev.ctrlKey || ev.metaKey || ev.shiftKey); }}>
        <sphereGeometry args={[1, heavy ? 6 : 16, heavy ? 4 : 12]} />
        <meshStandardMaterial color={color} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? 0.6 : 0} />
      </mesh>
      {showLabel ? <Html center position={[0, radius + 0.25, 0]} zIndexRange={[5, 0]}><FadeLabel title={item.label} entityId={exiting ? undefined : item.id}>{labelText}</FadeLabel></Html> : null}
    </group>
  );
}

// 追加された項目のラベルは、動きが許可されるとき、現れる遷移（不透明度）を経て表示する（FR-070 AC-086）。停止中・動きの軽減中は即時。
function FadeLabel({ title, entityId, children }: { title: string; entityId: string | undefined; children: React.ReactNode }) {
  const allowed = useSceneMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const [entered, setEntered] = useState(!allowed);
  useEffect(() => {
    if (entered) return undefined;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setEntered(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [entered]);
  return (
    <span style={{ ...sceneLabelStyle, opacity: entered ? 1 : 0, transition: allowed ? `opacity ${scaledDuration(DURATION.gentle, tempo, allowed)}ms ${EASING.decelerateMid}` : undefined }} title={title} data-entity-id={entityId}>{children}</span>
  );
}