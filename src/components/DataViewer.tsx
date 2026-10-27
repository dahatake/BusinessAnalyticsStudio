// データビュアー（FR-169）。データエンティティを 2D または 3D で見る。拡大・縮小（ホイール・ピンチ・ボタン・キー）で、
// 鳥観図（塊）→ エンティティ（名称・説明）→ 列（列名・型）と詳細度が変わる。2D と 3D を切り替えても、選択・倍率・絞り込みは store に残る。
// NFR-A11Y-007: キーボードだけで移動・選択・拡大縮小・全体表示ができ、変化は aria-live で通知する。3D が使えない環境では 2D にし、表の一覧を常に持つ。
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from './ChoiceRadio';
import { NO_COLUMNS_LABEL, KIND_LABELS } from '../datacatalog/model';
import {
  DETAIL_LABELS, DETAIL_LEVELS, THRESHOLDS, ZOOM_HOME, NO_3D_REASON, filterEntities, groupClusters, layoutViewer, zoomKeyAction,
  type ViewerEntity,
} from '../datacatalog/viewer';
import { useDataViewer } from '../store/dataViewer';
import { GraphSurface, type GraphEdgeIn, type GraphNodeIn } from './GraphSurface';
import { GraphScope } from './GraphViewport';
import { GraphAlt } from './GraphAlt';
import { ZoomBreadcrumb, canZoomIn, canZoomOut, scaleOfDepth, zoomAttrs } from '../semanticzoom';
import { detect3D } from '../view/render3d';
import { useT } from '../i18n';
import {
  RELATION_KIND_LABELS, RELATION_KINDS, decideViewMode, describeRelation, highlightOf, lineStyleOf, relatedOf, relationAnnouncement, simplifySelection,
  type RelationKind, type ViewerRelation,
} from '../datacatalog/relations';

const DataViewer3D = lazy(() => import('../three/DataViewer3D').then((m) => ({ default: m.DataViewer3D })));

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minWidth: 0, ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' } },
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalXS },
  stage: { minWidth: 0, maxHeight: '60vh', overflowY: 'auto', overflowX: 'hidden' },
  grid: { display: 'grid', gap: tokens.spacingHorizontalS, margin: 0, padding: 0 },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalS },
  card: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, padding: tokens.spacingHorizontalM, cursor: 'pointer', minWidth: 0, overflowWrap: 'anywhere',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  on: { border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  cols: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  scroll: { overflowX: 'auto', maxWidth: '100%' },
  cell: { border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, padding: tokens.spacingHorizontalS, textAlign: 'left', verticalAlign: 'top' },
  hidden: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
});

/** 3D を使えるかの判定（WebGPU・WebGL2 のどちらも使えなければ使えない）。ビューの切替と共通（src/view/render3d.ts） */
export { detect3D };

export interface DataViewerProps {
  entities: readonly ViewerEntity[];
  selectedKey: string | null;
  /** key=null は選択の解除 */
  onSelect: (key: string | null) => void;
  /** 関連（FR-170。deriveViewerRelations の結果）。なければ関連の表示なし */
  relations?: readonly ViewerRelation[];
  /** テスト用: 簡略表示の上限（PARAM-055・056）を差し替える */
  limits?: { entities: number; columns: number };
  /** テスト用: 3D の可否を差し替える */
  available3D?: boolean;
}

const NO_RELATIONS: readonly ViewerRelation[] = [];

