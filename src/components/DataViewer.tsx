// データビュアー（FR-169）。データエンティティを 2D または 3D で見る。拡大・縮小（ホイール・ピンチ・ボタン・キー）で、
// 鳥観図（塊）→ エンティティ（名称・説明）→ 列（列名・型）と詳細度が変わる。2D と 3D を切り替えても、選択・倍率・絞り込みは store に残る。
// NFR-A11Y-007: キーボードだけで移動・選択・拡大縮小・全体表示ができ、変化は aria-live で通知する。3D が使えない環境では 2D にし、表の一覧を常に持つ。
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Radio, RadioGroup, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { NO_COLUMNS_LABEL, KIND_LABELS } from '../datacatalog/model';
import {
  DETAIL_LABELS, NO_3D_REASON, filterEntities, groupClusters, is3DAvailable, layoutViewer, zoomKeyAction,
  type ViewerEntity,
} from '../datacatalog/viewer';
import { useDataViewer } from '../store/dataViewer';

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

/** 3D を使えるかの判定（WebGPU・WebGL2 のどちらも使えなければ使えない。FR-065 の判定とは別に、ここでは表示モードの可否だけ見る） */
let cached3D: boolean | undefined;
export function detect3D(): boolean {
  if (cached3D !== undefined) return cached3D;
  let hasWebGPU = false; let hasWebGL2 = false;
  try { hasWebGPU = !!(navigator as unknown as { gpu?: unknown }).gpu; } catch { hasWebGPU = false; }
  try { hasWebGL2 = !!document.createElement('canvas').getContext('webgl2'); } catch { hasWebGL2 = false; }
  cached3D = is3DAvailable({ hasWebGPU, hasWebGL2 });
  return cached3D;
}

