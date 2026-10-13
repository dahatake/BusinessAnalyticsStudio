// 課題-解決策分析（FR-001 構造化表示、FR-002 区分、FR-003〜FR-005 の詳細、FR-006 生成 AI の価値、FR-038 サンキー図・マトリクス）。
// 左に課題（イシューツリー／MECE 表）と解決策、右に詳細パネルを置く。サンキー図・マトリクスは広く使うため詳細を下に置く。狭い画面では縦に積む。
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Badge, Button, Field, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular, CommentMultiple24Regular, Lightbulb24Regular } from '@fluentui/react-icons';
import { DetailPanel } from '../analysis/DetailPanel';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { RelatedMini } from '../components/RelatedMini';
import { packKeyOf } from '../discussion/model';
import { useDiscussionStore } from '../store/discussion';
import { useLayout } from '../store/layout';
import { MatrixView, SankeyView, SourceLinks, type FlowSelection } from '../analysis/FlowViews';
import {
  AUDIENCE_LABELS, buildFlow, buildMatrix, buildMeceGroups, buildTreeRows, filterIssues, filterSolutions, solutionIssueIds,
  type AudienceFilter, type Issue,
} from '../analysis/model';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { useSelectionStore } from '../store/selection';

type ViewMode = 'tree' | 'mece' | 'sankey' | 'matrix';

/** 選択状態は、すべてのビューと共通のストア（FR-024）。選択を起こしたビューとして、この名前を記録する */
const ORIGIN = 'issue-solution';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(240px, 2fr)', // 詳細は最小の幅（PARAM-034）を下回らない（NFR-UX-007 AC-235）
    columnGap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: tokens.spacingVerticalL },
  },
  layoutStacked: { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: tokens.spacingVerticalL },
  column: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL, minWidth: 0 },
  tree: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: tokens.spacingHorizontalS,
    minHeight: '32px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  chevron: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', flexShrink: 0 },
  rowBody: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, minWidth: 0 },
  badges: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXS, rowGap: tokens.spacingVerticalXXS },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  solutions: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyle: 'none' },
  solutionItem: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalXXS, cursor: 'pointer' },
  solutionButton: { justifyContent: 'flex-start', height: 'auto', textAlign: 'start', whiteSpace: 'normal', minHeight: '32px', flexGrow: 1 },
});

function IssueSummary({ issue }: { issue: Issue }) {
  const s = useStyles();
  return (
    <div className={s.rowBody}>
      <Text weight="semibold">{issue.title}</Text>
      {issue.hypothesis ? <Text size={300}>仮説: {issue.hypothesis}</Text> : null}
      <div className={s.badges}>
        <Badge appearance="tint" color={issue.audience === 'external' ? 'brand' : 'informative'}>{AUDIENCE_LABELS[issue.audience]}</Badge>
        {(issue.personas ?? []).map((p) => <Badge key={p} appearance="outline">{p}</Badge>)}
      </div>
    </div>
  );
}

function IssueSolutionScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const [mode, setMode] = useState<ViewMode>('tree');
  const [filter, setFilter] = useState<AudienceFilter>('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // 出典カードは、開いた時点の選択（owner）が主の選択のままのときだけ表示する（選択が変わったら閉じる）
  const [sourceRef, setSourceRef] = useState<{ owner: string | undefined; id: string } | undefined>();
  const treeRef = useRef<HTMLDivElement>(null);
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const { primaryId } = useSelection();
  const sourceId = sourceRef && sourceRef.owner === primaryId ? sourceRef.id : undefined;
  const setSourceId = (id: string | undefined) => setSourceRef(id ? { owner: primaryId, id } : undefined);

  const data = state.status === 'ready' ? state.pack.data : undefined;
  const allIssues = useMemo(() => data?.issues.issues ?? [], [data]);
  const allSolutions = useMemo(() => data?.issues.solutions ?? [], [data]);
  const visible = useMemo(() => filterIssues(allIssues, filter), [allIssues, filter]);
  const solutions = useMemo(() => filterSolutions(allSolutions, visible), [allSolutions, visible]);
  const rows = useMemo(() => buildTreeRows(allIssues, visible, collapsed), [allIssues, visible, collapsed]);
  const groups = useMemo(() => buildMeceGroups(allIssues, visible), [allIssues, visible]);
  const products = data?.products.products;
  const flow = useMemo(() => buildFlow(visible, solutions, products ?? []), [visible, solutions, products]);
  const matrix = useMemo(() => buildMatrix(visible, solutions, products ?? []), [visible, solutions, products]);

  if (!data) return <LoadingView label="課題を読み込み中" />

  const issueById = new Map(allIssues.map((i) => [i.id, i]));
  // 詳細は、共通の選択のうち最後に選んだ項目（課題または解決策のとき）を表示する
  const selectedIssue = primaryId ? issueById.get(primaryId) : undefined;
  const selectedSolution = primaryId ? allSolutions.find((x) => x.id === primaryId) : undefined;
  const detailSelection = selectedIssue
    ? ({ kind: 'issue', issue: selectedIssue } as const)
    : selectedSolution
      ? ({
        kind: 'solution', solution: selectedSolution, issue: issueById.get(selectedSolution.issueId),
        issues: solutionIssueIds(selectedSolution).map((id) => issueById.get(id)).filter((i): i is Issue => i !== undefined),
      } as const)
      : undefined;

  const openSolutionSource = (solutionId: string, srcId: string) => {
    useSelectionStore.getState().select(solutionId, { origin: ORIGIN });
    setSourceRef({ owner: solutionId, id: srcId });
  };
  const sourceMap = new Map(data.sources.sources.map((x) => [x.id, x]));
  const solutionMap = new Map(allSolutions.map((x) => [x.id, x]));
  const stacked = mode === 'sankey' || mode === 'matrix';
  // サンキー図・マトリクスは自前の強調を持つので、共通の選択のうち主の選択（課題または解決策）を渡す
  const flowSelection: FlowSelection | undefined = selectedIssue
    ? { kind: 'issue', id: selectedIssue.id }
    : selectedSolution ? { kind: 'solution', id: selectedSolution.id } : undefined;
  const flowProps = {
    selection: flowSelection,
    solutions: solutionMap,
    sources: sourceMap,
    onSelectIssue: (id: string) => useSelectionStore.getState().select(id, { origin: ORIGIN }),
    onSelectSolution: (id: string) => useSelectionStore.getState().select(id, { origin: ORIGIN }),
    onOpenSource: openSolutionSource,
  };
  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setExpanded = (id: string, expanded: boolean) => setCollapsed((prev) => {
    if (prev.has(id) === !expanded) return prev;
    const next = new Set(prev);
    if (expanded) next.delete(id); else next.add(id);
    return next;
  });

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, row: (typeof rows)[number]) => {
    const items = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    const at = items.indexOf(e.currentTarget);
    if (onEntityKey(e, row.issue.id, ORIGIN)) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); items[at + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[at - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && row.hasChildren) { e.preventDefault(); setExpanded(row.issue.id, true); }
    else if (e.key === 'ArrowLeft' && row.hasChildren) { e.preventDefault(); setExpanded(row.issue.id, false); }
  };

  const firstRowId = rows[0]?.issue.id;
  // 選択中の課題が見えている（rows にある）ときだけその行を Tab の入口にし、見えないときは先頭行にする
  const tabStopId = primaryId && rows.some((r) => r.issue.id === primaryId) ? primaryId : firstRowId;

  return (
    <Panel
      testId="component-issue-solution"
      title="課題-解決策分析"
      description="課題をイシューツリー・MECE 表・サンキー図・マトリクスで整理し、原因・仮説・評価属性・解決策・効果・出典・Microsoft 製品を確かめます。"
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="issue-solution" />
      <div className={s.toolbar}>
        <Field label="表示の形">
          <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ViewMode)}>
            <Radio value="tree" label="イシューツリー" />
            <Radio value="mece" label="MECE 表" />
            <Radio value="sankey" label="サンキー図" />
            <Radio value="matrix" label="マトリクス" />
          </RadioGroup>
        </Field>
        <Field label="区分">
          <RadioGroup layout="horizontal" value={filter} onChange={(_, d) => setFilter(d.value as AudienceFilter)}>
            <Radio value="all" label="すべて" />
            <Radio value="internal" label={AUDIENCE_LABELS.internal} />
            <Radio value="external" label={AUDIENCE_LABELS.external} />
          </RadioGroup>
        </Field>
        <Badge appearance="filled" color="brand" size="large" data-testid="count-badge" aria-label={`課題 ${visible.length} 件`}>
          {visible.length} 件
        </Badge>
        <Button
          icon={<CommentMultiple24Regular aria-hidden />}
          disabled={!(selectedIssue ?? detailSelection?.issue)}
          onClick={() => {
            const issue = selectedIssue ?? detailSelection?.issue;
            if (!issue) return;
            useDiscussionStore.getState().createFromIssue(packKeyOf(data.customer.name, data.customer.projectName), { id: issue.id, title: issue.title });
            useLayout.getState().showComponent('themes');
          }}
        >議論テーマにする</Button>
      </div>

      <div className={mergeClasses(s.layout, stacked && s.layoutStacked)}>
        <div className={s.column}>
          {visible.length === 0 ? (
            <EmptyView message="該当する課題はありません。" />
          ) : mode === 'sankey' ? (
            <SankeyView flow={flow} {...flowProps} />
          ) : mode === 'matrix' ? (
            <MatrixView matrix={matrix} {...flowProps} />
          ) : mode === 'tree' ? (
            <div role="tree" aria-label="イシューツリー" className={s.tree} ref={treeRef}>
              {rows.map((row) => {
                const id = row.issue.id;
                const props = bind(id);
                const isSelected = props['data-highlight']?.includes('selected') ?? false;
                return (
                  <div
                    key={id}
                    role="treeitem"
                    {...props}
                    aria-level={row.level + 1}
                    aria-expanded={row.hasChildren ? row.expanded : undefined}
                    aria-selected={isSelected}
                    tabIndex={id === tabStopId ? 0 : -1}
                    className={mergeClasses(s.row, hl(props['data-highlight']))}
                    style={{ marginInlineStart: `calc(${row.level} * ${tokens.spacingHorizontalXXL})` }}
                    onClick={(e) => {
                      props.onClick?.(e);
                      if (row.hasChildren && !row.expanded) setExpanded(id, true);
                    }}
                    onKeyDown={(e) => onRowKey(e, row)}
                  >
                    <span
                      className={s.chevron}
                      aria-hidden
                      onClick={row.hasChildren ? (e) => { e.stopPropagation(); toggle(id); } : undefined}
                    >
                      {row.hasChildren ? (row.expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />) : null}
                    </span>
                    <IssueSummary issue={row.issue} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={s.group}>
              {groups.map((g) => (
                <Table key={g.root.id} aria-label={`分類: ${g.root.title}`} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>{g.root.title}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.members.map((m) => {
                      const props = bind(m.issue.id);
                      return (
                        <TableRow key={m.issue.id}>
                          <TableCell>
                            <div
                              role="button"
                              tabIndex={0}
                              {...props}
                              className={mergeClasses(s.row, hl(props['data-highlight']))}
                              style={{ marginInlineStart: `calc(${m.level} * ${tokens.spacingHorizontalXXL})` }}
                              onKeyDown={(e) => { onEntityKey(e, m.issue.id, ORIGIN); }}
                            >
                              <IssueSummary issue={m.issue} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ))}
            </div>
          )}

          {stacked ? null : (
          <section aria-label="解決策" className={s.group}>
            <Text as="h3" size={500} weight="semibold">解決策</Text>
            {solutions.length === 0 ? <Text>該当する解決策はありません。</Text> : (
              <ul className={s.solutions}>
                {solutions.map((sol) => {
                  const props = bind(sol.id);
                  const on = props['data-highlight']?.includes('selected') ?? false;
                  return (
                    <li key={sol.id} className={mergeClasses(s.solutionItem, hl(props['data-highlight']))} {...props}>
                      <Button
                        className={s.solutionButton}
                        appearance={on ? 'primary' : 'outline'}
                        icon={<Lightbulb24Regular aria-hidden />}
                        aria-pressed={on}
                        onClick={(e) => { e.stopPropagation(); props.onClick?.(e); }}
                      >
                        {sol.title}
                      </Button>
                      <SourceLinks solution={sol} sources={sourceMap} onOpen={openSolutionSource} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}
        </div>

        <DetailPanel
          selection={detailSelection}
          solutions={allSolutions}
          products={data.products.products}
          sources={data.sources.sources}
          sourceId={sourceId}
          onOpenSource={setSourceId}
          onCloseSource={() => setSourceId(undefined)}
        />
      </div>
      <RelatedMini origin={ORIGIN} />
    </Panel>
  );
}

export { IssueSolutionScreen };
