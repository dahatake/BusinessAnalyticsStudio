// 空間ビュー（FR-240）。拠点 → フロア → 部屋/設備 の空間階層に KPI を重ねる。意味的ズーム（FR-237。src/semanticzoom）で
// 全体 → 拠点 → フロア → 部屋/設備 → 詳細 の 5 階層をたどる。2D は階層ごとの一覧（平面の項目）、3D は建物を階ごとに積んだ等角投影（アイソメ図）。
// 3D は canvas ではなく SVG の等角投影で描くので、WebGL がなくても選べる（ガントチャートと同じ扱い）。選択はすべてのビューと共通（FR-024）。
// Graph の表現は、表示形式の共通の機構（FR-238）が担当する。
import { useEffect, useMemo, useRef, type KeyboardEvent, type SVGProps } from 'react';
import { tr, useT } from '../i18n';
import { lifeOpacity, usePresenceItems } from '../motion';
import { Button, Field, Select, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { useHighlightClass } from '../components/highlight';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { ZoomBreadcrumb, canZoomIn, canZoomOut, clampDepth, stepDepth, useZoomRootAttrs, zoomAttrs } from '../semanticzoom';
import { GraphSurface, type GraphEdgeIn, type GraphNodeIn } from '../components/GraphSurface';
import { GraphScope } from '../components/GraphViewport';
import { GraphAlt } from '../components/GraphAlt';
import {
  SPATIAL_ELEMENT_DEPTH, SPATIAL_KIND_LABELS, STAGE_GLYPHS, buildSpatialModel, buildingSite, detailTarget, isoProject, itemsAtDepth, kpiCell,
  type KpiCell, type RawEntity, type RawTwin, type SpatialModel, type SpatialNode,
} from '../spatial';
import { useSpatialView } from '../spatial/store';
import { KPI_STAGES, KPI_STAGE_LABELS, type KpiStage } from '../graphmodel';
import { usePackStore } from '../store/pack';
import { TWIN_RELATION_LABELS, type TwinRelation } from '../schema/world';
import { useComponentView, usePublishViewItems } from '../view/useView';

const ORIGIN = 'spatial-view';
/** 件数の表示。0 は「なし」と書く（0 件の表示にしない。FR-287 AC-750） */
const n0 = (n: number): string => (n === 0 ? tr('なし') : tr('{n} 件', { n }));
const D = SPATIAL_ELEMENT_DEPTH;
const DEPTH_OF_KIND = { site: 1, floor: 2, room: 3, equipment: 3 } as const;

const STAGE_FILL: Record<KpiStage, string> = {
  good: tokens.colorPaletteGreenBackground2,
  caution: tokens.colorPaletteYellowBackground2,
  action: tokens.colorPaletteRedBackground2,
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalS },
  zoomBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: tokens.spacingHorizontalM, margin: 0, padding: 0, listStyle: 'none' },
  card: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM, cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  cardSelected: { border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  kpi: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, fontWeight: tokens.fontWeightSemibold, paddingInline: tokens.spacingHorizontalS, borderRadius: tokens.borderRadiusSmall },
  cluster: { display: 'inline-flex', flexDirection: 'column', padding: tokens.spacingHorizontalL, borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer' },
  stage: { width: '100%', height: '460px', display: 'block', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  svgItem: { cursor: 'pointer', ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  legend: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS, margin: 0, padding: 0, listStyle: 'none' },
  detail: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalL, borderRadius: tokens.borderRadiusMedium, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS, margin: 0 },
});

/** 段階の色と、色に加える形・文字（FR-240 AC-573） */
function KpiBadge({ cell, className }: { cell: KpiCell; className: string }) {
  return (
    <span className={className} data-kpi-state={cell.state} data-kpi-stage={cell.stage} style={cell.stage ? { backgroundColor: STAGE_FILL[cell.stage], color: tokens.colorNeutralForeground1 } : undefined}>
      {cell.text}
    </span>
  );
}

