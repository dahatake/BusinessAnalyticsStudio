// ガントチャート（FR-007 Feature ごとの工程）。Feature を選ぶと、その Feature の工程を強調し、
// 各工程の開始日・終了日・担当（誰が）・作業内容（何を）を表示する。工程にフォーカスまたはカーソルを合わせても同じ内容を示す。
// FR-022: 2D と 2.5D（斜め上から見た奥行き付きの描画）を切り替えられる。切り替えても工程の件数・期間・選択は変わらない。
// FR-035: 下位の工程を持つ工程は、展開すると下位の工程が出て、折りたたむと隠れる。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { flattenTree, type TreeRow } from '../plan/hierarchy';
import { useEntityBinding, useSelection } from '../selection/hooks';
import { Panel } from '../components/Panel';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { RelatedMini } from '../components/RelatedMini';
import { EmptyView, LoadingView } from '../components/StateViews';
import { buildGantt, formatPeriod, type GanttTask } from '../plan/model';
import { usePackStore } from '../store/pack';
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
    top: '4px',
    height: '20px',
    minWidth: '8px',
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
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(0, 0, W, H);
  const trackW = W - left - 40;
  const dx = 10;
  const dy = -8;
  // 床の格子（奥行きの目安）
  ctx.strokeStyle = '#c8d0da';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = left + (trackW * i) / 10;
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x + dx * 2, 12); ctx.lineTo(x + dx * 2, H - 20); ctx.stroke();
  }
  ctx.font = '12px sans-serif';
  rows.forEach(({ g, depth, hl }, i) => {
    const y = 30 + i * rowH;
    ctx.fillStyle = '#243447';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.task.title.slice(0, 16), 10 + depth * 14, y + 8);
    if (g.startDay === undefined) return;
    const x = left + (g.leftPct / 100) * trackW;
    const w = Math.max(6, (g.widthPct / 100) * trackW);
    const front = hl === 'selected' ? '#0f6cbd' : hl === 'related' ? '#479ef5' : '#8a9bb0';
    const top = hl === 'selected' ? '#4f9bde' : hl === 'related' ? '#9cc9f7' : '#b9c5d3';
    const side = hl === 'selected' ? '#0a4a82' : hl === 'related' ? '#2b72b8' : '#5d6e82';
    ctx.fillStyle = front; ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w + dx, y + 16 + dy); ctx.lineTo(x + w, y + 16); ctx.closePath(); ctx.fill();
  });
}

function GanttScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const [featureId, setFeatureId] = useState<string | undefined>();
  const [focusId, setFocusId] = useState<string | undefined>();
  const [hoverId, setHoverId] = useState<string | undefined>();
  const [view, setView] = useState<View>('2d');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { graph, selectedIds, related, select, clear } = useSelection();
  const bind = useEntityBinding('gantt');

  const features = data?.plan.features;
  const tasks = data?.plan.tasks;
  const model = useMemo(() => buildGantt(features ?? [], tasks ?? []), [features, tasks]);
  const taskIdSet = useMemo(() => new Set((tasks ?? []).map((t) => t.id)), [tasks]);
  const selectedTaskId = selectedIds.find((id) => taskIdSet.has(id));
  const taskId = selectedTaskId;
  const toggle = (id: string): void => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // FR-035: 下位の工程は、上位の工程を展開したときだけ出す（既定は展開）
  const groupRows = useMemo(() => model.groups.map((g) => ({ g, rows: flattenTree(g.tasks, taskIdOf, parentOfTask, collapsed) })), [model, collapsed]);
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

  if (!data) return <LoadingView label="工程を読み込み中" />;

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
      >
        <div className={s.taskLabelCell} style={{ paddingInlineStart: `${depth * 20}px` }}>
          {hasChildren ? (
            <Button
              size="small" appearance="subtle" icon={expanded ? <ChevronDown16Regular aria-hidden /> : <ChevronRight16Regular aria-hidden />}
              aria-label={expanded ? `${g.task.title} を折りたたむ` : `${g.task.title} を展開`}
              onClick={(e) => { e.stopPropagation(); toggle(g.task.id); }}
            />
          ) : null}
          <Text size={300} className={s.taskLabel}>{g.task.title}</Text>
        </div>
        <div className={s.track}>
          {g.startDay === undefined ? (
            <Text size={200}>日付なし</Text>
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
      title="ガントチャート"
      description="Feature ごとの工程（いつ・誰が・何を）を時間軸で確かめます。Feature を選ぶと、その工程を強調します。"
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="gantt" />
      {data.plan.tasks.length === 0 && data.plan.features.length === 0 ? (
        <EmptyView message="工程がありません。" />
      ) : (
        <>
          <Field label="表示">
            <RadioGroup layout="horizontal" value={view} onChange={(_, d) => setView(d.value as View)}>
              <Radio value="2d" label="2D" />
              <Radio value="2.5d" label="2.5D" />
            </RadioGroup>
          </Field>
          {otherSelected.length > 0 ? (
            <div className={s.chips} role="status" aria-label="選択中の項目">
              <Text weight="semibold">選択中:</Text>
              {otherSelected.map((id) => {
                const p = bind(id);
                const on = (p['data-highlight'] ?? '').includes('selected');
                return <span key={id} {...p} className={mergeClasses(s.chip, on && s.chipSelected)}>{graph?.node(id)?.label ?? id}</span>;
              })}
            </div>
          ) : null}
          {view === '2.5d' ? (
            <canvas ref={canvasRef} className={s.canvas} role="img" aria-label="ガントチャート（2.5D）。工程を奥行きのある棒で表します。" />
          ) : null}
          <div className={s.scroll} role="region" aria-label="ガントチャートの時間軸" tabIndex={0}>
            <div className={s.chart}>
              <div className={s.row}>
                <Text size={200} weight="semibold">Feature・工程</Text>
                <div className={s.months} aria-hidden>
                  {model.months.map((m) => <Text key={m.label} size={200} className={s.month} style={{ left: `${m.leftPct}%` }}>{m.label}</Text>)}
                </div>
              </div>
              {groupRows.map(({ g, rows }) => {
                const on = g.feature.id === featureId;
                return (
                  <div key={g.feature.id}>
                    <div
                      className={mergeClasses(s.row, s.featureRow, on && s.featureSelected)}
                      data-entity-id={g.feature.id}
                      data-highlight={on ? 'selected' : undefined}
                      onClick={() => { setFeatureId(g.feature.id); if (selectedTaskId !== undefined) clear({ origin: 'gantt' }); }}
                    >
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
                    {rows.map(taskRow)}
                  </div>
                );
              })}
              {model.orphans.length > 0 ? (
                <div>
                  <div className={mergeClasses(s.row, s.featureRow)}><Text weight="semibold" className={s.taskLabel}>Feature に属さない工程</Text></div>
                  {orphanRows.map(taskRow)}
                </div>
              ) : null}
            </div>
          </div>

          <section className={s.info} data-testid="task-info" aria-live="polite" aria-label="工程の詳細">
            {active ? (
              <>
                <Text as="h3" size={400} weight="semibold">{active.title}</Text>
                <Text>Feature: {(active.featureId && featureTitle.get(active.featureId)) || 'なし'}</Text>
                <Text>開始日: {active.start ?? '未設定'}　終了日: {active.end ?? '未設定'}</Text>
                <Text>担当: {active.owner ?? '未設定'}</Text>
                <Text>作業内容: {active.work ?? '未設定'}</Text>
              </>
            ) : (
              <Text>Feature を選ぶか、工程にカーソルを合わせる（フォーカスする）と、開始日・終了日・担当・作業内容を表示します。</Text>
            )}
          </section>

          {featureId !== undefined ? (
            <section className={s.section} data-testid="feature-tasks" aria-label="選んだ Feature の工程">
              <Text as="h3" size={400} weight="semibold">{featureTitle.get(featureId) ?? featureId} の工程</Text>
              {selectedTasks.length === 0 ? <Text>この Feature の工程はありません。</Text> : (
                <Table aria-label="工程の一覧" size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>工程</TableHeaderCell>
                      <TableHeaderCell>開始日</TableHeaderCell>
                      <TableHeaderCell>終了日</TableHeaderCell>
                      <TableHeaderCell>担当</TableHeaderCell>
                      <TableHeaderCell>作業内容</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTasks.map(({ task }) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>{task.start ?? '未設定'}</TableCell>
                        <TableCell>{task.end ?? '未設定'}</TableCell>
                        <TableCell>{task.owner ?? '未設定'}</TableCell>
                        <TableCell>{task.work ?? '未設定'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          ) : null}
        </>
      )}
      <RelatedMini origin="gantt" />
    </Panel>
  );
}

export { GanttScreen };