export interface DataViewerProps {
  entities: readonly ViewerEntity[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** テスト用: 3D の可否を差し替える */
  available3D?: boolean;
}

export function DataViewer({ entities, selectedKey, onSelect, available3D }: DataViewerProps) {
  const s = useStyles();
  const { mode, zoom, level, filter, cluster } = useDataViewer();
  const setMode = useDataViewer((x) => x.setMode);
  const zoomBy = useDataViewer((x) => x.zoomBy);
  const step = useDataViewer((x) => x.step);
  const home = useDataViewer((x) => x.home);
  const setFilter = useDataViewer((x) => x.setFilter);
  const setCluster = useDataViewer((x) => x.setCluster);
  const can3D = available3D ?? detect3D();
  const effectiveMode = can3D ? mode : '2d';
  const root = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState('');

  const shown = useMemo(() => filterEntities(entities, filter), [entities, filter]);
  const clusters = useMemo(() => groupClusters(shown), [shown]);
  const layout = useMemo(() => layoutViewer(clusters), [clusters]);
  const selected = entities.find((e) => e.key === selectedKey);

  // 変化の通知（aria-live）。選択と詳細度が変わったときに、文字で知らせる
  const lastLevel = useRef(level);
  const lastSel = useRef(selected?.name);
  useEffect(() => {
    const msgs: string[] = [];
    if (lastLevel.current !== level) msgs.push(`詳細度が ${DETAIL_LABELS[level]} になりました。`);
    if (lastSel.current !== selected?.name && selected) msgs.push(`${selected.name} を選択しました。列 ${selected.columns.length} 件。`);
    lastLevel.current = level; lastSel.current = selected?.name;
    if (msgs.length) setLive(msgs.join(' '));
  }, [level, selected]);

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
      if (t) { ev.preventDefault(); t.click(); }
      return;
    }
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1
      : ['ArrowDown', 'ArrowRight'].includes(ev.key) ? Math.min(items.length - 1, i + 1) : ['ArrowUp', 'ArrowLeft'].includes(ev.key) ? Math.max(0, i < 0 ? 0 : i - 1) : -1;
    if (next >= 0 && items[next]) { ev.preventDefault(); items[next]!.focus(); }
  };

  const minW = Math.round(Math.min(360, Math.max(96, 120 * Math.sqrt(zoom))));
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))` };
  const entityCard = (e: ViewerEntity) => {
    const on = e.key === selectedKey;
    return (
      <div
        key={e.key} role="option" aria-selected={on} tabIndex={0} data-viewer-entity={e.name} className={mergeClasses(s.card, on && s.on)} onClick={() => onSelect(e.key)}
      >
        <Text weight="semibold">{e.name}{on ? '（選択中）' : ''}</Text>
        <Text size={200}>{e.description}</Text>
        {level === 'column' ? (
          e.columns.length === 0
            ? <Text size={200} data-viewer-nocolumns>{NO_COLUMNS_LABEL}</Text>
            : <ul className={s.cols}>{e.columns.map((c, i) => <li key={i} tabIndex={-1} data-viewer-column={c.name}>{c.name}{c.type ? `（${c.type}）` : ''}</li>)}</ul>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={root} className={s.root} data-testid="data-viewer" data-view-mode={effectiveMode} data-detail-level={level} data-zoom={zoom.toFixed(3)}
      role="group" aria-label="データビュアー" aria-roledescription="データビュアー。+ − で拡大縮小、0 で全体表示、矢印キーで移動、Enter で選択" tabIndex={0} onKeyDown={onKeyDown}
    >
      <div className={s.bar}>
        <RadioGroup layout="horizontal" aria-label="表示モード" value={effectiveMode} onChange={(_, d) => { if (d.value === '3d' && !can3D) return; setMode(d.value as '2d' | '3d'); }}>
          <Radio value="2d" label="2D" />
          <Radio value="3d" label="3D" disabled={!can3D} />
        </RadioGroup>
        <Button size="small" aria-label="拡大" onClick={() => step(1)}>＋</Button>
        <Button size="small" aria-label="縮小" onClick={() => step(-1)}>－</Button>
        <Button size="small" aria-label="全体表示に戻す" onClick={() => home()}>全体表示</Button>
        <label>
          <span>絞り込み</span>{' '}
          <Input type="search" aria-label="絞り込み" value={filter} onChange={(_, d) => setFilter(d.value)} placeholder="エンティティ名・列名" />
        </label>
        <Text role="status" size={200}>詳細度: {DETAIL_LABELS[level]}／倍率: {zoom.toFixed(2)} 倍</Text>
      </div>
      {!can3D ? <Text role="status" data-testid="viewer-no3d-reason" size={200}>{NO_3D_REASON}</Text> : null}
      <div className={s.hidden} role="status" aria-live="polite" data-testid="viewer-live">{live}</div>

      {shown.length === 0 ? (
        <Text role="status">{entities.length === 0 ? '表示するデータエンティティがありません。' : '絞り込みに合うデータエンティティがありません。'}</Text>
      ) : effectiveMode === '3d' ? (
        <Suspense fallback={<Text role="status">3D を読み込んでいます。</Text>}>
          <DataViewer3D
            clusters={clusters} layout={layout} level={level} zoom={zoom} selectedKey={selectedKey} activeCluster={cluster} onSelect={onSelect} onCluster={setCluster}
          />
        </Suspense>
      ) : (
        <div className={s.stage} role="listbox" aria-label={`データエンティティ（${DETAIL_LABELS[level]}）`}>
          {level === 'bird' ? (
            <div className={s.grid} style={gridStyle}>
              {clusters.map((c) => (
                <div
                  key={c.name} role="option" aria-selected={cluster === c.name} tabIndex={0} data-viewer-cluster={c.name} className={mergeClasses(s.card, cluster === c.name && s.on)}
                  onClick={() => setCluster(c.name)}
                >
                  <Text weight="semibold">{c.name}</Text>
                  <Text size={200}>{c.entities.length} 件のエンティティ</Text>
                </div>
              ))}
            </div>
          ) : (
            clusters.map((c) => (
              <div key={c.name} className={s.group} role="group" aria-label={`塊: ${c.name}`} data-viewer-cluster-group={c.name}>
                <Text weight="semibold" size={200}>{c.name}</Text>
                <div className={s.grid} style={gridStyle}>{c.entities.map(entityCard)}</div>
              </div>
            ))
          )}
        </div>
      )}

      <details>
        <summary>一覧（表）で確認する（{shown.length} 件）</summary>
        <div className={s.scroll}>
          <table aria-label="データビュアーの一覧（表）" data-testid="viewer-table">
            <thead>
              <tr>
                {['塊', 'エンティティ', '説明', '区分', '列', '関連するユースケース'].map((h) => <th key={h} scope="col" className={s.cell}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key} data-viewer-row={e.name}>
                  <td className={s.cell}>{e.cluster}</td>
                  <th scope="row" className={s.cell}>{e.name}</th>
                  <td className={s.cell}>{e.description}</td>
                  <td className={s.cell}>{e.category || '（取り込みなし）'}</td>
                  <td className={s.cell}>{e.columns.length === 0 ? NO_COLUMNS_LABEL : e.columns.map((c) => (c.type ? `${c.name}（${c.type}）` : c.name)).join('、')}</td>
                  <td className={s.cell}>{e.relatedUseCases.length === 0 ? '（なし）' : e.relatedUseCases.map((r) => `${r.name}（${KIND_LABELS[r.kind]}）`).join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
