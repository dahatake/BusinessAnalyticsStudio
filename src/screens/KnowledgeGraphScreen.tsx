// ナレッジグラフ（2D/3D。FR-037）。ノードの種別を色・形・アイコンで、エッジの関係種別を線種・太さ・粒子で区別する。
// ホップ数（PARAM-014: 1〜3）・種別フィルター・検索・ノード/エッジの編集ができる。選択は共通のストア（useEntityBinding）で他のビューと連動する。
import { useEffect, useMemo, useRef, useState, type RefObject, type SVGProps } from 'react';
import { useT } from '../i18n';
import {
  Badge, Button, Checkbox, DialogActions, DialogBody, DialogContent, DialogTitle, Dropdown, Field, Input, Option, Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { Add24Regular, Delete24Regular, Link24Regular } from '@fluentui/react-icons';
import { ADDABLE_KINDS, addEdge, addNode, removeEdge, removeNode, type AddableKind } from '../analysis/graphEdit';
import {
  EDGE_STYLE, HOP_DEFAULT, HOP_MAX, HOP_MIN, KIND_FILTER_LABEL, KIND_STYLE, clampHop, layoutGraph, shapePath, visibleNodeIds,
} from '../analysis/graphView';
import { KIND_ICON } from '../analysis/kindIcons';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { Panel } from '../components/Panel';
import { RelatedMini } from '../components/RelatedMini';
import { EmptyView, LoadingView } from '../components/StateViews';
import { ViewAsTableButton, ViewTable } from '../components/ViewTable';
import { KIND_LABELS, NODE_KINDS, type GraphEdge, type GraphNode, type NodeKind } from '../selection/graph';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { lifeOpacity, lifeScale, usePresenceItems } from '../motion';
import { useAnimation } from '../store/animation';
import { useEditStore } from '../store/edit';
import { usePackStore } from '../store/pack';
import { registerTestHook } from '../testing/hook';
import { MIN_TARGET_PX } from '../theme/tokens';
import { Graph3D } from '../three/Graph3D';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { ModeRadio } from '../view/ModeRadio';
import { isShownInWorld } from '../view/viewModel';

const ORIGIN = 'knowledge-graph';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  hop: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  range: { width: '160px', height: '24px', accentColor: tokens.colorBrandBackground, cursor: 'pointer' },
  filters: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  svg: { width: '100%', height: 'auto', maxHeight: '70vh', minHeight: '320px', flexShrink: 0, display: 'block', backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium },
  node: { cursor: 'pointer', outline: 'none', ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  nodeLabel: {
    width: '92px', height: '34px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200, color: tokens.colorNeutralForeground1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflowWrap: 'anywhere', pointerEvents: 'none',
  },
  shape: { strokeWidth: 2 },
  edge: { stroke: tokens.colorNeutralStroke1, fill: 'none' },
  edgeOn: { stroke: tokens.colorBrandStroke1 },
  edgeSel: { stroke: tokens.colorPaletteRedForeground1 },
  legend: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS },
});

type Pt = { x: number; y: number };
type SvgHandlers = Pick<SVGProps<SVGGElement>, 'onClick' | 'onMouseEnter' | 'onMouseLeave'>;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * 節の当たり判定の大きさ（図の座標）。図が縮小して描かれても、画面上で幅・高さとも {PARAM-040}（24px）以上にする（NFR-A11Y-009 AC-485）。
 * 既定は節の絵とラベルを覆う 92×78。
 */
function useNodeHitSize(ref: RefObject<SVGSVGElement | null>, size: { width: number; height: number }): { w: number; h: number } {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setScale(Math.min(r.width / size.width, r.height / size.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, size.width, size.height]);
  const min = MIN_TARGET_PX / Math.max(scale, 0.01);
  return { w: Math.max(92, min), h: Math.max(78, min) };
}

interface ViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  pos: (id: string) => Pt;
  size: { width: number; height: number };
  selected: ReadonlySet<string>;
  related: ReadonlySet<string> | null;
  matches: ReadonlySet<string>;
  edgeSel: string | undefined;
  onEdge: (e: GraphEdge) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  editable: boolean;
}

