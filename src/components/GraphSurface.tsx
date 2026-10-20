// Graph の表現（FR-238）の共通の描画部品。ノードと、意味ラベル付きの向き付きのエッジで描く平面の図。
// ビジネス関係グラフ・Twin ビュー・空間ビュー・データビュアー・課題-解決策分析・KPI/OKR が、同じ部品で Graph を描く。
// 配置は src/graphmodel の layoutGraph（決定的）。ノードは HTML、エッジは SVG（矢印つき）。DOM の契約は tests/system/CONTRACT.md §23。
// NFR-A11Y-010: ノードの種別は色だけでなく形（clip-path）と文字、エッジの種類は線種と文字、各エッジの名前は「A から B へ 意味ラベル」。
// キーボード: 矢印キーで隣接するノードへ移動、Enter で開く（onOpen）、Space で選択。ドラッグの代わりに、画面の拡大・縮小のボタンがある。
import { useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { NODE_H, NODE_W, layoutGraph, shapeAssignment, type Pt } from '../graphmodel';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { MIN_TARGET_PX } from '../theme/tokens';
import { clipOf } from './graphShape';

export interface GraphNodeIn {
  id: string;
  name: string;
  /** 種別の名前（形と文字で示す） */
  kind: string;
  /** 種別の表示名（省略は kind。kind は data-kind に出す識別子） */
  kindLabel?: string;
  /** 配置のまとまり（省略は種別） */
  cluster?: string;
  /** 名称の下に添える短い文字（KPI の値と段階など） */
  note?: string;
}

export interface GraphEdgeIn {
  id: string;
  from: string;
  to: string;
  /** 意味ラベル（なければ線だけ） */
  label?: string;
  /** 意味の種類（data-meaning）。省略は 'link' */
  meaning?: string;
  /** 線種（SVG の stroke-dasharray。省略は実線） */
  dash?: string;
}

const useStyles = makeStyles({
  scroll: { overflow: 'auto', maxHeight: '70vh', borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  canvas: { position: 'relative' },
  node: {
    position: 'absolute', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', rowGap: tokens.spacingVerticalXXS, overflow: 'hidden',
    cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase100, minHeight: `${MIN_TARGET_PX}px`, outlineOffset: '2px',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  nodeOn: { border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  marker: { width: '14px', height: '14px', backgroundColor: tokens.colorBrandForeground1, display: 'inline-block', flexShrink: 0 },
  name: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, fontWeight: tokens.fontWeightSemibold },
  edgeText: { fontSize: tokens.fontSizeBase200, fill: tokens.colorNeutralForeground1, paintOrder: 'stroke', stroke: tokens.colorNeutralBackground1, strokeWidth: '3px' },
});

export interface GraphSurfaceProps {
  origin: string;
  /** 面の名前（スクリーンリーダー向け） */
  label: string;
  nodes: readonly GraphNodeIn[];
  edges: readonly GraphEdgeIn[];
  /** ノードを開く（Enter・ダブルクリック）。省略は選ぶだけ */
  onOpen?: (id: string) => void;
}

function edgePoint(c: Pt, to: Pt, pad = 0): Pt {
  const dx = to.x - c.x; const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = (NODE_W / 2 + pad) / Math.abs(dx || 1e-9); const sy = (NODE_H / 2 + pad) / Math.abs(dy || 1e-9);
  const t = Math.min(sx, sy, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export function GraphSurface({ origin, label, nodes, edges, onOpen }: GraphSurfaceProps) {
  const s = useStyles();
  const bind = useEntityBinding(origin);
  const { selectedIds, select } = useSelection();
  const wrap = useRef<HTMLDivElement>(null);
  const visited = useRef(new Map<string, string[]>());

  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const nameOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.name])), [nodes]);
  const okEdges = useMemo(() => edges.filter((e) => ids.has(e.from) && ids.has(e.to)), [edges, ids]);
  const shapes = useMemo(() => shapeAssignment(nodes.map((n) => n.kind)), [nodes]);
  const pos = useMemo(
    () => layoutGraph(nodes.map((n) => ({ id: n.id, cluster: n.cluster ?? n.kind })), okEdges.map((e) => ({ from: e.from, to: e.to })), 80, nodes.length > 40 ? 1 : 3),
    [nodes, okEdges],
  );
  const size = useMemo(() => {
    let w = 400; let h = 240;
    for (const p of pos.values()) { w = Math.max(w, p.x + NODE_W); h = Math.max(h, p.y + NODE_H + 24); }
    return { w, h };
  }, [pos]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const neighbors = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of okEdges) {
      if (!m.has(e.from)) m.set(e.from, []);
      if (!m.has(e.to)) m.set(e.to, []);
      if (!m.get(e.from)!.includes(e.to)) m.get(e.from)!.push(e.to);
      if (!m.get(e.to)!.includes(e.from)) m.get(e.to)!.push(e.from);
    }
    for (const v of m.values()) v.sort();
    return m;
  }, [okEdges]);

  const focusNode = (id: string): void => {
    [...(wrap.current?.querySelectorAll<HTMLElement>('[data-testid="graph-node"]') ?? [])].find((el) => el.getAttribute('data-entity-id') === id)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLElement>, id: string): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') { e.preventDefault(); select(id, { origin }); onOpen?.(id); return; }
    if (e.key === ' ') { e.preventDefault(); select(id, { origin, additive: e.ctrlKey || e.metaKey || e.shiftKey }); return; }
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!fwd && !back) return;
    e.preventDefault();
    // 隣接するノードへ。戻るキーは、たどってきた道を戻る（なければ前の隣接ノード）
    const list = neighbors.get(id) ?? [];
    if (list.length === 0) return;
    const hist = visited.current.get(id) ?? [];
    if (back && hist.length > 0) { const prev = hist.pop()!; visited.current.set(id, hist); focusNode(prev); return; }
    const last = hist.length > 0 ? list.indexOf(hist[hist.length - 1]!) : -1;
    const next = list[(fwd ? last + 1 : list.length - 1) % list.length]!;
    visited.current.set(id, [...hist, next]);
    focusNode(next);
  };

  if (nodes.length === 0) return <Text role="status">Graph に表示する項目がありません。</Text>;
  return (
    <div ref={wrap} className={s.scroll} data-zoom-surface="graph" data-graph-nodes={nodes.length} data-graph-edges={okEdges.length}>
      <div className={s.canvas} style={{ width: size.w, height: size.h }} data-testid="graph-canvas">
        <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }} role="group" aria-label={`${label}（Graph）の関係の線`}>
          <defs>
            <marker id={`gs-arrow-${origin}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          <g style={{ color: tokens.colorNeutralForeground2 }}>
            {okEdges.map((e) => {
              const a = pos.get(e.from); const b = pos.get(e.to);
              if (!a || !b) return null;
              const p1 = edgePoint(a, b, 2); const p2 = edgePoint(b, a, 6);
              const name = `${nameOf.get(e.from)} から ${nameOf.get(e.to)} へ ${e.label ?? '（ラベルなし）'}`;
              return (
                <g key={e.id} data-testid="graph-edge" data-from={e.from} data-to={e.to} data-meaning={e.meaning ?? 'link'} data-direction="forward" role="img" aria-label={name}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeWidth={1.5} strokeDasharray={e.dash} markerEnd={`url(#gs-arrow-${origin})`} />
                  {e.label ? <text className={s.edgeText} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} textAnchor="middle">{e.label}</text> : null}
                </g>
              );
            })}
          </g>
        </svg>
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const shape = shapes.get(n.kind) ?? 'circle';
          const on = selected.has(n.id);
          const st: CSSProperties = { left: p.x - NODE_W / 2, top: p.y - NODE_H / 2, width: NODE_W, height: NODE_H };
          return (
            <div
              key={n.id} {...bind(n.id)} role="button" tabIndex={0} className={`${s.node} ${on ? s.nodeOn : ''}`} style={st}
              data-testid="graph-node" data-zoom-node="" data-kind={n.kind} data-node-type={n.kind} data-shape={shape} data-entity-name={n.name}
              aria-pressed={on} aria-label={`${n.name}（${n.kindLabel ?? n.kind}）${n.note ? `、${n.note}` : ''}`}
              onDoubleClick={() => { select(n.id, { origin }); onOpen?.(n.id); }} onKeyDown={(e) => onKey(e, n.id)}
            >
              <span className={s.marker} aria-hidden style={{ clipPath: clipOf(shape) }} />
              <span>{n.kindLabel ?? n.kind}</span>
              <span className={s.name} title={n.name}>{n.name}</span>
              {n.note ? <span>{n.note}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