export function SpatialScreen() {
  const t = useT();
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const { selectedIds, select } = useSelection();
  const packState = usePackStore((st) => st.state);
  const view = useComponentView(ORIGIN);
  const depth = useSpatialView((st) => st.depth);
  const kpiChoice = useSpatialView((st) => st.kpi);
  const { setDepth, setKpi, setProjection } = useSpatialView.getState();

  const model = useMemo<SpatialModel | null>(() => {
    if (packState.status !== 'ready') return null;
    const e = packState.pack.data.entities as unknown as { entities: RawEntity[]; twins?: RawTwin[] };
    return buildSpatialModel(e.entities, e.twins ?? []);
  }, [packState]);

  const mode = view.mode;
  // 3D の面は等角投影（正投影）のカメラ。テスト用フック t.scene.camera() に出す
  useEffect(() => {
    if (mode !== '3d') return undefined;
    setProjection('orthographic');
    return () => setProjection('perspective');
  }, [mode, setProjection]);

  const hasSpace = !!model && model.nodes.size > 0;
  const kpi = model && model.kpiNames.includes(kpiChoice ?? '') ? kpiChoice : model?.kpiNames[0];
  const d = clampDepth(depth, D);
  const rootRef = useRef<HTMLDivElement>(null);
  useZoomRootAttrs(rootRef, 'component-spatial-view', d, D);

  const items = useMemo(() => (model ? itemsAtDepth(model, d, selectedIds) : []), [model, d, selectedIds]);
  const building = model ? buildingSite(model, selectedIds) : undefined;
  const floors = useMemo(() => (model && building ? model.nodes.get(building)!.children.map((c) => model.nodes.get(c)!).filter((n) => n.kind === 'floor') : []), [model, building]);
  const roomsOf = (f: SpatialNode): SpatialNode[] => (model ? f.children.map((c) => model.nodes.get(c)!).filter((n) => n.kind === 'room' || n.kind === 'equipment') : []);
  const detail = model && d === D + 1 ? detailTarget(model, selectedIds) : undefined;

  // ツイン関係（FR-214）で空間の項目に結ばれたデジタル世界の項目（表す・計測する・記録する・表示する）。選択を保ったまま、空間の項目との結びつきを読めるようにする
  const twinItems = useMemo(() => {
    if (packState.status !== 'ready' || !model) return [] as Array<{ id: string; name: string; relation: string; of: string }>;
    const e = packState.pack.data.entities as unknown as { entities: RawEntity[]; twins?: RawTwin[] };
    const byId = new Map(e.entities.map((x) => [x.id, x]));
    const out = new Map<string, { id: string; name: string; relation: string; of: string }>();
    for (const t of e.twins ?? []) {
      const d = byId.get(t.digitalId);
      if (!d || !model.nodes.has(t.realId) || model.nodes.has(t.digitalId) || out.has(d.id)) continue;
      out.set(d.id, { id: d.id, name: d.name ?? d.id, relation: TWIN_RELATION_LABELS[t.relation as TwinRelation] ?? t.relation, of: model.nodes.get(t.realId)!.name });
    }
    return [...out.values()];
  }, [packState, model]);

  const shownIds = useMemo(() => {
    if (!model) return [] as string[];
    // 表示している項目: 建物の拠点・フロア・部屋/設備（2D・3D・Graph の三つの表現と、ズームの階層で変わらない。FR-238 AC-562）
    const ids: string[] = building ? [building] : [];
    for (const f of floors) { ids.push(f.id); for (const r of roomsOf(f)) ids.push(r.id); }
    for (const t of twinItems) ids.push(t.id);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, building, floors, twinItems]);
  usePublishViewItems(ORIGIN, shownIds);
  // 2D の一覧は、ID を保ったまま出入りする（FR-070 AC-086）。削除は薄れて消えるまで元の位置に残る
  const itemPresence = usePresenceItems(items, (n) => n.id, () => []);

  if (!model) return <LoadingView label={t('空間ビューを読み込み中')} />;

  const zoomTo = (n: number) => setDepth(n);
  // ダブルクリック・Enter: その項目を選び、一つ下の階層へ
  const zoomInto = (n: SpatialNode) => { select(n.id, { origin: ORIGIN }); setDepth(Math.min(DEPTH_OF_KIND[n.kind] + 1, D + 1)); };
  const onKey = (e: KeyboardEvent<Element>, n: SpatialNode) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') { e.preventDefault(); zoomInto(n); } else if (e.key === ' ') { e.preventDefault(); select(n.id, { origin: ORIGIN }); }
  };
  const elementLabels = [0, 1, 2].map((i) => {
    const kinds = ['site', 'floor', 'room'] as const;
    const sel = [...selectedIds].reverse().map((id) => model.nodes.get(id)).find((n) => n && DEPTH_OF_KIND[n.kind] === i + 1);
    return sel ? `${SPATIAL_KIND_LABELS[sel.kind]} ${sel.name}` : SPATIAL_KIND_LABELS[kinds[i]!];
  });
  const counts = { site: 0, floor: 0, room: 0 };
  for (const n of model.nodes.values()) counts[n.kind === 'equipment' ? 'room' : n.kind]++;

  // ---- 2D（階層ごとの一覧） ----
  const card = (n: SpatialNode, life = 1, exiting = false) => {
    if (exiting) {
      return (
        <li key={n.id} aria-hidden style={{ opacity: lifeOpacity(life), pointerEvents: 'none' }}>
          <div className={s.card}><Text weight="semibold">{n.name}</Text><Text size={200}>{SPATIAL_KIND_LABELS[n.kind]}</Text></div>
        </li>
      );
    }
    const props = bind(n.id, { interactive: false });
    const cell = kpiCell(model, n.id, kpi);
    const isSel = selectedIds.includes(n.id);
    return (
      <li key={n.id} style={life < 1 ? { opacity: lifeOpacity(life) } : undefined}>
        <div
          {...props}
          data-kind={n.kind}
          data-zoom-node=""
          data-entity-name={n.name}
          role="button"
          tabIndex={0}
          aria-pressed={isSel}
          aria-label={`${SPATIAL_KIND_LABELS[n.kind]} ${n.name}、${kpi ? `${kpi} ${cell.text}` : t('KPI なし')}`}
          className={mergeClasses(s.card, isSel ? s.cardSelected : undefined, hl(props['data-highlight']))}
          onClick={(e) => select(n.id, { origin: ORIGIN, additive: e.ctrlKey || e.metaKey || e.shiftKey })}
          onDoubleClick={() => zoomInto(n)}
          onKeyDown={(e) => onKey(e, n)}
        >
          <Text weight="semibold">{n.name}</Text>
          <Text size={200}>{SPATIAL_KIND_LABELS[n.kind]}</Text>
          {kpi ? <KpiBadge cell={cell} className={s.kpi} /> : null}
        </div>
      </li>
    );
  };

  // ---- 3D（等角投影の積み重ね） ----
  const W = 220; const DEP = 160; const GAP = 120; const THICK = 14;
  const pt = (x: number, y: number, z: number) => { const p = isoProject(x, y, z); return `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`; };
  const rhombus = (x: number, y: number, w: number, dd: number, z: number) => [pt(x, y, z), pt(x + w, y, z), pt(x + w, y + dd, z), pt(x, y + dd, z)].join(' ');
  const focusFloor = (() => {
    for (const id of [...selectedIds].reverse()) {
      for (let cur = model.nodes.get(id), i = 0; cur && i < 20; cur = cur.parentId ? model.nodes.get(cur.parentId) : undefined, i++) if (cur.kind === 'floor') return cur.id;
    }
    return undefined;
  })();
  const siteNode = building ? model.nodes.get(building) : undefined;
  const nF = Math.max(1, floors.length);
  const top = -(nF - 1) * GAP - 70;
  const viewBox = `-160 ${top} 360 ${(nF - 1) * GAP + 190 + 70 + THICK + 30}`;
  const svgProps = (n: SpatialNode, extra: string): SVGProps<SVGGElement> => {
    const props = bind(n.id, { interactive: false });
    const cell = kpiCell(model, n.id, kpi);
    return {
      ...(props as unknown as SVGProps<SVGGElement>),
      role: 'button', tabIndex: 0, 'aria-pressed': selectedIds.includes(n.id),
      'aria-label': `${SPATIAL_KIND_LABELS[n.kind]} ${n.name}、${kpi ? `${kpi} ${cell.text}` : t('KPI なし')}${extra}`,
      className: s.svgItem,
      onClick: (e) => select(n.id, { origin: ORIGIN, additive: e.ctrlKey || e.metaKey || e.shiftKey }),
      onDoubleClick: () => zoomInto(n),
      onKeyDown: (e) => onKey(e as unknown as KeyboardEvent<Element>, n),
    };
  };
  const stageFill = (id: string) => { const c = kpiCell(model, id, kpi); return c.stage ? STAGE_FILL[c.stage] : tokens.colorNeutralBackground1; };

  const stack = (
    <svg className={s.stage} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label={t('空間の 3D（等角投影）。建物の各階を積み重ねて表示します。')} data-zoom-surface="3d" data-projection="orthographic">
      {floors.map((f, i) => {
        const z = i * GAP;
        const cell = kpiCell(model, f.id, kpi);
        const state = focusFloor === undefined ? undefined : focusFloor === f.id ? 'selected' : 'dimmed';
        const c = isoProject(W / 2, DEP * 0.82, z);
        return (
          <g key={f.id} {...svgProps(f, '')} data-kind="floor" data-floor-state={state} opacity={state === 'dimmed' ? 0.35 : 1}>
            <polygon points={[pt(0, DEP, z), pt(W, DEP, z), pt(W, DEP, z - THICK), pt(0, DEP, z - THICK)].join(' ')} fill={tokens.colorNeutralBackground5} stroke={tokens.colorNeutralStroke1} />
            <polygon points={[pt(W, 0, z), pt(W, DEP, z), pt(W, DEP, z - THICK), pt(W, 0, z - THICK)].join(' ')} fill={tokens.colorNeutralBackground6} stroke={tokens.colorNeutralStroke1} />
            <polygon points={rhombus(0, 0, W, DEP, z)} fill={stageFill(f.id)} stroke={state === 'selected' ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke1} strokeWidth={state === 'selected' ? 4 : 1.5} />
            <text x={c.sx} y={c.sy - 6} textAnchor="middle" fontSize={13} fontWeight={600} fill={tokens.colorNeutralForeground1} pointerEvents="none">{f.name}</text>
            <text x={c.sx} y={c.sy + 10} textAnchor="middle" fontSize={11} fill={tokens.colorNeutralForeground1} pointerEvents="none">{kpi ? cell.text : ''}</text>
          </g>
        );
      })}
      {d >= D ? floors.map((f, i) => {
        const rs = roomsOf(f);
        const cw = Math.min(64, (W - 20) / Math.max(1, rs.length));
        return rs.map((r, k) => {
          const z = i * GAP;
          const x = 10 + k * cw; const cd = 46;
          const c = isoProject(x + (cw - 4) / 2, 6 + cd / 2, z);
          const cell = kpiCell(model, r.id, kpi);
          return (
            <g key={r.id} {...svgProps(r, '')} data-kind={r.kind} opacity={focusFloor !== undefined && focusFloor !== f.id ? 0.35 : 1}>
              <polygon points={rhombus(x, 6, cw - 4, cd, z)} fill={stageFill(r.id)} stroke={tokens.colorNeutralStroke1} />
              <text x={c.sx} y={c.sy - 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={tokens.colorNeutralForeground1} pointerEvents="none">{r.name}</text>
              <text x={c.sx} y={c.sy + 8} textAnchor="middle" fontSize={7} fill={tokens.colorNeutralForeground1} pointerEvents="none">{kpi ? cell.text : ''}</text>
            </g>
          );
        });
      }) : null}
      {siteNode ? (() => {
        const c = isoProject(W / 2, DEP, (nF - 1) * GAP + 70);
        const cell = kpiCell(model, siteNode.id, kpi);
        return (
          <g {...svgProps(siteNode, '')} data-kind="site">
            <text x={c.sx} y={c.sy - 70} textAnchor="middle" fontSize={13} fontWeight={600} fill={tokens.colorNeutralForeground1}>{t('拠点 {name}', { name: siteNode.name })}</text>
            <text x={c.sx} y={c.sy - 54} textAnchor="middle" fontSize={11} fill={tokens.colorNeutralForeground1}>{kpi ? cell.text : ''}</text>
          </g>
        );
      })() : null}
    </svg>
  );

  // Graph（FR-238）: 建物の拠点・フロア・部屋/設備をノードに、「含む」の向き付きのエッジで結ぶ。階層（rank）が現在のズームより深いものは出さない
  const graphRank = new Map<string, number>();
  const graphNodes: Array<GraphNodeIn & { rank: number }> = [];
  const graphEdges: GraphEdgeIn[] = [];
  if (siteNode) {
    const add = (n: SpatialNode, rank: number): void => {
      graphRank.set(n.id, rank);
      graphNodes.push({ id: n.id, name: n.name, kind: n.kind, kindLabel: SPATIAL_KIND_LABELS[n.kind], rank, note: kpi ? `${kpi} ${kpiCell(model, n.id, kpi).text}` : undefined });
    };
    add(siteNode, 1);
    for (const f of floors) {
      add(f, 2); graphEdges.push({ id: `${siteNode.id}>${f.id}`, from: siteNode.id, to: f.id, label: t('含む'), meaning: 'contains' });
      for (const r of roomsOf(f)) { add(r, 3); graphEdges.push({ id: `${f.id}>${r.id}`, from: f.id, to: r.id, label: t('含む'), meaning: 'contains' }); }
    }
  }

  const detailView = detail ? (() => {
    const parent = detail.parentId ? model.nodes.get(detail.parentId) : undefined;
    return (
      <div className={s.detail} data-testid="zoom-detail">
        <section data-testid="room-detail" data-entity-id={detail.id} aria-label={t('{name} の詳細', { name: detail.name })}>
          <Text as="h3" weight="semibold">{SPATIAL_KIND_LABELS[detail.kind]} {detail.name}</Text>
          <Text as="h4" weight="semibold">{t('属性')}</Text>
          <dl className={s.dl}>
            <dt>{t('種別')}</dt><dd>{SPATIAL_KIND_LABELS[detail.kind]}</dd>
            <dt>{t('所属')}</dt><dd>{parent ? `${SPATIAL_KIND_LABELS[parent.kind]} ${parent.name}` : '—'}</dd>
            {model.kpiNames.map((k) => { const c = kpiCell(model, detail.id, k); return (<><dt key={`${k}-t`}>{k}</dt><dd key={`${k}-d`}><KpiBadge cell={c} className={s.kpi} /></dd></>); })}
          </dl>
          <Text as="h4" weight="semibold">{t('出典')}</Text>
          <Text as="p">{detail.sourceIds.length ? detail.sourceIds.join('、') : t('出典なし')}</Text>
          <Text as="h4" weight="semibold">{t('関係')}</Text>
          <ul>
            {parent ? <li>{t('{kind} {name} に含まれる（配置）', { kind: t(SPATIAL_KIND_LABELS[parent.kind]), name: parent.name })}</li> : null}
            {(model.measuredBy.get(detail.id) ?? []).map((m) => <li key={m}>{t('{name} が計測する', { name: model.names.get(m) ?? m })}</li>)}
            {detail.children.map((c) => <li key={c}>{t('{name} を含む', { name: model.names.get(c) ?? c })}</li>)}
          </ul>
        </section>
      </div>
    );
  })() : null;

  return (
    <Panel testId="component-spatial-view" title={t('空間ビュー')} description={t('拠点・フロア・部屋/設備の空間階層に KPI を重ねて見ます。拡大すると 全体 → 拠点 → フロア → 部屋/設備 → 詳細 と進みます。値は顧客パックが与えたものだけを表示します。')}>
      {!hasSpace ? (
        <EmptyView message={t('空間の階層（種別が拠点・フロア・部屋のエンティティ）がありません。')} />
      ) : (
        <div ref={rootRef} className={s.root} data-testid="spatial-surface" {...zoomAttrs(d, D)}>
          <div className={s.toolbar}>
            <Field label="KPI">
              <Select value={kpi ?? ''} disabled={model.kpiNames.length === 0} onChange={(_, v) => setKpi(v.value)} aria-label="KPI">
                {model.kpiNames.length === 0 ? <option value="">{t('KPI なし')}</option> : model.kpiNames.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <div className={s.zoomBar} role="group" aria-label={t('ズーム')}>
              <Button size="small" disabled={!canZoomIn(d, D)} onClick={() => zoomTo(stepDepth(d, 1, D))}>{t('拡大')}</Button>
              <Button size="small" disabled={!canZoomOut(d)} onClick={() => zoomTo(stepDepth(d, -1, D))}>{t('縮小')}</Button>
              <Button size="small" onClick={() => zoomTo(0)}>{t('全体表示に戻す')}</Button>
              <Button size="small" disabled={!canZoomOut(d)} onClick={() => zoomTo(stepDepth(d, -1, D))}>{t('一つ上の階層へ')}</Button>
            </div>
            <span data-testid="zoom-level" data-depth={d} data-depth-count={D + 2}>{t('階層 {d}', { d })}</span>
          </div>
          <ZoomBreadcrumb depth={d} elementDepth={D} elementLabels={elementLabels} detailLabel={detail?.name} onGo={zoomTo} />
          {!kpi ? <Text size={200}>{t('顧客パックに、空間を計測する KPI（ツイン関係「計測する」）がありません。値は「データなし」と表示します。')}</Text> : null}

          {mode === '3d' ? stack : null}

          {mode === 'graph' && d >= 1 && d <= D ? (
            <GraphSurface origin={ORIGIN} label={t('空間ビュー')} nodes={graphNodes.filter((n) => n.rank <= d)} edges={graphEdges.filter((e) => graphRank.get(e.from)! <= d && graphRank.get(e.to)! <= d)} onOpen={(id) => { const n = model.nodes.get(id); if (n) zoomInto(n); }} zoomControls="external" />
          ) : null}

          {mode !== '3d' && d === 0 ? (
            <GraphScope active={mode === 'graph'} origin={ORIGIN} label={t('空間ビュー')}><div role="group" aria-label={t('全体')} data-testid="spatial-overview">
              {(['site', 'floor', 'room'] as const).map((k) => (
                <span key={k} className={s.cluster} data-zoom-cluster={SPATIAL_KIND_LABELS[k]} role="button" tabIndex={0}
                  onClick={() => zoomTo(DEPTH_OF_KIND[k])} onKeyDown={(e) => { if (e.key === 'Enter') zoomTo(DEPTH_OF_KIND[k]); }}>
                  <Text weight="semibold">{k === 'room' ? t('部屋・設備') : t(SPATIAL_KIND_LABELS[k])}</Text>
                  <Text size={200}>{n0(counts[k])}</Text>
                </span>
              ))}
            </div></GraphScope>
          ) : null}

          {mode === '2d' && d >= 1 && d <= D ? (
            <ul className={s.list} aria-label={t('{kind}の一覧（2D）', { kind: d === 1 ? t('拠点') : d === 2 ? t('フロア') : t('部屋・設備') })} data-zoom-surface="2d">
              {itemPresence.map((p) => card(p.item, p.life, p.exiting))}
            </ul>
          ) : null}

          {detailView ? <GraphScope active={mode === 'graph'} origin={ORIGIN} label={t('空間ビュー')}>{detailView}</GraphScope> : null}
          {mode !== '2d' ? (
            <GraphAlt
              origin={ORIGIN} label={t('空間ビュー')} columns={kpi ? [kpi] : []}
              nodes={graphNodes.map((n) => ({ id: n.id, name: n.name, kind: n.kindLabel ?? n.kind, values: kpi ? [kpiCell(model, n.id, kpi).text] : [] }))}
              relations={graphEdges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }))}
              summary={t('拠点 {site}・フロア {floor}・部屋/設備 {room}（階層: 全体・拠点・フロア・部屋/設備・詳細の 5 階層。現在 {d}）', { site: n0(counts.site), floor: n0(counts.floor), room: n0(counts.room), d })}
            />
          ) : null}
          {d === D + 1 && !detail ? <EmptyView message={t('詳細を見る部屋・設備がありません。')} /> : null}

          {twinItems.length > 0 ? (
            <section aria-label={t('ツイン関係')} data-testid="spatial-twins">
              <Text weight="semibold" size={200} block>{t('ツイン関係（空間の項目に結ばれたデジタル世界の項目）')}</Text>
              <ul className={s.legend}>
                {twinItems.map((t) => {
                  const props = bind(t.id, { interactive: false });
                  const on = selectedIds.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button" {...props} aria-pressed={on} className={mergeClasses(s.card, on ? s.cardSelected : undefined, hl(props['data-highlight']))}
                        onClick={(ev) => select(t.id, { origin: ORIGIN, additive: ev.ctrlKey || ev.metaKey || ev.shiftKey })}
                      >
                        <Text weight="semibold">{t.name}</Text>
                        <Text size={200}>{tr('{of} を{relation}（デジタル世界）', { of: t.of, relation: t.relation })}</Text>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <ul className={s.legend} aria-label={t('KPI の凡例')} data-testid="kpi-legend">
            {KPI_STAGES.map((st) => (
              <li key={st}><span className={s.kpi} style={{ backgroundColor: STAGE_FILL[st] }}>{STAGE_GLYPHS[st]} {KPI_STAGE_LABELS[st]}</span></li>
            ))}
            <li><span className={s.kpi}>{t('○ 値なし（パックに値がない項目）')}</span></li>
          </ul>
        </div>
      )}
    </Panel>
  );
}
