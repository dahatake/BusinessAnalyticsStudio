// ガントチャート（FR-007 Feature ごとの工程）。Feature を選ぶと、その Feature の工程を強調し、
// 各工程の開始日・終了日・担当（誰が）・作業内容（何を）を表示する。工程にフォーカスまたはカーソルを合わせても同じ内容を示す。
import { useEffect, useMemo, useState } from 'react';
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { RelatedMini } from '../components/RelatedMini';
import { EmptyView, LoadingView } from '../components/StateViews';
import { buildGantt, formatPeriod, type GanttTask } from '../plan/model';
import { usePackStore } from '../store/pack';
import { registerTestHook } from '../testing/hook';

const useStyles = makeStyles({
  scroll: { overflowX: 'auto' },
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
});

function GanttScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const [featureId, setFeatureId] = useState<string | undefined>();
  const [taskId, setTaskId] = useState<string | undefined>();
  const [focusId, setFocusId] = useState<string | undefined>();
  const [hoverId, setHoverId] = useState<string | undefined>();

  const features = data?.plan.features;
  const tasks = data?.plan.tasks;
  const model = useMemo(() => buildGantt(features ?? [], tasks ?? []), [features, tasks]);

  useEffect(() => {
    registerTestHook('gantt', {
      tasks: () => (tasks ?? []).map((t) => ({
        id: t.id, start: t.start ?? '', end: t.end ?? '',
        selected: t.id === taskId || (taskId === undefined && featureId !== undefined && t.featureId === featureId),
      })),
    });
  }, [tasks, taskId, featureId]);

  if (!data) return <LoadingView label="工程を読み込み中" />;

  const featureTitle = new Map(data.plan.features.map((f) => [f.id, f.title]));
  const selectedTasks = model.groups.find((g) => g.feature.id === featureId)?.tasks ?? [];
  const allGanttTasks = [...model.groups.flatMap((g) => g.tasks), ...model.orphans];
  const byId = new Map(allGanttTasks.map((g) => [g.task.id, g]));
  const activeId = focusId ?? hoverId ?? taskId ?? selectedTasks[0]?.task.id;
  const active = activeId ? byId.get(activeId)?.task : undefined;

  const highlight = (g: GanttTask): 'selected' | 'related' | undefined =>
    g.task.id === taskId ? 'selected' : featureId !== undefined && g.task.featureId === featureId ? 'related' : undefined;

  const taskRow = (g: GanttTask) => {
    const h = highlight(g);
    return (
      <div key={g.task.id} className={s.row}>
        <Text size={300} className={s.taskLabel}>{g.task.title}</Text>
        <div className={s.track}>
          {g.startDay === undefined ? (
            <Text size={200}>日付なし</Text>
          ) : (
            <button
              type="button"
              data-entity-id={g.task.id}
              data-highlight={h}
              className={mergeClasses(s.bar, h === 'related' && s.barRelated, h === 'selected' && s.barSelected)}
              style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}
              aria-label={`${g.task.title}（${formatPeriod(g.task)}）`}
              aria-pressed={h === 'selected'}
              onClick={() => { setFeatureId(g.task.featureId); setTaskId(g.task.id); }}
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
          <div className={s.scroll} role="region" aria-label="ガントチャートの時間軸" tabIndex={0}>
            <div className={s.chart}>
              <div className={s.row}>
                <Text size={200} weight="semibold">Feature・工程</Text>
                <div className={s.months} aria-hidden>
                  {model.months.map((m) => <Text key={m.label} size={200} className={s.month} style={{ left: `${m.leftPct}%` }}>{m.label}</Text>)}
                </div>
              </div>
              {model.groups.map((g) => {
                const on = g.feature.id === featureId;
                return (
                  <div key={g.feature.id}>
                    <div
                      className={mergeClasses(s.row, s.featureRow, on && s.featureSelected)}
                      data-entity-id={g.feature.id}
                      data-highlight={on ? 'selected' : undefined}
                      onClick={() => { setFeatureId(g.feature.id); setTaskId(undefined); }}
                    >
                      <Button
                        appearance="transparent"
                        className={s.featureButton}
                        aria-pressed={on}
                        onClick={() => { setFeatureId(g.feature.id); setTaskId(undefined); }}
                      >
                        {g.feature.title}
                      </Button>
                      <Text size={200}>{g.tasks.length} 件の工程</Text>
                    </div>
                    {g.tasks.map(taskRow)}
                  </div>
                );
              })}
              {model.orphans.length > 0 ? (
                <div>
                  <div className={mergeClasses(s.row, s.featureRow)}><Text weight="semibold" className={s.taskLabel}>Feature に属さない工程</Text></div>
                  {model.orphans.map(taskRow)}
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
