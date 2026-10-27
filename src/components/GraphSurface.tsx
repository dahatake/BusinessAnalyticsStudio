// Graph の表現（FR-238）の共通の描画部品。ノードと、意味ラベル付きの向き付きのエッジで描く平面の図。
// ビジネス関係グラフ以外の Graph（Twin ビュー・空間ビュー・データビュアー・課題-解決策分析・KPI/OKR）が、同じ部品で Graph を描く。
// 配置は src/graphmodel の layoutGraph（決定的）。ノードは HTML、エッジは SVG（矢印つき）。DOM の契約は tests/system/CONTRACT.md §23・§25。
// NFR-A11Y-010: ノードの種別は色だけでなく形（clip-path）と文字、エッジの種類は線種と文字、各エッジの名前は「A から B へ 意味ラベル」。
// キーボード: 矢印キーで隣接するノードへ移動、Enter（ノード・エッジ）で詳細カードの開閉、Space で選択。Shift＋矢印キーは図のパン（GraphViewport）。
// FR-245〜248: 図はパン・拡大縮小・全画面にでき（GraphViewport）、ノード・エッジのクリックで詳細カード（再クリック・Esc で閉じる）、表の行から図のノードへ移動する。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { NODE_H, NODE_W, layoutGraph, shapeAssignment, type Pt } from '../graphmodel';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { registerLocalIds } from '../store/selection';
import { ZoomClusters } from '../semanticzoom/ZoomKit';
import { MIN_TARGET_PX } from '../theme/tokens';
import { clipOf } from './graphShape';
import { GraphViewport, useGraphViewport } from './GraphViewport';
import { GRAPH_CARD_RELATIONS_MAX } from './graphViewStore';
import { useT } from '../i18n';

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
  /** 詳細カードの属性（名前と値） */
  attributes?: ReadonlyArray<readonly [string, string]>;
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
  canvas: { position: 'relative' },
  node: {
    position: 'absolute', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', rowGap: tokens.spacingVerticalXXS, overflow: 'hidden',
    cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase100, minHeight: `${MIN_TARGET_PX}px`, outlineOffset: '2px',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  nodeOn: { border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  // FR-248: 表の行から移動した直後のノード。色だけでなく太い破線の枠でも示す
  nodeRow: { outline: `${tokens.strokeWidthThickest} dashed ${tokens.colorPaletteMarigoldBorder2}`, outlineOffset: '3px' },
  marker: { width: '14px', height: '14px', backgroundColor: tokens.colorBrandForeground1, display: 'inline-block', flexShrink: 0 },
  name: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, fontWeight: tokens.fontWeightSemibold },
  edgeText: { fontSize: tokens.fontSizeBase200, fill: tokens.colorNeutralForeground1, paintOrder: 'stroke', stroke: tokens.colorNeutralBackground1, strokeWidth: '3px' },
  edge: { cursor: 'pointer', ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  card: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, boxSizing: 'border-box', padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow8,
  },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: tokens.spacingHorizontalS },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalL },
  dl: { margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: tokens.spacingHorizontalS },
  dd: { margin: 0 },
});

export interface GraphSurfaceProps {
  origin: string;
  /** 面の名前（スクリーンリーダー向け） */
  label: string;
  nodes: readonly GraphNodeIn[];
  edges: readonly GraphEdgeIn[];
  /** ノードを開く（ダブルクリック）。省略は、自分でズームを持つ面ではズームイン */
  onOpen?: (id: string) => void;
  /** 'external': 拡大・縮小・全体表示に戻すのボタンが画面側にある（空間ビューなど。倍率だけ受ける）。省略は面が自分で持つ */
  zoomControls?: 'own' | 'external';
}

