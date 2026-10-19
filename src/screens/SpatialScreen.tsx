// 空間ビュー（FR-240）。拠点 → フロア → 部屋/設備 の空間階層に KPI を重ねる。意味的ズーム（FR-237。src/semanticzoom）で
// 全体 → 拠点 → フロア → 部屋/設備 → 詳細 の 5 階層をたどる。2D は階層ごとの一覧（平面の項目）、3D は建物を階ごとに積んだ等角投影（アイソメ図）。
// 3D は canvas ではなく SVG の等角投影で描くので、WebGL がなくても選べる（ガントチャートと同じ扱い）。選択はすべてのビューと共通（FR-024）。
// Graph の表現は、表示形式の共通の機構（FR-238）が担当する。
import { useEffect, useMemo, type KeyboardEvent, type SVGProps } from 'react';
import { Button, Field, Select, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { useHighlightClass } from '../components/highlight';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { ZoomBreadcrumb, canZoomIn, canZoomOut, clampDepth, stepDepth, zoomAttrs } from '../semanticzoom';
import {
  SPATIAL_ELEMENT_DEPTH, SPATIAL_KIND_LABELS, STAGE_GLYPHS, buildSpatialModel, buildingSite, detailTarget, isoProject, itemsAtDepth, kpiCell,
  type KpiCell, type RawEntity, type RawTwin, type SpatialModel, type SpatialNode,
} from '../spatial';
import { useSpatialView } from '../spatial/store';
import { KPI_STAGES, KPI_STAGE_LABELS, type KpiStage } from '../graphmodel';
import { usePackStore } from '../store/pack';
import { useComponentView, usePublishViewItems } from '../view/useView';

const ORIGIN = 'spatial-view';
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

  const items = useMemo(() => (model ? itemsAtDepth(model, d, selectedIds) : []), [model, d, selectedIds]);
  const building = model ? buildingSite(model, selectedIds) : undefined;
  const floors = useMemo(() => (model && building ? model.nodes.get(building)!.children.map((c) => model.nodes.get(c)!).filter((n) => n.kind === 'floor') : []), [model, building]);
  const roomsOf = (f: SpatialNode): SpatialNode[] => (model ? f.children.map((c) => model.nodes.get(c)!).filter((n) => n.kind === 'room' || n.kind === 'equipment') : []);
  const detail = model && d === D + 1 ? detailTarget(model, selectedIds) : undefined;

  const shownIds = useMemo(() => {
    if (!model) return [] as string[];
    if (mode === '3d') {
      const ids: string[] = building ? [building] : [];
      for (const f of floors) { ids.push(f.id); if (d >= D) for (const r of roomsOf(f)) ids.push(r.id); }
      return ids;
    }
    return d === 0 ? [] : d === D + 1 ? (detail ? [detail.id] : []) : items.map((n) => n.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mode, building, floors, d, items, detail]);
  usePublishViewItems(ORIGIN, shownIds);

  if (!model) return <LoadingView label="空間ビューを読み込み中" />;

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
  const card = (n: SpatialNode) => {
    const props = bind(n.id, { interactive: false });
    const cell = kpiCell(model, n.id, kpi);
    const isSel = selectedIds.includes(n.id);
    return (
      <li key={n.id}>
        <div
          {...props}
          data-kind={n.kind}
          data-zoom-node=""
          data-entity-name={n.name}
          role="button"
          tabIndex={0}
          aria-pressed={isSel}
          aria-label={`${SPATIAL_KIND_LABELS[n.kind]} ${n.name}、${kpi ? `${kpi} ${cell.text}` : 'KPI なし'}`}
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
      'aria-label': `${SPATIAL_KIND_LABELS[n.kind]} ${n.name}、${kpi ? `${kpi} ${cell.text}` : 'KPI なし'}${extra}`,
      className: s.svgItem,
      onClick: (e) => select(n.id, { origin: ORIGIN, additive: e.ctrlKey || e.metaKey || e.shiftKey }),
      onDoubleClick: () => zoomInto(n),
      onKeyDown: (e) => onKey(e as unknown as KeyboardEvent<Element>, n),
    };
  };
  const stageFill = (id: string) => { const c = kpiCell(model, id, kpi); return c.stage ? STAGE_FILL[c.stage] : tokens.colorNeutralBackground1; };

  const stack = (
    <svg className={s.stage} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label="空間の 3D（等角投影）。建物の各階を積み重ねて表示します。" data-zoom-surface="3d" data-projection="orthographic">
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
            <text x={c.sx} y={c.sy - 70} textAnchor="middle" fontSize={13} fontWeight={600} fill={tokens.colorNeutralForeground1}>{`拠点 ${siteNode.name}`}</text>
            <text x={c.sx} y={c.sy - 54} textAnchor="middle" fontSize={11} fill={tokens.colorNeutralForeground1}>{kpi ? cell.text : ''}</text>
          </g>
        );
      })() : null}
    </svg>
  );

  const detailView = detail ? (() => {
    const parent = detail.parentId ? model.nodes.get(detail.parentId) : undefined;
    return (
      <div className={s.detail} data-testid="zoom-detail">
        <section data-testid="room-detail" data-entity-id={detail.id} aria-label={`${detail.name} の詳細`}>
          <Text as="h3" weight="semibold">{SPATIAL_KIND_LABELS[detail.kind]} {detail.name}</Text>
          <Text as="h4" weight="semibold">属性</Text>
          <dl className={s.dl}>
            <dt>種別</dt><dd>{SPATIAL_KIND_LABELS[detail.kind]}</dd>
            <dt>所属</dt><dd>{parent ? `${SPATIAL_KIND_LABELS[parent.kind]} ${parent.name}` : '—'}</dd>
            {model.kpiNames.map((k) => { const c = kpiCell(model, detail.id, k); return (<><dt key={`${k}-t`}>{k}</dt><dd key={`${k}-d`}><KpiBadge cell={c} className={s.kpi} /></dd></>); })}
          </dl>
          <Text as="h4" weight="semibold">出典</Text>
          <Text as="p">{detail.sourceIds.length ? detail.sourceIds.join('、') : '出典なし'}</Text>
          <Text as="h4" weight="semibold">関係</Text>
          <ul>
            {parent ? <li>{`${SPATIAL_KIND_LABELS[parent.kind]} ${parent.name} に含まれる（配置）`}</li> : null}
            {(model.measuredBy.get(detail.id) ?? []).map((m) => <li key={m}>{`${model.names.get(m) ?? m} が計測する`}</li>)}
            {detail.children.map((c) => <li key={c}>{`${model.names.get(c) ?? c} を含む`}</li>)}
          </ul>
        </section>
      </div>
    );
  })() : null;

  return (
    <Panel testId="component-spatial-view" title="空間ビュー" description="拠点・フロア・部屋/設備の空間階層に KPI を重ねて見ます。拡大すると 全体 → 拠点 → フロア → 部屋/設備 → 詳細 と進みます。値は顧客パックが与えたものだけを表示します。">
      {!hasSpace ? (
        <EmptyView message="空間の階層（種別が拠点・フロア・部屋のエンティティ）がありません。" />
      ) : (
        <div className={s.root} data-testid="spatial-surface" {...zoomAttrs(d, D)}>
          <div className={s.toolbar}>
            <Field label="KPI">
              <Select value={kpi ?? ''} disabled={model.kpiNames.length === 0} onChange={(_, v) => setKpi(v.value)} aria-label="KPI">
                {model.kpiNames.length === 0 ? <option value="">KPI なし</option> : model.kpiNames.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <div className={s.zoomBar} role="group" aria-label="ズーム">
              <Button size="small" disabled={!canZoomIn(d, D)} onClick={() => zoomTo(stepDepth(d, 1, D))}>拡大</Button>
              <Button size="small" disabled={!canZoomOut(d)} onClick={() => zoomTo(stepDepth(d, -1, D))}>縮小</Button>
              <Button size="small" disabled={d === 0} onClick={() => zoomTo(0)}>全体表示に戻す</Button>
              <Button size="small" disabled={!canZoomOut(d)} onClick={() => zoomTo(stepDepth(d, -1, D))}>一つ上の階層へ</Button>
            </div>
            <span data-testid="zoom-level" data-depth={d} data-depth-count={D + 2}>階層 {d}</span>
          </div>
          <ZoomBreadcrumb depth={d} elementDepth={D} elementLabels={elementLabels} detailLabel={detail?.name} onGo={zoomTo} />
          {!kpi ? <Text size={200}>顧客パックに、空間を計測する KPI（ツイン関係「計測する」）がありません。値は「データなし」と表示します。</Text> : null}

          {mode === '3d' ? stack : null}

          {mode !== '3d' && d === 0 ? (
            <div role="group" aria-label="全体" data-testid="spatial-overview">
              {(['site', 'floor', 'room'] as const).map((k) => (
                <span key={k} className={s.cluster} data-zoom-cluster={SPATIAL_KIND_LABELS[k]} role="button" tabIndex={0}
                  onClick={() => zoomTo(DEPTH_OF_KIND[k])} onKeyDown={(e) => { if (e.key === 'Enter') zoomTo(DEPTH_OF_KIND[k]); }}>
                  <Text weight="semibold">{k === 'room' ? '部屋・設備' : SPATIAL_KIND_LABELS[k]}</Text>
                  <Text size={200}>{counts[k]} 件</Text>
                </span>
              ))}
            </div>
          ) : null}

          {mode !== '3d' && d >= 1 && d <= D ? (
            <ul className={s.list} aria-label={`${d === 1 ? '拠点' : d === 2 ? 'フロア' : '部屋・設備'}の一覧（2D）`} data-zoom-surface="2d">
              {items.map(card)}
            </ul>
          ) : null}

          {detailView}
          {d === D + 1 && !detail ? <EmptyView message="詳細を見る部屋・設備がありません。" /> : null}

          <ul className={s.legend} aria-label="KPI の凡例" data-testid="kpi-legend">
            {KPI_STAGES.map((st) => (
              <li key={st}><span className={s.kpi} style={{ backgroundColor: STAGE_FILL[st] }}>{STAGE_GLYPHS[st]} {KPI_STAGE_LABELS[st]}</span></li>
            ))}
            <li><span className={s.kpi}>○ データなし</span></li>
          </ul>
        </div>
      )}
    </Panel>
  );
}
