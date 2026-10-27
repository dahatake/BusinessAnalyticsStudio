// ガントチャート（FR-007 Feature ごとの工程）。Feature を選ぶと、その Feature の工程を強調し、
// 各工程の開始日・終了日・担当（誰が）・作業内容（何を）を表示する。工程にフォーカスまたはカーソルを合わせても同じ内容を示す。
// FR-022: 2D と 2.5D（斜め上から見た奥行き付きの描画）を切り替えられる。切り替えても工程の件数・期間・選択は変わらない。
// FR-035: 下位の工程を持つ工程は、展開すると下位の工程が出て、折りたたむと隠れる。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { ModeRadio } from '../view/ModeRadio';
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import { flattenTree, type TreeRow } from '../plan/hierarchy';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { Panel } from '../components/Panel';
import { useHighlightClass } from '../components/highlight';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { RelatedMini } from '../components/RelatedMini';
import { EmptyView, LoadingView } from '../components/StateViews';
import { buildGantt, formatPeriod, type GanttTask } from '../plan/model';
import { usePackStore } from '../store/pack';
import { useProjectTasks } from '../store/datacatalog';
import { useProjects } from '../store/projects';
import { registerTestHook } from '../testing/hook';

const useStyles = makeStyles({
  scroll: { overflowX: 'auto', flexShrink: 0 },
  chart: { display: 'flex', flexDirection: 'column', minWidth: '640px' },
  row: { display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', alignItems: 'center', minHeight: '36px' },
  months: { position: 'relative', height: '24px', borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  month: { position: 'absolute', top: 0, paddingInlineStart: tokens.spacingHorizontalXS, borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  featureRow: { backgroundColor: tokens.colorNeutralBackground2, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  featureSelected: { backgroundColor: tokens.colorBrandBackground2 },
  featureButton: { justifyContent: 'flex-start', textAlign: 'start', whiteSpace: 'normal', height: 'auto', minHeight: '32px', fontWeight: tokens.fontWeightSemibold },
  taskLabel: { paddingInlineStart: tokens.spacingHorizontalXL, paddingInlineEnd: tokens.spacingHorizontalS },
  track: { position: 'relative', height: '28px' },
  bar: {
    position: 'absolute',
    // 当たり判定は幅・高さとも 24px 以上（NFR-A11Y-009 AC-485・PARAM-040）
    top: '2px',
    height: '24px',
    minWidth: '24px',
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground5,
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  barRelated: { backgroundColor: tokens.colorBrandBackground2Pressed, border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}` },
  barSelected: { backgroundColor: tokens.colorBrandBackground, border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  info: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  taskLabelCell: { display: 'flex', alignItems: 'center', paddingInlineEnd: tokens.spacingHorizontalS, minWidth: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  chip: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  chipSelected: { backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  siteList: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  siteChip: {
    cursor: 'pointer',
    minHeight: '28px',
    paddingInline: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  canvas: { width: '100%', maxWidth: '960px', height: 'auto', border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
});

type View = '2d' | '2.5d';
type Hl = 'selected' | 'related' | undefined;
const parentOfTask = (g: GanttTask): string | undefined => (g.task as { parentId?: string | null }).parentId ?? undefined;
const taskIdOf = (g: GanttTask): string => g.task.id;

/** 2.5D の描画: 工程を、時間軸に沿った奥行き付きの棒（上面・側面つき）として斜めから描く。行の並びと色は 2D と同じ */
function drawGantt25D(canvas: HTMLCanvasElement, rows: ReadonlyArray<{ g: GanttTask; depth: number; hl: Hl }>): void {
  const rowH = 30;
  const left = 190;
  const W = 900;
  const H = Math.max(120, rows.length * rowH + 60);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  // 色・フォントは、テーマの CSS 変数（tokens）を読む。テーマの切り替えに追従する
  const cs = getComputedStyle(canvas);
  const css = (token: string, fallback = 'CanvasText'): string => {
    const m = /var\((--[^,)]+)/.exec(token);
    return (m ? cs.getPropertyValue(m[1] ?? '').trim() : token.trim()) || fallback;
  };
  const cBg = css(tokens.colorNeutralBackground2);
  const cGrid = css(tokens.colorNeutralStroke1);
  const cText = css(tokens.colorNeutralForeground1);
  const palette = {
    selected: { front: css(tokens.colorBrandBackground), top: css(tokens.colorBrandBackgroundHover), side: css(tokens.colorBrandBackgroundPressed) },
    related: { front: css(tokens.colorBrandBackground2Pressed), top: css(tokens.colorBrandBackground2), side: css(tokens.colorBrandStroke1) },
    plain: { front: css(tokens.colorNeutralBackground5), top: css(tokens.colorNeutralBackground4), side: css(tokens.colorNeutralStroke1) },
  };
  ctx.fillStyle = cBg;
  ctx.fillRect(0, 0, W, H);
  const trackW = W - left - 40;
  const dx = 10;
  const dy = -8;
  // 床の格子（奥行きの目安）
  ctx.strokeStyle = cGrid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = left + (trackW * i) / 10;
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x + dx * 2, 12); ctx.lineTo(x + dx * 2, H - 20); ctx.stroke();
  }
  ctx.font = `${css(tokens.fontSizeBase200, '12px')} ${css(tokens.fontFamilyBase, 'sans-serif')}`;
  rows.forEach(({ g, depth, hl }, i) => {
    const y = 30 + i * rowH;
    ctx.fillStyle = cText;
    ctx.textBaseline = 'middle';
    ctx.fillText(g.task.title.slice(0, 16), 10 + depth * 14, y + 8);
    if (g.startDay === undefined) return;
    const x = left + (g.leftPct / 100) * trackW;
    const w = Math.max(6, (g.widthPct / 100) * trackW);
    const { front, top, side } = hl === 'selected' ? palette.selected : hl === 'related' ? palette.related : palette.plain;
    ctx.fillStyle = front; ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w + dx, y + 16 + dy); ctx.lineTo(x + w, y + 16); ctx.closePath(); ctx.fill();
  });
}

function GanttScreen() {
  const t = useT();
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const [featureId, setFeatureId] = useState<string | undefined>();
  const [focusId, setFocusId] = useState<string | undefined>();
  const [hoverId, setHoverId] = useState<string | undefined>();
  // 2D/2.5D は見出しの「ビュー」の 2D/3D と同じ状態（FR-217 AC-507。2.5D がこの画面の 3D 相当の表現）。ここの切替も同じ状態を変える
  const cv = useComponentView('gantt');
  const view: View = cv.mode === '3d' ? '2.5d' : '2d';
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { graph, selectedIds, related, select, clear } = useSelection();
  const bind = useEntityBinding('gantt');
  const hl = useHighlightClass();

  const features = data?.plan.features;
  // plan の tasks は、顧客パックの tasks に Project 内の追加分（FR-162）を合わせたもの。schema/plan.json は変えない
  const packTasks = data?.plan.tasks;
  const extraTasks = useProjectTasks(useProjects((x) => x.openId));
  const tasks = useMemo((): typeof packTasks => (packTasks ? [...packTasks, ...extraTasks.map((t) => ({ id: t.id, createdBy: 'human' as const, title: t.title, work: t.description }) as NonNullable<typeof packTasks>[number])] : undefined), [packTasks, extraTasks]);
  const model = useMemo(() => buildGantt(features ?? [], tasks ?? []), [features, tasks]);
  const taskIdSet = useMemo(() => new Set((tasks ?? []).map((t) => t.id)), [tasks]);
  const selectedTaskId = selectedIds.find((id) => taskIdSet.has(id));
  const taskId = selectedTaskId;
  const toggle = (id: string): void => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // FR-035: 下位の工程は、上位の工程を展開したときだけ出す（既定は展開）
  const groupRows = useMemo(() => model.groups.map((g) => ({ g, rows: flattenTree(g.tasks, taskIdOf, parentOfTask, collapsed) })), [model, collapsed]);
  // 表示中の項目（t.view.state。2D と 2.5D で同じ工程を描く）
  const shownTaskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks]);
  usePublishViewItems('gantt', shownTaskIds);
  const orphanRows = useMemo(() => flattenTree(model.orphans, taskIdOf, parentOfTask, collapsed), [model, collapsed]);

  const highlight = (g: GanttTask): Hl =>
    selectedIds.includes(g.task.id) ? 'selected'
      : (featureId !== undefined && g.task.featureId === featureId) || (related?.has(g.task.id) && selectedIds.length > 0) ? 'related' : undefined;

  useEffect(() => {
    registerTestHook('gantt', {
      tasks: () => (tasks ?? []).map((t) => ({
        id: t.id, start: t.start ?? '', end: t.end ?? '',
        selected: selectedIds.includes(t.id) || (selectedTaskId === undefined && featureId !== undefined && t.featureId === featureId),
      })),
    });
  }, [tasks, selectedIds, selectedTaskId, featureId]);

  useEffect(() => {
    if (view !== '2.5d' || !canvasRef.current) return;
    const all = [...groupRows.flatMap((x) => x.rows), ...orphanRows];
    drawGantt25D(canvasRef.current, all.map((r) => ({ g: r.item, depth: r.depth, hl: highlight(r.item) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groupRows, orphanRows, selectedIds, related, featureId, data]);

  if (!data) return <LoadingView label={t('工程を読み込み中')} />;

  const sites = data.entities.entities.filter((e) => e.type === 'site');

  const featureTitle = new Map(data.plan.features.map((f) => [f.id, f.title]));
  const issueTitle = new Map(data.issues.issues.map((i) => [i.id, i.title]));
  const selectedTasks = model.groups.find((g) => g.feature.id === featureId)?.tasks ?? [];
  const allGanttTasks = [...model.groups.flatMap((g) => g.tasks), ...model.orphans];
  const byId = new Map(allGanttTasks.map((g) => [g.task.id, g]));
  const activeId = focusId ?? hoverId ?? taskId ?? selectedTasks[0]?.task.id;
  const active = activeId ? byId.get(activeId)?.task : undefined;
  const otherSelected = selectedIds.filter((id) => !taskIdSet.has(id));

  const taskRow = ({ item: g, depth, hasChildren, expanded }: TreeRow<GanttTask>) => {
    const h = highlight(g);
    const props = bind(g.task.id);
    const tokens_ = (props['data-highlight'] ?? '').split(' ').filter(Boolean);
    if (h === 'related' && !tokens_.includes('related') && !tokens_.includes('selected')) tokens_.push('related');
    return (
      <div
        key={g.task.id}
        role="row"
        className={s.row}
        {...props}
        data-highlight={tokens_.join(' ') || undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth + 1}
        onClick={(e) => { props.onClick?.(e); setFeatureId(g.task.featureId); }}
        tabIndex={-1}
        onFocus={() => setFocusId(g.task.id)}
        onBlur={() => setFocusId(undefined)}
        onMouseEnter={() => { props.onMouseEnter?.(); setHoverId(g.task.id); }}
        onMouseLeave={() => { props.onMouseLeave?.(); setHoverId(undefined); }}
      >
        <div role="gridcell" className={s.taskLabelCell} style={{ paddingInlineStart: `calc(${depth} * ${tokens.spacingHorizontalXL})` }}>
          {hasChildren ? (
            <Button
              size="small" appearance="subtle" icon={expanded ? <ChevronDown16Regular aria-hidden /> : <ChevronRight16Regular aria-hidden />}
              aria-label={expanded ? `${g.task.title} を折りたたむ` : `${g.task.title} を展開`}
              onClick={(e) => { e.stopPropagation(); toggle(g.task.id); }}
            />
          ) : null}
          <Text size={300} className={s.taskLabel}>{g.task.title}</Text>
        </div>
        <div role="gridcell" className={s.track}>
          {g.startDay === undefined ? (
            <Text size={200}>{t('日付なし')}</Text>
          ) : (
            <button
              type="button"
              className={mergeClasses(s.bar, h === 'related' && s.barRelated, h === 'selected' && s.barSelected)}
              style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}
              aria-label={`${g.task.title}（${formatPeriod(g.task)}）`}
              aria-pressed={h === 'selected'}
              onFocus={() => setFocusId(g.task.id)}
              onBlur={() => setFocusId(undefined)}
              onMouseEnter={() => setHoverId(g.task.id)}
              onMouseLeave={() => setHoverId(undefined)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <Panel
      testId="component-gantt"
      title={t('ガントチャート')}
      description={t('Feature ごとの工程（いつ・誰が・何を）を時間軸で確かめます。Feature を選ぶと、その工程を強調します。')}
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="gantt" />
      {data.plan.tasks.length === 0 && data.plan.features.length === 0 ? (
        <EmptyView message={t('工程がありません。')} />
      ) : (
        <>
          {/* 見出しの「ビュー」と同じ 1 つの切替。2.5D は canvas 2D で描くので WebGL2 がなくても選べる（FR-022・FR-217 AC-507） */}
          <ModeRadio viewKey="gantt" labels={{ '3d': '2.5D' }} />
          {otherSelected.length > 0 ? (
            <div className={s.chips} role="status" aria-label={t('選択中の項目')}>
              <Text weight="semibold">{t('選択中:')}</Text>
              {otherSelected.map((id) => {
                const p = bind(id);
                const on = (p['data-highlight'] ?? '').includes('selected');
                return <span key={id} {...p} className={mergeClasses(s.chip, on && s.chipSelected)}>{graph?.node(id)?.label ?? id}</span>;
              })}
            </div>
          ) : null}
          {view === '2.5d' ? (
            <canvas ref={canvasRef} className={s.canvas} role="img" aria-label={t('ガントチャート（2.5D）。工程を奥行きのある棒で表します。')} />
          ) : null}
          <div className={s.scroll} role="region" aria-label={t('ガントチャートの時間軸')} tabIndex={0}>
            <div className={s.chart} role="treegrid" aria-label={t('ガントチャート（Feature・工程）')}>
              <div className={s.row} role="row">
                <div role="columnheader" style={{ display: 'contents' }}><Text size={200} weight="semibold">{t('Feature・工程')}</Text></div>
                <div className={s.months} aria-hidden>
                  {model.months.map((m) => <Text key={m.label} size={200} className={s.month} style={{ left: `${m.leftPct}%` }}>{m.label}</Text>)}
                </div>
              </div>
              {groupRows.map(({ g, rows }) => {
                const on = g.feature.id === featureId;
                return (
                  <div key={g.feature.id}>
                    <div
                      role="row"
                      className={mergeClasses(s.row, s.featureRow, on && s.featureSelected)}
                      data-entity-id={g.feature.id}
                      data-highlight={on ? 'selected' : undefined}
                      onClick={() => { setFeatureId(g.feature.id); if (selectedTaskId !== undefined) clear({ origin: 'gantt' }); }}
                    >
                      <div role="gridcell" style={{ display: 'contents' }}>
                      <Button
                        appearance="transparent"
                        className={s.featureButton}
                        aria-pressed={on}
                        onClick={() => { setFeatureId(g.feature.id); if (selectedTaskId !== undefined) clear({ origin: 'gantt' }); }}
                      >
                        {g.feature.title}
                      </Button>
                      <Text size={200}>{g.tasks.length} 件の工程</Text>
                      {(g.feature.issueIds ?? []).length > 0 ? (
                        <Text size={200}>課題: {(g.feature.issueIds ?? []).map((id) => issueTitle.get(id) ?? id).join('、')}</Text>
                      ) : null}
                      </div>
                    </div>
                    {rows.map(taskRow)}
                  </div>
                );
              })}
              {model.orphans.length > 0 ? (
                <div>
                  <div role="row" className={mergeClasses(s.row, s.featureRow)}><div role="gridcell" style={{ display: 'contents' }}><Text weight="semibold" className={s.taskLabel}>{t('Feature に属さない工程')}</Text></div></div>
                  {orphanRows.map(taskRow)}
                </div>
              ) : null}
            </div>
          </div>

          <section className={s.info} data-testid="task-info" aria-live="polite" aria-label={t('工程の詳細')}>
            {active ? (
              <>
                <Text as="h3" size={400} weight="semibold">{active.title}</Text>
                <Text>Feature: {(active.featureId && featureTitle.get(active.featureId)) || t('なし')}</Text>
                <Text>開始日: {active.start ?? t('未設定')}　終了日: {active.end ?? t('未設定')}</Text>
                <Text>担当: {active.owner ?? t('未設定')}</Text>
                <Text>作業内容: {active.work ?? t('未設定')}</Text>
              </>
            ) : (
              <Text>{t('Feature を選ぶか、工程にカーソルを合わせる（フォーカスする）と、開始日・終了日・担当・作業内容を表示します。')}</Text>
            )}
          </section>

          {featureId !== undefined ? (
            <section className={s.section} data-testid="feature-tasks" aria-label={t('選んだ Feature の工程')}>
              <Text as="h3" size={400} weight="semibold">{featureTitle.get(featureId) ?? featureId} の工程</Text>
              {selectedTasks.length === 0 ? <Text>{t('この Feature の工程はありません。')}</Text> : (
                <Table aria-label={t('工程の一覧')} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>{t('工程')}</TableHeaderCell>
                      <TableHeaderCell>{t('開始日')}</TableHeaderCell>
                      <TableHeaderCell>{t('終了日')}</TableHeaderCell>
                      <TableHeaderCell>{t('担当')}</TableHeaderCell>
                      <TableHeaderCell>{t('作業内容')}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTasks.map(({ task }) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>{task.start ?? t('未設定')}</TableCell>
                        <TableCell>{task.end ?? t('未設定')}</TableCell>
                        <TableCell>{task.owner ?? t('未設定')}</TableCell>
                        <TableCell>{task.work ?? t('未設定')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          ) : null}
        </>
      )}
      {sites.length > 0 ? (
        <section className={s.section} data-testid="gantt-sites" aria-label={t('工程の実施拠点')}>
          <Text as="h3" size={400} weight="semibold">{t('実施拠点')}</Text>
          <div className={s.siteList}>
            {sites.map((site) => {
              const p = bind(site.id);
              return (
                <button key={site.id} type="button" className={mergeClasses(s.siteChip, hl(p['data-highlight']))} {...p}>{site.name}</button>
              );
            })}
          </div>
        </section>
      ) : null}
      <RelatedMini origin="gantt" />
    </Panel>
  );
}

export { GanttScreen };