function Graph2D({ nodes, edges, pos, size, selected, related, matches, edgeSel, onEdge, onMove, editable }: ViewProps) {
  const t = useT();
  const s = useStyles();
  const bind = useEntityBinding(ORIGIN);
  const playing = useAnimation((st) => st.playing);
  const reduced = useReducedMotion();
  const animate = playing && !reduced;
  const svgRef = useRef<SVGSVGElement>(null);
  const hit = useNodeHitSize(svgRef, size);
  // 出入り・遷移（FR-070 AC-086）: 同じ ID の節・辺は動き、追加は現れ、削除は薄れて消える。停止中・動きの軽減中は即時に最終状態
  const nodeItems = usePresenceItems(nodes, (n) => n.id, (n) => { const p = pos(n.id); return [p.x, p.y]; });
  const edgeItems = usePresenceItems(edges, (e) => e.id, (e) => { const a = pos(e.from); const b = pos(e.to); return [a.x, a.y, b.x, b.y]; });
  return (
    <svg ref={svgRef} data-zoom-surface="graph" viewBox={`0 0 ${size.width} ${size.height}`} className={s.svg} role="group" aria-label={t('ナレッジグラフ（2D）')}>
      {edgeItems.map(({ item: e, vec, life, exiting }) => {
        const st = EDGE_STYLE[e.kind];
        const on = selected.has(e.from) || selected.has(e.to);
        const d = `M${vec[0]},${vec[1]} L${vec[2]},${vec[3]}`;
        return (
          <g key={e.id} opacity={lifeOpacity(life)} pointerEvents={exiting ? 'none' : undefined} aria-hidden={exiting || undefined}>
            <path
              d={d} className={mergeClasses(s.edge, on && s.edgeOn, edgeSel === e.id && s.edgeSel)}
              strokeWidth={edgeSel === e.id ? st.width + 2 : st.width} strokeDasharray={st.dash || undefined}
              data-edge-kind={e.kind}
            />
            {/* 当たり判定（細い線を押しやすくする）。編集モードのときだけ押せる */}
            {editable ? (
              <path
                d={d} stroke="transparent" strokeWidth={12} fill="none" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
                aria-label={t('エッジ: {from} → {to}（{state}）', { from: e.from, to: e.to, state: st.label })}
                onClick={() => onEdge(e)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEdge(e); } }}
              />
            ) : null}
            {st.particles && animate && !exiting ? (
              <circle r={3} fill="var(--colorBrandForeground1)">
                <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
              </circle>
            ) : null}
          </g>
        );
      })}
      {nodeItems.map(({ item: n, vec, life, exiting }) => {
        const style = KIND_STYLE[n.kind];
        const Icon = KIND_ICON[style.icon];
        const props = bind(n.id);
        const words = (props['data-highlight'] ?? '').split(' ');
        const { onClick, onMouseEnter, onMouseLeave, ...rest } = props;
        const handlers = (exiting ? {} : { onClick, onMouseEnter, onMouseLeave }) as unknown as SvgHandlers;
        const base = related && !related.has(n.id) && !words.includes('selected') ? 0.55 : 1;
        return (
          <g
            key={n.id} {...rest} {...handlers} transform={`translate(${vec[0]},${vec[1]}) scale(${lifeScale(life)})`} className={s.node}
            role="button" tabIndex={exiting ? -1 : 0} aria-label={`${KIND_LABELS[n.kind]}: ${n.label}`} aria-pressed={words.includes('selected')}
            aria-hidden={exiting || undefined} pointerEvents={exiting ? 'none' : undefined} data-exiting={exiting || undefined}
            opacity={base * lifeOpacity(life)}
            onKeyDown={(e) => {
              if (e.altKey && e.key.startsWith('Arrow')) {
                e.preventDefault();
                onMove(n.id, e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0, e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0);
                return;
              }
              onEntityKey(e as never, n.id, ORIGIN);
            }}
          >
            {/* 出入りの拡大縮小（lifeScale）の途中でも、画面上の当たり判定が 24px を下回らないよう、節の拡大率で割って大きくする */}
            <rect x={-hit.w / 2 / lifeScale(life)} y={15 - hit.h / 2 / lifeScale(life)} width={hit.w / lifeScale(life)} height={hit.h / lifeScale(life)} fill="transparent" />
            <path
              d={shapePath(style.shape)} className={s.shape} fill={style.color} fillOpacity={words.includes('selected') ? 0.55 : 0.22} stroke={style.color}
              strokeWidth={words.includes('selected') ? 5 : words.includes('related') || words.includes('hover') ? 3.5 : 2}
              strokeDasharray={words.includes('hover') ? '4 3' : undefined}
              data-shape={style.shape} data-icon={style.icon}
            />
            {matches.has(n.id) ? <circle r={26} fill="none" stroke="var(--colorPaletteYellowForeground2)" strokeWidth={3} strokeDasharray="3 3" /> : null}
            <Icon x={-8} y={-8} width={16} height={16} aria-hidden fill={style.color} />
            <foreignObject x={-46} y={22} width={92} height={34}>
              <div className={s.nodeLabel}>{n.label}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function NodeDialog({ open, nodes, defaultLink, onClose, onAdd }: {
  open: boolean; nodes: readonly GraphNode[]; defaultLink?: string; onClose: () => void; onAdd: (kind: AddableKind, name: string, linkTo?: string) => string | null;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AddableKind>('issue');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(''); setKind('issue'); setError(null); } }, [open]);
  const kindLabel = ADDABLE_KINDS.find((k) => k.kind === kind)?.label ?? '';
  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('ノードを追加')}</DialogTitle>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM }}>
            <Field label={t('名前')} required><Input value={name} onChange={(_, d) => setName(d.value)} /></Field>
            <Field label={t('種別')}>
              <Dropdown value={kindLabel} selectedOptions={[kind]} onOptionSelect={(_, d) => { if (d.optionValue) setKind(d.optionValue as AddableKind); }}>
                {ADDABLE_KINDS.map((k) => <Option key={k.kind} value={k.kind}>{k.label}</Option>)}
              </Dropdown>
            </Field>
            {kind === 'solution' ? <Text size={200}>{t('解決策は、選択中の課題（なければ最初の課題）に紐づきます。')}{defaultLink ? '' : ''}</Text> : null}
            {error ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text> : null}
            <Text size={200} aria-hidden>{t('追加先のパック内の項目数:')} {nodes.length}</Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('キャンセル')}</Button>
            <Button appearance="primary" onClick={() => { const r = onAdd(kind, name, defaultLink); if (r) setError(r); else onClose(); }}>{t('追加')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function EdgeDialog({ open, nodes, onClose, onAdd }: {
  open: boolean; nodes: readonly GraphNode[]; onClose: () => void; onAdd: (from: string, to: string) => string | null;
}) {
  const t = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setFrom(''); setTo(''); setError(null); } }, [open]);
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? '';
  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('エッジを追加')}</DialogTitle>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM }}>
            <Field label={t('始点')}>
              <Dropdown value={labelOf(from)} selectedOptions={from ? [from] : []} onOptionSelect={(_, d) => setFrom(d.optionValue ?? '')} placeholder={t('始点のノードを選ぶ')}>
                {nodes.map((n) => <Option key={n.id} value={n.id} text={n.label}>{n.label}</Option>)}
              </Dropdown>
            </Field>
            <Field label={t('終点')}>
              <Dropdown value={labelOf(to)} selectedOptions={to ? [to] : []} onOptionSelect={(_, d) => setTo(d.optionValue ?? '')} placeholder={t('終点のノードを選ぶ')}>
                {nodes.map((n) => <Option key={n.id} value={n.id} text={n.label}>{n.label}</Option>)}
              </Dropdown>
            </Field>
            {error ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('キャンセル')}</Button>
            <Button appearance="primary" onClick={() => { const r = onAdd(from, to); if (r) setError(r); else onClose(); }}>{t('追加')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function KnowledgeGraphScreen() {
  const t = useT();
  const s = useStyles();
  const bind = useEntityBinding(ORIGIN);
  const state = usePackStore((st) => st.state);
  const editEnabled = useEditStore((st) => st.editMode);
  const { graph, selectedIds, primaryId, related, select } = useSelection();

  // 2D/3D と世界の表示は、見出しの「ビュー」と同じ状態（FR-217・FR-218。この画面の「表示」の切替も同じ状態を変える）
  const cv = useComponentView(ORIGIN);
  const view = cv.mode;
  const worldView = cv.world;
  const [hop, setHop] = useState(HOP_DEFAULT);
  const [hidden, setHidden] = useState<ReadonlySet<NodeKind>>(new Set());
  const [query, setQuery] = useState('');
  const [asTable, setAsTable] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const [edgeSelId, setEdgeSelId] = useState<string | undefined>();
  const [nodeDialog, setNodeDialog] = useState(false);
  const [edgeDialog, setEdgeDialog] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; run: () => string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const centers = useMemo(() => selectedIds.filter((id) => graph?.has(id)), [selectedIds, graph]);
  const visibleIds = useMemo(() => {
    if (!graph) return new Set<string>();
    const ids = visibleNodeIds(graph, { centers, hop, hiddenKinds: hidden });
    // 世界の表示（FR-218）: 選んだ世界の項目だけ。「両方」は区分なしを含めてすべて
    return worldView === 'both' ? ids : new Set([...ids].filter((id) => isShownInWorld(graph.node(id)?.world, worldView)));
  }, [graph, centers, hop, hidden, worldView]);
  const nodes = useMemo(() => (graph ? graph.nodes.filter((n) => visibleIds.has(n.id)) : []), [graph, visibleIds]);
  const edges = useMemo(() => (graph ? graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)) : []), [graph, visibleIds]);
  const layout = useMemo(() => layoutGraph(nodes, edges, centers), [nodes, edges, centers]);
  // 表示中の項目とツイン関係の線（t.view.state。ツイン関係は twin の辺として線で描く）
  const shownIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const twinLinks = useMemo(() => edges.filter((e) => e.kind === 'twin').map((e) => [e.from, e.to] as const), [edges]);
  usePublishViewItems(ORIGIN, shownIds, twinLinks);
  const pos = (id: string): Pt => {
    const base = layout.positions.get(id) ?? { x: 0, y: 0 };
    const o = offsets[id];
    return o ? { x: base.x + o.x, y: base.y + o.y } : base;
  };
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(q === '' || !graph ? [] : graph.nodes.filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, graph]);
  const kindsPresent = useMemo(() => NODE_KINDS.filter((k) => graph?.nodes.some((n) => n.kind === k)), [graph]);
  const edgeSel = graph?.edges.find((e) => e.id === edgeSelId);

  // テスト用フック（画面に見える状態を読む。CONTRACT.md §6）
  const latest = useRef({ graph, visibleIds, pos, selectedIds });
  latest.current = { graph, visibleIds, pos, selectedIds };
  useEffect(() => registerTestHook('graph', {
    allEdges: () => (latest.current.graph?.edges ?? []).map((e) => [e.from, e.to]),
    nodes: () => (latest.current.graph?.nodes ?? []).map((n) => {
      const v = latest.current.visibleIds.has(n.id);
      const st = KIND_STYLE[n.kind];
      const p = v ? latest.current.pos(n.id) : { x: 0, y: 0 };
      return { id: n.id, type: n.kind, color: st.color, shape: st.shape, icon: st.icon, visible: v, selected: latest.current.selectedIds.includes(n.id), x: Math.round(p.x), y: Math.round(p.y) };
    }),
  }), []);

  if (state.status !== 'ready' || !graph) return <LoadingView label={t('ナレッジグラフを読み込み中')} />;

  const onMove = (id: string, dx: number, dy: number) => setOffsets((o) => ({ ...o, [id]: { x: (o[id]?.x ?? 0) + dx, y: (o[id]?.y ?? 0) + dy } }));
  const apply = (r: ReturnType<typeof addNode>): string | null => {
    if (!r.ok) return r.reason;
    // 編集は共通の編集ストア（編集モードの確認・元に戻す・変更履歴）を通す。すべてのビューへ即座に反映される
    const c = useEditStore.getState().commit({ ok: true, data: r.data, changes: r.changes });
    return c.ok ? null : c.message;
  };
  const data = state.pack.data;

  const doAddNode = (kind: AddableKind, name: string, linkTo?: string) => apply(addNode(data, kind, name, linkTo));
  const doAddEdge = (from: string, to: string) => apply(addEdge(data, from, to));
  const askDelete = () => {
    if (edgeSel) {
      setConfirm({ title: t('エッジ「{from} → {to}」', { from: edgeSel.from, to: edgeSel.to }), run: () => { const r = apply(removeEdge(data, edgeSel)); if (!r) setEdgeSelId(undefined); return r; } });
    } else if (primaryId) {
      const label = graph.node(primaryId)?.label ?? primaryId;
      setConfirm({ title: t('ノード「{label}」', { label }), run: () => apply(removeNode(data, primaryId)) });
    }
  };
  const canDelete = editEnabled && (edgeSel !== undefined || primaryId !== undefined);

  return (
    <Panel
      testId="component-knowledge-graph"
      title={t('ナレッジグラフ')}
      description={t('課題・解決策・製品・工程などのつながりを、2D と 3D で見ます。ノードを選ぶと、そのホップ数以内だけを表示します。')}
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="knowledge-graph" />

      <div className={s.toolbar} role="toolbar" aria-label={t('ナレッジグラフの操作')}>
        {/* 見出しの「ビュー」と同じ 1 つの切替（3D を描画できない環境では無効にし理由を示す。FR-217 AC-500・AC-507） */}
        <ModeRadio viewKey={ORIGIN} />
        <Field label={t('ホップ数（{min}〜{max}）', { min: HOP_MIN, max: HOP_MAX })}>
          <span className={s.hop}>
            <input
              type="range" className={s.range} aria-label={t('ホップ数')} min={HOP_MIN} max={HOP_MAX} step={1} value={hop}
              aria-valuemin={HOP_MIN} aria-valuemax={HOP_MAX} aria-valuenow={hop} aria-valuetext={t('{hop} ホップ', { hop })}
              onChange={(e) => setHop(clampHop(Number(e.target.value)))}
            />
            <Text>{hop}</Text>
          </span>
        </Field>
        <Field label={t('検索')}>
          <Input
            aria-label={t('ノードを検索')} placeholder={t('名前・ID')} value={query} onChange={(_, d) => setQuery(d.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { const first = [...matches][0]; if (first) select(first, { origin: ORIGIN }); } }}
          />
        </Field>
        {query.trim() !== '' ? <Badge appearance="tint" color="warning" role="status">{t('{n} 件一致', { n: matches.size })}</Badge> : null}
        <ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>

      <div className={s.filters} role="group" aria-label={t('種別フィルター')}>
        {kindsPresent.map((k) => (
          <Checkbox
            key={k} label={KIND_FILTER_LABEL[k]} checked={!hidden.has(k)}
            onChange={(_, d) => setHidden((h) => { const n = new Set(h); if (d.checked) n.delete(k); else n.add(k); return n; })}
          />
        ))}
      </div>

      <div className={s.toolbar} role="toolbar" aria-label={t('ノード・エッジの編集')}>
        <Button icon={<Add24Regular aria-hidden />} disabled={!editEnabled} onClick={() => setNodeDialog(true)}>{t('ノードを追加')}</Button>
        <Button icon={<Link24Regular aria-hidden />} disabled={!editEnabled} onClick={() => setEdgeDialog(true)}>{t('エッジを追加')}</Button>
        <Button icon={<Delete24Regular aria-hidden />} disabled={!canDelete} onClick={askDelete}>{t('削除')}</Button>
        {!editEnabled ? <Text size={200}>{t('編集モードを ON にすると、ノード・エッジを追加・削除できます。')}</Text> : null}
        {message ? <Text role="alert" size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{message}</Text> : null}
      </div>

      {nodes.length === 0 ? (
        <EmptyView message={t('表示するノードがありません。種別フィルターやホップ数を見直してください。')} />
      ) : asTable ? (
        <ViewTable
          label={t('ナレッジグラフのノード')}
          origin={ORIGIN}
          columns={[t('種別'), t('名称'), 'ID']}
          rows={nodes.map((n) => ({ id: n.id, cells: [KIND_LABELS[n.kind], n.label, n.id] }))}
        />
      ) : view === '2d' ? (
        <Graph2D
          nodes={nodes} edges={edges} pos={pos} size={layout} selected={new Set(selectedIds)} related={related} matches={matches}
          edgeSel={edgeSelId} onEdge={(e) => setEdgeSelId(e.id)} onMove={onMove} editable={editEnabled}
        />
      ) : (
        <Graph3D
          nodes={nodes} edges={edges} pos={pos} size={layout} selected={new Set(selectedIds)}
          onSelect={(id, additive) => select(id, { origin: ORIGIN, additive })}
        />
      )}

      <div className={s.legend} aria-label={t('凡例')}>
        <Text size={200} weight="semibold">{t('線:')} </Text>
        {(['ref', 'relation', 'contain', ...(twinLinks.length > 0 ? ['twin' as const] : [])] as const).map((k) => <Text key={k} size={200}>{EDGE_STYLE[k].label}</Text>)}
        <Text size={200}>{t('／ ノードの種別は色・形・アイコンで区別します。')}</Text>
      </div>

      <RelatedMini origin={ORIGIN} />

      <NodeDialog open={nodeDialog} nodes={graph.nodes} defaultLink={primaryId && graph.node(primaryId)?.kind === 'issue' ? primaryId : undefined} onClose={() => setNodeDialog(false)} onAdd={doAddNode} />
      <EdgeDialog open={edgeDialog} nodes={graph.nodes} onClose={() => setEdgeDialog(false)} onAdd={doAddEdge} />

      <Dialog modalType="alert" open={confirm !== null} onOpenChange={(_, d) => { if (!d.open) setConfirm(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('削除の確認')}</DialogTitle>
            <DialogContent>{t('{title} を削除します。ほかのビュー（表・課題-解決策分析など）からも消えます。', { title: confirm?.title ?? '' })}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirm(null)}>{t('キャンセル')}</Button>
              <Button appearance="primary" onClick={() => { const r = confirm?.run(); setMessage(r ?? null); setConfirm(null); }}>{t('削除する')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Panel>
  );
}

export { KnowledgeGraphScreen };