export function DataViewer({ entities, selectedKey, onSelect, relations = NO_RELATIONS, limits, available3D }: DataViewerProps) {
  const s = useStyles();
  const t = useT();
  const { mode, zoom, level, filter, cluster, useCase } = useDataViewer();
  const setUseCase = useDataViewer((x) => x.setUseCase);
  const setMode = useDataViewer((x) => x.setMode);
  const zoomBy = useDataViewer((x) => x.zoomBy);
  const step = useDataViewer((x) => x.step);
  const home = useDataViewer((x) => x.home);
  const setFilter = useDataViewer((x) => x.setFilter);
  const setCluster = useDataViewer((x) => x.setCluster);
  const setZoom = useDataViewer((x) => x.setZoom);
  // 意味的ズーム（FR-237）: 鳥観図（全体）→ エンティティ（要素。段 D=1）→ 列（詳細）。階層の数は D+2＝3
  const depth = DETAIL_LEVELS.indexOf(level);
  const goDepth = (k: number) => { if (k <= 0) home(); else setZoom(scaleOfDepth(k, 1, [THRESHOLDS[0], THRESHOLDS[1]])); };
  const can3D = available3D ?? detect3D();
  // Graph は平面の描画なので、3D を描画できない環境でも使える（FR-238）
  const effectiveMode = mode === 'graph' ? 'graph' : can3D ? mode : '2d';
  const root = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState('');

  const shown = useMemo(() => filterEntities(entities, filter), [entities, filter]);
  const clusters = useMemo(() => groupClusters(shown), [shown]);
  const layout = useMemo(() => layoutViewer(clusters), [clusters]);
  const selected = entities.find((e) => e.key === selectedKey);

  // FR-170: 関連の強調と減光。エンティティの選択が優先で、なければ注目しているユースケース
  const rel = useMemo(() => relatedOf(relations, selected ? { entityKey: selected.key } : { useCase }), [relations, selected, useCase]);
  const hl = (key: string) => highlightOf(rel, key, selectedKey);
  const useCases = useMemo(() => [...new Set(relations.map((r) => r.useCase).filter((x): x is string => !!x))].sort(), [relations]);

  // FR-171: 上限を超えたら簡略表示（鳥観図と、選択中のエンティティとその近傍だけの詳細）。理由と集約した件数を出す
  const totalColumns = useMemo(() => entities.reduce((n, e) => n + e.columns.length, 0), [entities]);
  const viewMode = useMemo(() => decideViewMode(entities.length, totalColumns, limits?.entities, limits?.columns), [entities.length, totalColumns, limits]);
  const simple = useMemo(
    () => (viewMode.simplified ? simplifySelection(entities, shown, selectedKey, rel?.entityKeys ?? new Set<string>(), filter.trim() !== '') : null),
    [viewMode.simplified, entities, shown, selectedKey, rel, filter],
  );
  const detailKeys = simple?.detailKeys ?? null;
  const inDetail = (k: string) => !detailKeys || detailKeys.has(k);

  // 変化の通知（aria-live）。選択・解除と詳細度が変わったときに、文字で知らせる
  const lastLevel = useRef(level);
  const lastSel = useRef(selected?.name);
  useEffect(() => {
    const msgs: string[] = [];
    if (lastLevel.current !== level) msgs.push(t('詳細度が {level} になりました。', { level: t(DETAIL_LABELS[level]) }));
    if (lastSel.current !== selected?.name) {
      if (selected) msgs.push(t('{name} を選択しました。列 {cols} 件。関連する対象 {rel} 件。', { name: selected.name, cols: selected.columns.length, rel: Math.max(0, (rel?.entityKeys.size ?? 1) - 1) }));
      else msgs.push(relationAnnouncement(null, 0));
    }
    lastLevel.current = level; lastSel.current = selected?.name;
    if (msgs.length) setLive(msgs.join(' '));
  }, [level, selected, rel, t]);

  // ホイール・ピンチ（ドラッグでの移動にはボタン・キーという別の手段がある。2.5.7）
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if ((ev.target as HTMLElement | null)?.closest('input')) return;
      ev.preventDefault(); ev.stopPropagation(); // 3D の枠の標準のホイール拡大と二重にならないよう、ここで引き取る
      zoomBy(Math.exp(-ev.deltaY * 0.002));
    };
    const pts = new Map<number, { x: number; y: number }>();
    let last = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const onDown = (ev: PointerEvent) => { pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); last = dist(); };
    const onMove = (ev: PointerEvent) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const d = dist(); if (last > 0 && d > 0) zoomBy(d / last); last = d; }
    };
    const onUp = (ev: PointerEvent) => { pts.delete(ev.pointerId); last = dist(); };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
    };
  }, [zoomBy]);

  // キーボード: + − 0 で拡大・縮小・全体表示、矢印・Home・End で隣の塊・エンティティ・列へ、Enter / Space で選択
  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).tagName === 'INPUT') return;
    const z = zoomKeyAction(ev.key);
    if (z) { ev.preventDefault(); if (z === 'in') step(1); else if (z === 'out') step(-1); else home(); return; }
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="option"], [data-viewer-column]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'Enter' || ev.key === ' ') {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (t) {
        ev.preventDefault(); t.click();
        if (ev.key === 'Enter') { if (t.hasAttribute('data-zoom-cluster')) goDepth(1); else if (t.hasAttribute('data-zoom-node')) goDepth(2); }
      }
      return;
    }
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1
      : ['ArrowDown', 'ArrowRight'].includes(ev.key) ? Math.min(items.length - 1, i + 1) : ['ArrowUp', 'ArrowLeft'].includes(ev.key) ? Math.max(0, i < 0 ? 0 : i - 1) : -1;
    if (next >= 0 && items[next]) { ev.preventDefault(); items[next]!.focus(); }
  };

  const minW = Math.round(Math.min(360, Math.max(96, 120 * Math.sqrt(zoom))));
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))` };
  // Graph（FR-238）: エンティティをノードに、関連（2 つのエンティティを結ぶもの）を意味ラベル付きの向き付きのエッジにする
  const clusterNameOf = new Map(clusters.flatMap((c) => c.entities.map((e) => [e.key, c.name] as const)));
  const graphNodes: GraphNodeIn[] = shown.filter((e) => inDetail(e.key)).map((e) => ({
    id: e.key, name: e.name, kind: clusterNameOf.get(e.key) ?? 'データエンティティ', kindLabel: clusterNameOf.has(e.key) ? undefined : t('データエンティティ'), cluster: clusterNameOf.get(e.key), note: t('列 {n} 件', { n: e.columns.length }),
  }));
  const graphIds = new Set(graphNodes.map((n) => n.id));
  const graphEdges: GraphEdgeIn[] = relations
    .filter((r) => r.entityKeys.length === 2 && r.entityKeys.every((k) => graphIds.has(k)))
    .map((r) => ({ id: r.id, from: r.entityKeys[0]!, to: r.entityKeys[1]!, label: r.label, meaning: r.kind, dash: lineStyleOf(r).dash || undefined }));
  const entityCard = (e: ViewerEntity) => {
    const on = e.key === selectedKey;
    const h = hl(e.key);
    return (
      <div
        key={e.key} role="option" aria-selected={on} tabIndex={0} data-viewer-entity={e.name} data-highlight={h} data-zoom-node="" data-entity-id={e.key} data-entity-name={e.name} data-kind="データエンティティ" className={mergeClasses(s.card, on && s.on)}
        style={h === 'dimmed' ? { opacity: 0.4 } : h === 'related' ? { borderStyle: 'dashed', borderWidth: tokens.strokeWidthThick } : undefined} onClick={() => { setUseCase(null); onSelect(e.key); }}
        onDoubleClick={() => { setUseCase(null); onSelect(e.key); goDepth(2); }}
      >
        <Text weight="semibold">{e.name}{on ? t('（選択中）') : h === 'related' ? t('（関連）') : ''}</Text>
        <Text size={200}>{e.description}</Text>
        {level === 'entity' ? <Text size={200}>{t('データエンティティ')}</Text> : null}
        {level === 'column' ? (
          e.columns.length === 0
            ? <Text size={200} data-viewer-nocolumns>{t(NO_COLUMNS_LABEL)}</Text>
            : <ul className={s.cols}>{e.columns.map((c, i) => <li key={i} tabIndex={-1} data-viewer-column={c.name}>{c.name}{c.type ? `（${c.type}）` : ''}</li>)}</ul>
        ) : null}
      </div>
    );
  };

  const birdGrid = (
            <div className={s.grid} style={gridStyle}>
    {clusters.map((c) => (
      <div
        key={c.name} role="option" aria-selected={cluster === c.name} tabIndex={0} data-viewer-cluster={c.name} data-zoom-cluster={c.name} className={mergeClasses(s.card, cluster === c.name && s.on)}
        onClick={() => setCluster(c.name)} onDoubleClick={() => { setCluster(c.name); goDepth(1); }}
      >
        <Text weight="semibold">{c.name}</Text>
        <Text size={200}>{t('{n} 件のエンティティ', { n: c.entities.length })}</Text>
      </div>
    ))}
  </div>
  );

  return (
    <div
      ref={root} className={s.root} data-testid="data-viewer" data-view-mode={effectiveMode} data-detail-level={level} data-zoom={zoom.toFixed(3)} {...zoomAttrs(depth, 1)}
      role="group" aria-label={t('データビュアー')} aria-roledescription={t('データビュアー。+ − で拡大縮小、0 で全体表示、矢印キーで移動、Enter で選択')} tabIndex={0} onKeyDown={onKeyDown}
    >
      <div className={s.bar}>
        <RadioGroup layout="horizontal" aria-label={t('表示モード')} value={effectiveMode} onChange={(_, d) => { if (d.value === '3d' && !can3D) return; setMode(d.value as '2d' | '3d' | 'graph'); }}>
          <Radio value="2d" label="2D" />
          <Radio value="3d" label="3D" disabled={!can3D} />
          <Radio value="graph" label="Graph" />
        </RadioGroup>
        <Button size="small" aria-label={t('拡大')} aria-disabled={!canZoomIn(depth, 1)} onClick={() => step(1)}>＋</Button>
        <Button size="small" aria-label={t('縮小')} disabled={depth === 0 && zoom <= ZOOM_HOME} onClick={() => step(-1)}>－</Button>
        <Button size="small" aria-label={t('一つ上の階層へ')} disabled={!canZoomOut(depth)} onClick={() => goDepth(depth - 1)}>{t('一つ上')}</Button>
        <Button size="small" aria-label={t('全体表示に戻す')} onClick={() => home()}>{t('全体表示')}</Button>
        <label>
          <span>{t('絞り込み')}</span>{' '}
          <Input type="search" aria-label={t('絞り込み')} value={filter} onChange={(_, d) => setFilter(d.value)} placeholder={t('エンティティ名・列名')} />
        </label>
        <Text role="status" size={200} data-testid="zoom-level" data-depth={depth}>{t('詳細度: {level}／倍率: {zoom} 倍', { level: t(DETAIL_LABELS[level]), zoom: zoom.toFixed(2) })}</Text>
      </div>
      <ZoomBreadcrumb depth={depth} elementDepth={1} onGo={goDepth} />
      {!can3D ? <Text role="status" data-testid="viewer-no3d-reason" size={200}>{t(NO_3D_REASON)}</Text> : null}
      <div className={s.hidden} role="status" aria-live="polite" data-testid="viewer-live">{live}</div>
      {viewMode.simplified ? (
        <Text role="status" data-testid="viewer-simplified" size={200}>
          {t('簡略表示です。理由: {reason}。鳥観図と、選択中のエンティティとその近傍だけを詳細で表示し、ほか {n} 件を集約しています。検索で絞り込んで選ぶと詳細で表示します。表（一覧）には全件があります。', { reason: t(viewMode.reason), n: simple?.aggregated ?? 0 })}
        </Text>
      ) : null}
      {relations.length > 0 || selected ? (
        <section aria-label={t('関連')} data-testid="viewer-relations" className={s.group}>
          <Text weight="semibold" size={200}>{t('関連（種類は線の種類と文字で区別します）')}</Text>
          <ul className={s.cols} aria-label={t('関連の凡例')}>
            {RELATION_KINDS.map((k: RelationKind) => {
              const sample = lineStyleOf({ kind: k, state: k === 'usecase' ? '導出' : k === 'reconcile' ? '一致' : '' });
              return (
                <li key={k} data-relation-legend={k}>
                  <svg width="48" height="8" aria-hidden="true" focusable="false"><line x1="0" y1="4" x2="48" y2="4" stroke="currentColor" strokeWidth={sample.width} strokeDasharray={sample.dash || undefined} /></svg>{' '}
                  {t(RELATION_KIND_LABELS[k])}（{t(sample.label)}）
                </li>
              );
            })}
          </ul>
          {useCases.length > 0 ? (
            <div className={s.bar} role="group" aria-label={t('ユースケースで関連を見る')}>
              {useCases.map((u) => (
                <Button key={u} size="small" appearance={!selected && useCase === u ? 'primary' : 'secondary'} aria-pressed={!selected && useCase === u} data-viewer-usecase={u} onClick={() => { onSelect(null); setUseCase(useCase === u && !selected ? null : u); }}>{u}</Button>
              ))}
            </div>
          ) : null}
          {selected || useCase ? <Button size="small" data-testid="viewer-clear" onClick={() => { setUseCase(null); onSelect(null); }}>{t('選択を解除')}</Button> : null}
          {rel ? (
            rel.relations.length === 0
              ? <Text size={200} data-testid="viewer-relations-empty">{t('関連はありません。')}</Text>
              : <ul className={s.cols} data-testid="viewer-relation-list" aria-label={t('選択に関連する線')}>
                {rel.relations.map((r) => {
                  const st = lineStyleOf(r);
                  return (
                    <li key={r.id} data-relation-kind={r.kind} data-relation-state={r.state || undefined}>
                      <svg width="48" height="8" aria-hidden="true" focusable="false"><line x1="0" y1="4" x2="48" y2="4" stroke="currentColor" strokeWidth={st.width} strokeDasharray={st.dash || undefined} /></svg>{' '}
                      {describeRelation(r)}
                    </li>
                  );
                })}
              </ul>
          ) : null}
        </section>
      ) : null}

      {shown.length === 0 ? (
        <Text role="status">{entities.length === 0 ? t('表示するデータエンティティがありません。') : t('絞り込みに合うデータエンティティがありません。')}</Text>
      ) : effectiveMode === 'graph' ? (
        <div className={s.group}>
          <GraphScope active origin="data-viewer" label={t('データビュアー')}>
            {level === 'bird' ? birdGrid : (
              <GraphSurface origin="data-viewer" label={t('データビュアー')} nodes={graphNodes} edges={graphEdges} onOpen={(k) => { setUseCase(null); onSelect(k); goDepth(2); }} zoomControls="external" />
            )}
          </GraphScope>
          <GraphAlt
            origin="data-viewer" label={t('データビュアー')} columns={[t('列')]}
            nodes={graphNodes.map((n) => ({ id: n.id, name: n.name, kind: n.kindLabel ?? n.kind, values: [n.note ?? '—'] }))}
            relations={graphEdges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }))}
            summary={t('塊 {n} 件。詳細度は {level}（鳥観図・エンティティ・列の 3 階層）', { n: clusters.length, level: t(DETAIL_LABELS[level]) })}
          />
        </div>
      ) : effectiveMode === '3d' ? (
        <div data-zoom-surface="3d">
          <Suspense fallback={<Text role="status">{t('3D を読み込んでいます。')}</Text>}>
            <DataViewer3D
              clusters={clusters} layout={layout} level={level} zoom={zoom} selectedKey={selectedKey} activeCluster={cluster} onSelect={(k) => { setUseCase(null); onSelect(k); }} onCluster={setCluster}
              relations={relations} related={rel} detailKeys={detailKeys}
            />
          </Suspense>
        </div>
      ) : (
        <div className={s.stage} role="listbox" aria-label={t('データエンティティ（{level}）', { level: t(DETAIL_LABELS[level]) })}>
          {level === 'bird' ? birdGrid : (
            clusters.map((c) => (
              <div key={c.name} className={s.group} role="group" aria-label={t('塊: {name}', { name: c.name })} data-viewer-cluster-group={c.name}>
                <Text weight="semibold" size={200}>{c.name}</Text>
                <div className={s.grid} style={gridStyle}>{c.entities.filter((e) => inDetail(e.key)).map(entityCard)}</div>
                {detailKeys && c.entities.some((e) => !inDetail(e.key)) ? (
                  <Text size={200} data-viewer-aggregated>{t('ほか {n} 件を集約しています（検索すると選べます）', { n: c.entities.filter((e) => !inDetail(e.key)).length })}</Text>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {level === 'column' && selected ? (
        <section aria-label={t('詳細')} data-testid="zoom-detail" data-entity-id={selected.key} className={s.group}>
          <Text weight="semibold">{selected.name}</Text>
          <h4>{t('属性')}</h4>
          {selected.columns.length === 0 ? <Text size={200}>{t(NO_COLUMNS_LABEL)}</Text> : <ul>{selected.columns.map((c, i) => <li key={i}>{c.name}{c.type ? `（${c.type}）` : ''}</li>)}</ul>}
          <h4>{t('出典')}</h4>
          <Text size={200}>{selected.category ? t('突合の区分: {category}', { category: selected.category }) : t('（取り込みなし）')}</Text>
          <h4>{t('関係')}</h4>
          {selected.relatedUseCases.length === 0 ? <Text size={200}>{t('（なし）')}</Text> : <ul>{selected.relatedUseCases.map((r) => <li key={r.name}>{r.name}（{t(KIND_LABELS[r.kind])}）</li>)}</ul>}
        </section>
      ) : null}

      <details>
        <summary>{t('一覧（表）で確認する（{n} 件）', { n: shown.length })}</summary>
        <div className={s.scroll}>
          <table aria-label={t('データビュアーの一覧（表）')} data-testid="viewer-table">
            <thead>
              <tr>
                {['塊', 'エンティティ', '説明', '区分', '列', '関連するユースケース'].map((h) => <th key={h} scope="col" className={s.cell}>{t(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key} data-viewer-row={e.name}>
                  <td className={s.cell}>{e.cluster}</td>
                  <th scope="row" className={s.cell}>{e.name}</th>
                  <td className={s.cell}>{e.description}</td>
                  <td className={s.cell}>{e.category || t('（取り込みなし）')}</td>
                  <td className={s.cell}>{e.columns.length === 0 ? t(NO_COLUMNS_LABEL) : e.columns.map((c) => (c.type ? `${c.name}（${c.type}）` : c.name)).join(t('、'))}</td>
                  <td className={s.cell}>{e.relatedUseCases.length === 0 ? t('（なし）') : e.relatedUseCases.map((r) => `${r.name}（${t(KIND_LABELS[r.kind])}）`).join(t('、'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
