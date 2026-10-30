// 地図（FR-021）。コト（SCM など）の中核オブジェクトのとき、拠点を地球儀/3D マップの位置に表示し、
// 時間軸のスライダーで流れ（物流・データ）の量と粒子が時刻に応じて変わる。アニメーション停止中は粒子が静止する（FR-071）。
// 拠点のボタンは、3D の位置に重ねた DOM の要素（キーボード・スクリーンリーダーで操作できる）。選択はすべてのビューと共通（FR-024）。
// 位置のない拠点は地図に出さず、「位置情報なし: N 件」と示して表で見られるようにする（FR-113）。
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { isShownInWorld } from '../view/viewModel';
import type { MapData } from '../map/data';
import { Field, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { FALLBACK_REASONS } from '../analysis/fallback';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { UnrenderableNote } from '../components/UnrenderableNote';
import { ViewAsTableButton, ViewTable } from '../components/ViewTable';
import { siteTableRows, useMapData } from '../map/data';
import { flowColor, flowRate } from '../map/flows';
import type { MapMode } from '../map/geo';
import { MapScene } from '../map/MapScene';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { formatHour, useTimeline } from '../store/timeline';
import { useView3D } from '../store/view3d';
import { RenderCanvas } from '../three/SceneCanvas';
import { usePane } from '../workspace/PaneContext';
import { useT } from '../i18n';
import { usePresenceItems } from '../motion/usePresence';

const ORIGIN = 'map';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  stage: {
    position: 'relative',
    height: '56vh',
    minHeight: '320px',
    overflow: 'hidden',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  overlay: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  marker: {
    position: 'absolute',
    left: 0,
    top: 0,
    pointerEvents: 'auto',
    cursor: 'pointer',
    minHeight: '24px',
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: 'nowrap',
    // 文字を拡大しても 1 行に収め、収まらない分は省略記号にする（全文はボタンの名前と「表で見る」の表。NFR-A11Y-009 AC-483・A-51）
    maxWidth: '20em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  legend: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS },
  legendItem: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  // 2D の地図（FR-217）: 経度・緯度をそのまま横・縦にした平面図。拠点のボタンは 3D と同じ見た目
  flat: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  flatLine: { fill: 'none', strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round' },
  flatGrid: { stroke: tokens.colorNeutralStroke2, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' },
  swatch: { width: '12px', height: '12px', borderRadius: tokens.borderRadiusCircular, display: 'inline-block', flexShrink: 0 },
});

/** 2D の地図の範囲（拠点を囲む経度・緯度に余白を足したもの） */
function flatBounds(data: MapData): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = data.sites.map((x) => x.lng);
  const ys = data.sites.map((x) => x.lat);
  const pad = 6;
  let minX = Math.min(...xs) - pad; let maxX = Math.max(...xs) + pad;
  let minY = Math.min(...ys) - pad; let maxY = Math.max(...ys) + pad;
  if (!Number.isFinite(minX)) { minX = -180; maxX = 180; minY = -90; maxY = 90; }
  return { minX, maxX, minY, maxY };
}

/** 位置（緯度・経度）を、2D の地図の中の割合（0〜100%）にする */
function flatPos(b: ReturnType<typeof flatBounds>, lat: number, lng: number): { left: number; top: number } {
  return { left: ((lng - b.minX) / (b.maxX - b.minX)) * 100, top: ((b.maxY - lat) / (b.maxY - b.minY)) * 100 };
}

export function MapScreen() {
  const s = useStyles();
  const t = useT();
  const hl = useHighlightClass();
  const data = useMapData();
  const bind = useEntityBinding(ORIGIN);
  const { selectedIds } = useSelection();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hour = useTimeline((t) => t.hour);
  const quality = useView3D((st) => st.quality);
  const [mode, setMode] = useState<MapMode>('globe');
  // 2D/3D と世界の表示（FR-217・FR-218）。既定は 3D（本要求より前の地図の表示）
  const view = useComponentView(ORIGIN);
  const { graph } = useSelection();
  const shownData = useMemo<MapData | null>(() => {
    if (!data) return null;
    if (view.world === 'both') return data;
    const sites = data.sites.filter((x) => isShownInWorld(graph?.node(x.id)?.world, view.world));
    const ids = new Set(sites.map((x) => x.id));
    return { ...data, sites, flows: data.flows.filter((f) => ids.has(f.fromSite.id) && ids.has(f.toSite.id)) };
  }, [data, graph, view.world]);
  const itemIds = useMemo(() => (shownData?.sites ?? []).map((x) => x.id), [shownData]);
  usePublishViewItems(ORIGIN, itemIds);
  const [asTable, setAsTable] = useState(false);
  const markerRefs = useRef(new Map<string, HTMLElement>());
  // ワークスペースのタブで隠れているときは、描画を止める（常時動く 3D を、見えていないのに回さない）
  const pane = usePane();
  const visible = pane ? pane.visible : true;

  // 2D の拠点の出入り（FR-070 AC-086）。追加は薄く現れ、削除は薄れて消え、位置の変化は補間する。停止・reduce は即時
  const flatSites = shownData?.sites ?? [];
  const flatB = shownData ? flatBounds(shownData) : null;
  const flatItems = usePresenceItems(flatSites, (x) => x.id, (x) => { const p = flatB ? flatPos(flatB, x.lat, x.lng) : { left: 0, top: 0 }; return [p.left, p.top]; });

  if (!data || !shownData) return <LoadingView label={t('地図を読み込み中')} />;

  const hasSites = shownData.sites.length > 0;
  const bounds = flatBounds(shownData);
  const marker = (site: MapData['sites'][number], style: CSSProperties, refOn: boolean, exiting = false) => {
    const props = bind(site.id);
    return (
      <button
        key={site.id}
        type="button"
        ref={refOn ? (el) => { if (el) markerRefs.current.set(site.id, el); else markerRefs.current.delete(site.id); } : undefined}
        {...props}
        className={mergeClasses(s.marker, hl(props['data-highlight']))}
        aria-label={t('拠点 {name}（緯度 {lat}、経度 {lng}）', { name: site.name, lat: site.lat, lng: site.lng })}
        onKeyDown={(e) => { onEntityKey(e, site.id, ORIGIN); }}
        {...(exiting ? { tabIndex: -1, 'aria-hidden': true } : {})}
        style={style}
      >
        {site.name}
      </button>
    );
  };
  return (
    <Panel
      testId="component-map"
      title={t('地図')}
      description={t('拠点を地球儀・3D マップ上の位置に表示し、物流やデータの流れを粒子で示します。時間軸（画面上部）で時刻を動かすと、流れの量が変わります。')}
      maxWidth="1200px"
    >
      <div className={s.toolbar}>
        <Field label={t('3D の表示')}>
          <RadioGroup layout="horizontal" value={mode} disabled={view.mode !== '3d'} onChange={(_, d) => setMode(d.value as MapMode)}>
            <Radio value="globe" label={t('地球儀')} />
            <Radio value="flat" label={t('平面マップ')} />
          </RadioGroup>
        </Field>
        <Text weight="semibold" data-testid="map-time" aria-live="polite">{t('時刻:')} {formatHour(hour)}</Text>
        <ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
        <UnrenderableNote
          source="map"
          reason={FALLBACK_REASONS.location}
          items={data.unlocated}
        />
      </div>

      {!hasSites ? (
        <EmptyView message={t('位置を持つ拠点がありません。拠点（type が site）に location（lat・lng）を入れると、地図に表示されます。')} />
      ) : asTable ? (
        <ViewTable
          label={t('地図の拠点')}
          origin={ORIGIN}
          columns={[t('名称'), t('種別'), t('緯度'), t('経度')]}
          rows={siteTableRows(shownData.sites)}
        />
      ) : view.mode === '2d' ? (
        <div className={s.stage} data-zoom-surface="map" data-map-mode="2d">
          <svg className={s.flat} role="img" aria-label={t('地図（2D）。経度を横、緯度を縦にした平面図です。')} viewBox="0 0 100 100" preserveAspectRatio="none">
            {[25, 50, 75].map((g) => (
              <g key={g} aria-hidden="true">
                <line x1={g} y1={0} x2={g} y2={100} className={s.flatGrid} />
                <line x1={0} y1={g} x2={100} y2={g} className={s.flatGrid} />
              </g>
            ))}
            {shownData.flows.map((f) => {
              const a = flatPos(bounds, f.fromSite.lat, f.fromSite.lng);
              const b = flatPos(bounds, f.toSite.lat, f.toSite.lng);
              return (
                <line
                  key={f.id} x1={a.left} y1={a.top} x2={b.left} y2={b.top} className={s.flatLine}
                  style={{ stroke: flowColor(f.kind), strokeWidth: 1 + Math.min(4, flowRate(f, hour) / 50) }}
                />
              );
            })}
          </svg>
          <div className={s.overlay}>
            {flatItems.map((it) => marker(it.item, { left: `${it.vec[0]}%`, top: `${it.vec[1]}%`, transform: 'translate(-50%, -50%)', opacity: it.life, ...(it.exiting ? { pointerEvents: 'none' as const } : {}) }, false, it.exiting))}
          </div>
        </div>
      ) : (
        <div className={s.stage} data-zoom-surface="map">
          <RenderCanvas cameraPosition={[0, 0, 3]} paused={!visible}>
            <MapScene data={shownData} mode={mode} hour={hour} quality={quality} selected={selected} markerRefs={markerRefs} />
          </RenderCanvas>
          <div className={s.overlay}>
            {shownData.sites.map((site) => marker(site, { visibility: 'hidden', transform: 'translate(-50%, -100%)' }, true))}
          </div>
        </div>
      )}

      {shownData.flows.length > 0 ? (
        <ul className={s.legend} aria-label={t('流れの量（現在の時刻）')} data-testid="flow-legend">
          {shownData.flows.map((f) => (
            <li key={f.id} className={s.legendItem}>
              <span className={s.swatch} style={{ backgroundColor: flowColor(f.kind) }} aria-hidden="true" />
              <Text size={200}>{f.label}: {f.fromSite.name} → {f.toSite.name}　{flowRate(f, hour)} {f.unit}</Text>
            </li>
          ))}
        </ul>
      ) : hasSites ? (
        <Text size={200}>{t('流れ（entities.json の flows）のデータがないため、流れの粒子は表示していません。')}</Text>
      ) : null}
    </Panel>
  );
}