function edgePoint(c: Pt, to: Pt, pad = 0): Pt {
  const dx = to.x - c.x; const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = (NODE_W / 2 + pad) / Math.abs(dx || 1e-9); const sy = (NODE_H / 2 + pad) / Math.abs(dy || 1e-9);
  const t = Math.min(sx, sy, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

type Card = { kind: 'node' | 'edge'; id: string };

function GraphBody({ origin, label, nodes, edges, onOpen }: GraphSurfaceProps) {
  const s = useStyles();
  const t = useT();
  const vp = useGraphViewport()!;
  const bind = useEntityBinding(origin);
  const { selectedIds, select } = useSelection();
  const wrap = useRef<HTMLDivElement>(null);
  const visited = useRef(new Map<string, string[]>());
  const [card, setCard] = useState<Card | null>(null);
  const prevCard = useRef<Card | null>(null);

  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const nameOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.name])), [nodes]);
  const nodeOf = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
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
  const clusters = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) { const k = n.kindLabel ?? n.kind; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].map(([name, count]) => ({ name, count }));
  }, [nodes]);
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
  // 図の項目（KPI/OKR の Objective など、エンティティ関係グラフにないもの）も、この図が出ている間は選べる
  useEffect(() => registerLocalIds(nodes.map((n) => n.id)), [nodes]);
  const edgeText = (e: GraphEdgeIn): string => `${t('{from} から {to} へ', { from: String(nameOf.get(e.from)), to: String(nameOf.get(e.to)) })} ${e.label ?? t('（ラベルなし）')}`;

  // 詳細カード: 同じ項目の再クリック（Enter）で閉じ、別の項目で内容が替わる。Esc は GraphViewport が、カードを先に閉じる
  const toggle = (c: Card): void => setCard((cur) => (cur && cur.kind === c.kind && cur.id === c.id ? null : c));
  const closeRef = useRef<() => boolean>(() => false);
  closeRef.current = () => { if (!card) return false; setCard(null); return true; };
  useEffect(() => { vp.closerRef.current = () => closeRef.current(); return () => { vp.closerRef.current = null; }; }, [vp.closerRef]);
  // 階層が変わって対象の項目が図から消えたら閉じる
  useEffect(() => {
    if (card && ((card.kind === 'node' && !ids.has(card.id)) || (card.kind === 'edge' && !okEdges.some((e) => e.id === card.id)))) setCard(null);
  }, [card, ids, okEdges]);
  // 図を描いている間は、自然な大きさを面に知らせる（全体表示で全体が収まる倍率になる）
  const drawing = nodes.length > 0 && !(vp.standalone && vp.depth === 0);
  const { setContentSize } = vp;
  useLayoutEffect(() => {
    if (!drawing) return undefined;
    setContentSize({ w: size.w, h: size.h });
    return () => setContentSize(null);
  }, [drawing, size.w, size.h, setContentSize]);

  const focusNode = (id: string): void => {
    [...(wrap.current?.querySelectorAll<HTMLElement>('[data-testid="graph-node"]') ?? [])].find((el) => el.getAttribute('data-entity-id') === id)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLElement>, id: string): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') { e.preventDefault(); select(id, { origin }); toggle({ kind: 'node', id }); return; }
    if (e.key === ' ') { e.preventDefault(); select(id, { origin, additive: e.ctrlKey || e.metaKey || e.shiftKey }); return; }
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!fwd && !back) return;
    if (e.shiftKey) return; // Shift＋矢印キーは図のパン（GraphViewport）
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

  const renderCard = (): JSX.Element | null => {
    if (!card) return null;
    const close = <Button size="small" appearance="subtle" icon={<Dismiss20Regular />} aria-label={t('詳細カードを閉じる')} onClick={() => setCard(null)} />;
    if (card.kind === 'node') {
      const n = nodeOf.get(card.id);
      if (!n) return null;
      const rel = okEdges.filter((e) => e.from === n.id || e.to === n.id);
      const shown = rel.slice(0, GRAPH_CARD_RELATIONS_MAX);
      const attrs: Array<readonly [string, string]> = [['ID', n.id], ...(n.note ? [[t('補足'), n.note] as const] : []), ...(n.attributes ?? [])];
      return (
        <aside className={s.card} data-testid="detail-card" data-entity-id={n.id} aria-label={t('{name}の詳細', { name: n.name })}>
          <div className={s.cardHead}><Text weight="semibold" size={400}>{n.name}</Text>{close}</div>
          <Text as="h4" weight="semibold">{t('種別')}</Text>
          <Text>{n.kindLabel ?? n.kind}</Text>
          <Text as="h4" weight="semibold">{t('属性')}</Text>
          <dl className={s.dl}>{attrs.map(([k, v]) => (<div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd className={s.dd}>{v}</dd></div>))}</dl>
          <Text as="h4" weight="semibold">{t('主要な関係')}</Text>
          {rel.length === 0 ? <Text>{t('関係なし')}</Text> : <ul className={s.list}>{shown.map((e) => <li key={e.id} data-testid="card-relation">{edgeText(e)}</li>)}</ul>}
          {rel.length > shown.length ? <Text>{t('ほか {n} 件', { n: rel.length - shown.length })}</Text> : null}
        </aside>
      );
    }
    const e = okEdges.find((x) => x.id === card.id);
    if (!e) return null;
    return (
      <aside className={s.card} data-testid="detail-card" data-edge-id={e.id} aria-label={t('関係の詳細')}>
        <div className={s.cardHead}><Text weight="semibold" size={400}>{edgeText(e)}</Text>{close}</div>
        <Text as="h4" weight="semibold">{t('種別')}</Text>
        <Text>{e.meaning ?? 'link'}</Text>
        <Text as="h4" weight="semibold">{t('属性')}</Text>
        <dl className={s.dl}>
          <dt>{t('意味ラベル')}</dt><dd className={s.dd}>{e.label ?? t('（ラベルなし）')}</dd>
          <dt>{t('線種')}</dt><dd className={s.dd}>{e.dash ? t('破線・点線') : t('実線')}</dd>
          <dt>{t('起点')}</dt><dd className={s.dd}>{nameOf.get(e.from)}</dd>
          <dt>{t('終点')}</dt><dd className={s.dd}>{nameOf.get(e.to)}</dd>
        </dl>
      </aside>
    );
  };

  if (nodes.length === 0) return <Text role="status">{t('Graph に表示する項目がありません。')}</Text>;
  // 自分でズームを持つ面の「全体」の階層は、塊（種別ごとの件数）で示す（FR-237 と同じ。ダブルクリックか Enter で要素へ）
  // 全体の階層では塊を示し、ノードの面は隠す（DOM には残す。表の行からの移動で、要素の階層へ切り替えてから動かせる）
  const showClusters = vp.standalone && vp.depth === 0;
  return (
    <>
    {showClusters ? (
      <div style={{ padding: tokens.spacingHorizontalM }}>
        <ZoomClusters clusters={clusters} onOpen={() => vp.setDepth(1)} />
      </div>
    ) : null}
    <div ref={wrap} className={s.canvas} style={{ width: size.w, height: size.h, display: showClusters ? 'none' : undefined }} data-testid="graph-canvas" data-graph-nodes={nodes.length} data-graph-edges={okEdges.length}>
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} role="group" aria-label={t('{label}（Graph）の関係の線', { label })}>
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
            const open = card?.kind === 'edge' && card.id === e.id;
            return (
              <g
                key={e.id} className={s.edge} data-testid="graph-edge" data-edge-id={e.id} data-from={e.from} data-to={e.to} data-meaning={e.meaning ?? 'link'} data-direction="forward"
                role="button" tabIndex={0} aria-pressed={open} aria-label={edgeText(e)} style={{ pointerEvents: 'none' }}
                onClick={(ev) => { ev.stopPropagation(); toggle({ kind: 'edge', id: e.id }); }}
                onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); toggle({ kind: 'edge', id: e.id }); } }}
              >
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeWidth={open ? 3.5 : 1.5} strokeDasharray={e.dash} markerEnd={`url(#gs-arrow-${origin})`} />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke' }} />
                {e.label ? <text className={s.edgeText} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} textAnchor="middle" style={{ pointerEvents: 'all' }}>{e.label}</text> : null}
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
        const rowHl = vp.hl === n.id;
        const b = bind(n.id);
        return (
          <div
            key={n.id} {...b} role="button" tabIndex={0} className={`${s.node} ${on ? s.nodeOn : ''} ${rowHl ? s.nodeRow : ''}`} style={st}
            data-testid="graph-node" data-zoom-node="" data-kind={n.kind} data-node-type={n.kind} data-shape={shape} data-entity-name={n.name} data-row-highlight={rowHl ? 'true' : undefined}
            aria-pressed={on} aria-label={`${t('{name}（{kind}）', { name: n.name, kind: n.kindLabel ?? n.kind })}${n.note ? `${t('、')}${n.note}` : ''}`}
            onClick={(e) => { b.onClick?.(e); if (e.detail > 1) return; prevCard.current = card; toggle({ kind: 'node', id: n.id }); }}
            onDoubleClick={() => {
              // ダブルクリックはカードを開閉せずズームインする（最初のクリックで変えたカードを元に戻す）
              setCard(prevCard.current);
              select(n.id, { origin });
              if (onOpen) onOpen(n.id); else if (vp.standalone) vp.setDepth(Math.min(2, vp.depth + 1));
            }}
            onKeyDown={(e) => onKey(e, n.id)}
          >
            <span className={s.marker} aria-hidden style={{ clipPath: clipOf(shape) }} />
            <span>{n.kindLabel ?? n.kind}</span>
            <span className={s.name} title={n.name}>{n.name}</span>
            {n.note ? <span>{n.note}</span> : null}
          </div>
        );
      })}
      {vp.cardHost && card ? createPortal(renderCard(), vp.cardHost) : null}
    </div>
    </>
  );
}

export function GraphSurface(props: GraphSurfaceProps) {
  const outer = useGraphViewport();
  if (outer) return <GraphBody {...props} />;
  return (
    <GraphViewport origin={props.origin} label={props.label} standalone={props.zoomControls !== 'external'} attrs={{ 'data-graph-nodes': props.nodes.length, 'data-graph-edges': props.edges.length }}>
      <GraphBody {...props} />
    </GraphViewport>
  );
}
