// Twin ビュー（FR-239）。現実世界（Devices・People・Spaces）とデジタル世界の三つの層（Operations・Experience・Insights）を、
// Data（現実→デジタル）・Control（デジタル→現実）の流れで結んだ図。2D は層を面にした概念図、3D は現実世界の面とデジタル世界の面を重ねた空間（共通の 3D の面 Items3DSurface）。
// 項目を選ぶと、ツイン関係（FR-214）と流れで結ばれた項目・流れが、共通の選択（useEntityBinding）で他の画面と連動して強調される。
// Control は図に示すだけで、このアプリは実機・外部システムへ何も送信しない（C-01。AC-569）。値は顧客パックの静的な値（鮮度を示す）。
// Graph の表現（FR-238）は、表示形式の共通の仕組み（FR-238）の担当。
import { useMemo, useRef, useState } from 'react';
import { Badge, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { ViewAsTableButton } from '../components/ViewTable';
import { GraphSurface, type GraphEdgeIn, type GraphNodeIn } from '../components/GraphSurface';
import { GraphScope } from '../components/GraphViewport';
import { GraphAlt } from '../components/GraphAlt';
import { ZoomBar, ZoomClusters, ZoomDetail, clampDepth, useZoomRootAttrs } from '../semanticzoom';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { useSelectionStore } from '../store/selection';
import { Items3DSurface } from '../three/Items3DSurface';
import {
  CONTROL_NOTE, FLOW_TEXT, FRESHNESS_NOTE, LAYER_LABELS, REAL_GROUP_LABELS, buildTwinModel, flowTouches,
  type TwinEntityInput, type TwinFlow, type TwinFlowInput, type TwinItem, type TwinModel,
} from '../twin/model';
import { spread, type Item3D, type Link3D } from '../view/items3d';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { MIN_TARGET_PX } from '../theme/tokens';

const ORIGIN = 'twin-view';
/** 要素の段の数 D（全体 → 要素 → 詳細 の 3 階層。FR-237） */
const ELEMENT_DEPTH = 1;
/** 項目の塊（全体の階層）。現実世界は Devices・People・Spaces、デジタル世界は層 */
const clusterOfItem = (i: TwinItem): string => (i.world === 'real' ? REAL_GROUP_LABELS[i.group ?? 'others'] : LAYER_LABELS[i.layer]);

const useStyles = makeStyles({
  notes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalXS },
  board: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr)', columnGap: tokens.spacingHorizontalL, alignItems: 'start' },
  boardOne: { gridTemplateColumns: 'minmax(0, 1fr)' },
  world: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2,
  },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  list: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, listStyleType: 'none', margin: 0, padding: 0 },
  item: {
    minHeight: `${MIN_TARGET_PX}px`, minWidth: `${MIN_TARGET_PX}px`, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, cursor: 'pointer', textAlign: 'left',
    color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  layer: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} dotted ${tokens.colorNeutralStroke2}` },
  flows: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, listStyleType: 'none', margin: 0, padding: 0 },
  flow: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1,
  },
  // 線種（Data は実線、Control は破線）。向きは文字の矢印でも示すので、色だけに頼らない
  solid: { borderLeft: `${tokens.strokeWidthThickest} solid ${tokens.colorBrandStroke1}` },
  dashed: { borderLeft: `${tokens.strokeWidthThickest} dashed ${tokens.colorPaletteMarigoldForeground2}` },
  flowOn: { backgroundColor: tokens.colorBrandBackground2, outline: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  flowDim: { opacity: 0.55 },
});

function ItemButton({ item, selectedFlag, onOpen }: { item: TwinItem; selectedFlag: boolean; onOpen: (id: string) => void }) {
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const props = bind(item.id);
  return (
    <button
      type="button" {...props} className={mergeClasses(s.item, hl(props['data-highlight']))} aria-pressed={selectedFlag}
      aria-label={`${item.name}（${item.world === 'real' ? '現実世界' : 'デジタル世界'}）`}
      onDoubleClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); onOpen(item.id); return; }
        onEntityKey(e, item.id, ORIGIN);
      }}
    >
      {item.name}
    </button>
  );
}

function FlowRow({ flow, nameOf, ids }: { flow: TwinFlow; nameOf: (id: string) => string; ids: ReadonlySet<string> }) {
  const s = useStyles();
  const t = FLOW_TEXT[flow.kind];
  const on = ids.size > 0 && flowTouches(flow, ids);
  return (
    <li
      data-testid="twin-flow" data-flow-id={flow.id} data-flow-kind={flow.kind} data-from={flow.from} data-to={flow.to} data-line-style={t.lineStyle}
      data-highlight={on ? 'related' : undefined} aria-label={`${t.name}の流れ ${nameOf(flow.from)} から ${nameOf(flow.to)}（${flow.label}、${flow.count} 件）`}
      className={mergeClasses(s.flow, t.lineStyle === 'solid' ? s.solid : s.dashed, on && s.flowOn, ids.size > 0 && !on && s.flowDim)}
    >
      <Badge appearance="outline" size="large">{t.name} {t.arrow}</Badge>
      <Text weight="semibold">{flow.label || '（ラベルなし）'}</Text>
      <Text>{flow.count} 件</Text>
      <Text size={200}>{nameOf(flow.from)} → {nameOf(flow.to)}（{t.direction}）</Text>
    </li>
  );
}

/** 3D: 現実世界の面（下）とデジタル世界の面（上）を重ね、層ごとに奥行きを分ける。つながり=流れ */
function items3dOf(model: TwinModel): Item3D[] {
  const out: Item3D[] = [];
  model.realByGroup.forEach((g, gi) => g.items.forEach((i, k) => {
    out.push({ id: i.id, label: i.name, group: REAL_GROUP_LABELS[g.group], x: spread(k, g.items.length), y: 0.1, z: spread(gi, model.realByGroup.length), size: 0.35 });
  }));
  model.layers.forEach((l, li) => l.items.forEach((i, k) => {
    out.push({ id: i.id, label: i.name, group: LAYER_LABELS[l.layer], x: spread(k, l.items.length), y: 0.9, z: spread(li, model.layers.length), size: 0.35 });
  }));
  return out;
}

/** 顧客パックの出典の取得日のうち最も新しいもの（項目・流れが参照する出典のうち）。なければ undefined */
function freshnessOf(entities: ReadonlyArray<{ id: string; world?: string; sourceIds?: readonly string[] }>, flowSources: readonly string[], sources: ReadonlyArray<{ id: string; retrievedAt?: string }>): string | undefined {
  const used = new Set<string>(flowSources);
  for (const e of entities) if (e.world === 'real' || e.world === 'digital') for (const id of e.sourceIds ?? []) used.add(id);
  const dates = sources.filter((x) => used.has(x.id) && typeof x.retrievedAt === 'string').map((x) => x.retrievedAt as string).sort();
  return dates[dates.length - 1];
}

export function TwinViewScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const view = useComponentView(ORIGIN);
  const { graph, selectedIds, related } = useSelection();
  const [asTable, setAsTable] = useState(false);
  const [depth, setDepth] = useState(1);
  const [focusCluster, setFocusCluster] = useState<string | undefined>();
  const [detailId, setDetailId] = useState<string | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  useZoomRootAttrs(rootRef, 'component-twin-view', depth, ELEMENT_DEPTH);
  const data = state.status === 'ready' ? state.pack.data : null;

  const model = useMemo(
    () => buildTwinModel((data?.entities.entities ?? []) as unknown as TwinEntityInput[], data?.entities.flows as unknown as TwinFlowInput[] | undefined, view.world),
    [data, view.world],
  );
  const twinLinks = useMemo(() => {
    if (!graph || view.world !== 'both') return [];
    const shown = new Set(model.itemIds);
    return graph.edges.filter((e) => e.kind === 'twin' && shown.has(e.from) && shown.has(e.to)).map((e) => [e.from, e.to] as const);
  }, [graph, model, view.world]);
  usePublishViewItems(ORIGIN, model.itemIds, twinLinks);

  const names = useMemo(() => new Map([...model.real, ...model.digital].map((i) => [i.id, i.name])), [model]);
  const items3d = useMemo(() => items3dOf(model), [model]);
  const links3d = useMemo<Link3D[]>(() => model.flows.map((f) => ({ from: f.from, to: f.to })), [model]);
  const highlighted = useMemo(() => new Set(selectedIds.length > 0 ? [...(related ?? [])] : []), [selectedIds, related]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const fresh = useMemo(() => {
    if (!data) return undefined;
    const flowSrc = ((data.entities.flows ?? []) as Array<{ sourceIds?: string[] }>).flatMap((f) => f.sourceIds ?? []);
    return freshnessOf(data.entities.entities as never, flowSrc, data.sources.sources as never);
  }, [data]);

  const allItems = useMemo(() => [...model.real, ...model.digital], [model]);
  const clusters = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of allItems) m.set(clusterOfItem(i), (m.get(clusterOfItem(i)) ?? 0) + 1);
    return [...m].map(([name, count]) => ({ name, count }));
  }, [allItems]);
  // Graph（FR-238）: 項目をノードに、Data・Control の流れとツイン関係を意味ラベル付きの向き付きのエッジにする（2D・3D と同じ項目・同じ流れ）
  const graphNodes = useMemo<GraphNodeIn[]>(() => allItems.map((i) => {
    const c = clusterOfItem(i);
    return { id: i.id, name: i.name, kind: c, kindLabel: c.split('（')[0], cluster: i.world };
  }), [allItems]);
  const graphEdges = useMemo<GraphEdgeIn[]>(() => [
    ...model.flows.map((f) => ({ id: f.id, from: f.from, to: f.to, label: `${FLOW_TEXT[f.kind].name} ${f.label || ''} ${f.count} 件`.replace(/\s+/g, ' ').trim(), meaning: f.kind, dash: FLOW_TEXT[f.kind].lineStyle === 'dashed' ? '6 4' : undefined })),
    ...twinLinks.map(([a, b]) => ({ id: `twin:${a}>${b}`, from: a, to: b, label: 'ツイン', meaning: 'twin', dash: '2 3' })),
  ], [model, twinLinks]);

  if (!data) return <LoadingView label="Twin ビューを読み込み中" />;
  const hasControl = model.flows.some((f) => f.kind === 'control');
  const showReal = view.world !== 'digital';
  const showDigital = view.world !== 'real';
  const is3d = view.mode === '3d';
  const isGraph = view.mode === 'graph';
  const goDepth = (d: number): void => {
    const k = clampDepth(d, ELEMENT_DEPTH);
    if (k === 0) setFocusCluster(undefined);
    if (k === 2) {
      const target = detailId && names.has(detailId) ? detailId : (selectedIds.find((id) => names.has(id)) ?? allItems[0]?.id);
      if (!target) return;
      setDetailId(target);
      if (!selected.has(target)) useSelectionStore.getState().select(target, { origin: ORIGIN });
    }
    setDepth(k);
  };
  const openItem = (id: string): void => { useSelectionStore.getState().select(id, { origin: ORIGIN }); setDetailId(id); setDepth(2); };
  const openCluster = (name: string): void => { setFocusCluster(name); setDepth(1); };
  const detailItem = detailId ? allItems.find((i) => i.id === detailId) : undefined;
  const nameOf = (id: string): string => names.get(id) ?? id;

  const realColumn = showReal ? (
    <section className={s.world} data-testid="twin-world-real" aria-label="現実世界">
      <Text weight="semibold">現実世界</Text>
      {model.realByGroup.length === 0 ? <Text size={200}>現実世界の項目はありません。</Text> : null}
      {model.realByGroup.map((g) => (
        <div key={g.group} className={s.group} data-testid={`twin-group-${g.group}`}>
          <Text size={200} weight="semibold">{REAL_GROUP_LABELS[g.group]}</Text>
          <ul className={s.list}>{g.items.map((i) => <li key={i.id}><ItemButton item={i} selectedFlag={selected.has(i.id)} onOpen={openItem} /></li>)}</ul>
        </div>
      ))}
    </section>
  ) : null;

  const digitalColumn = showDigital ? (
    <section className={s.world} data-testid="twin-world-digital" aria-label="デジタル世界">
      <Text weight="semibold">デジタル世界</Text>
      {model.layers.map((l) => (
        <div key={l.layer} className={s.layer} data-testid={`twin-layer-${l.layer}`}>
          <Text size={200} weight="semibold">{LAYER_LABELS[l.layer]}</Text>
          {l.items.length === 0 ? <Text size={200}>この層の項目はありません。</Text> : (
            <ul className={s.list}>{l.items.map((i) => <li key={i.id}><ItemButton item={i} selectedFlag={selected.has(i.id)} onOpen={openItem} /></li>)}</ul>
          )}
        </div>
      ))}
    </section>
  ) : null;

  const flowList = view.world === 'both' ? (
    <section aria-label="流れ" data-testid="twin-flows">
      <Text block weight="semibold">流れ（Data: 現実世界→デジタル世界、Control: デジタル世界→現実世界）</Text>
      {model.flows.length === 0 ? <Text size={200} block>この顧客パックには、現実世界とデジタル世界を結ぶ流れがありません。</Text> : (
        <ul className={s.flows}>{model.flows.map((f) => <FlowRow key={`${f.kind}:${f.from}:${f.to}`} flow={f} nameOf={nameOf} ids={highlighted} />)}</ul>
      )}
    </section>
  ) : null;

  const surf3d = is3d && !asTable;
  const detailRel = detailItem
    ? [
      ...model.flows.filter((f) => f.from === detailItem.id || f.to === detailItem.id).map((f) => `${FLOW_TEXT[f.kind].name}: ${nameOf(f.from)} から ${nameOf(f.to)} へ ${f.label || '（ラベルなし）'}（${f.count} 件）`),
      ...twinLinks.filter(([a, b]) => a === detailItem.id || b === detailItem.id).map(([a, b]) => `ツイン: ${nameOf(a)} と ${nameOf(b)}`),
    ]
    : [];
  const detailSources = detailItem
    ? ((data.entities.entities as unknown as Array<{ id: string; sourceIds?: string[] }>).find((e) => e.id === detailItem.id)?.sourceIds ?? [])
    : [];

  return (
    <Panel
      testId="component-twin-view"
      title="Twin ビュー"
      description="現実世界の設備・人・拠点と、デジタル世界の三つの層（Operations・Experience・Insights）を、Data と Control の流れで結んで見ます。"
      maxWidth="1200px"
    >
      <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM }}>
        <div className={s.notes}>
          <Badge appearance="tint" color="informative" data-testid="twin-freshness">{FRESHNESS_NOTE}{fresh ? ` 出典の取得日: ${fresh}` : ' 取得日の記載なし'}</Badge>
          {hasControl || view.world === 'both' ? <Badge appearance="tint" color="warning" data-testid="twin-control-note">Control: {CONTROL_NOTE}</Badge> : null}
          {is3d ? <ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} /> : null}
        </div>
        {model.itemIds.length === 0 ? (
          <EmptyView message="Twin ビューに表示する項目がありません（エンティティに世界区分（現実世界・デジタル世界）が必要です）。" />
        ) : (
          <>
            <ZoomBar label="Twin ビュー" depth={depth} elementDepth={ELEMENT_DEPTH} onGo={goDepth} elementLabels={focusCluster ? [focusCluster] : []} detailLabel={detailItem?.name} />
            {surf3d ? (
              <Items3DSurface viewKey={ORIGIN} origin={ORIGIN} label="Twin ビュー（現実世界の面とデジタル世界の面）" items={items3d} links={links3d} axes={{ y: '下: 現実世界／上: デジタル世界', z: '層' }} />
            ) : null}
            <GraphScope active={isGraph} origin={ORIGIN} label="Twin ビュー">
              {depth === 0 ? <ZoomClusters clusters={clusters} onOpen={openCluster} /> : null}
              {depth === 1 && isGraph ? <GraphSurface origin={ORIGIN} label="Twin ビュー" nodes={graphNodes} edges={graphEdges} onOpen={openItem} zoomControls="external" /> : null}
              {depth === 1 && !surf3d && !isGraph ? (
                <div className={mergeClasses(s.board, !(showReal && showDigital) && s.boardOne)} data-testid="twin-board">
                  {realColumn}
                  {view.world === 'both' ? flowList : null}
                  {digitalColumn}
                </div>
              ) : null}
              {depth === 2 && detailItem ? (
                <ZoomDetail
                  item={{
                    id: detailItem.id, name: detailItem.name,
                    attributes: [['種別', clusterOfItem(detailItem)], ['世界', detailItem.world === 'real' ? '現実世界' : 'デジタル世界'], ['ID', detailItem.id]],
                    sources: detailSources, relations: detailRel,
                  }}
                />
              ) : null}
            </GraphScope>
            {depth === 1 && (surf3d || isGraph) ? flowList : null}
            {surf3d || isGraph ? (
              <GraphAlt
                origin={ORIGIN} label="Twin ビュー" columns={['世界']}
                nodes={allItems.map((i) => ({ id: i.id, name: i.name, kind: clusterOfItem(i), values: [i.world === 'real' ? '現実世界' : 'デジタル世界'] }))}
                relations={graphEdges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }))}
                summary={`現実世界 ${model.real.length} 件、デジタル世界 ${model.digital.length} 件（${model.layers.filter((l) => l.layer !== 'none').map((l) => `${l.layer} ${l.items.length}`).join('、')}）`}
              />
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
