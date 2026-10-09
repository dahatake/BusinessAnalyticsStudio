// 課題-解決策分析（FR-001 構造化表示、FR-002 区分、FR-003〜FR-005 の詳細）。
// 左に課題（イシューツリー／MECE 表）と解決策、右に詳細パネルを置く。狭い画面では縦に積む。
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Badge, Button, Field, Radio, RadioGroup, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular, Lightbulb24Regular } from '@fluentui/react-icons';
import { DetailPanel } from '../analysis/DetailPanel';
import {
  AUDIENCE_LABELS, buildMeceGroups, buildTreeRows, filterIssues, filterSolutions,
  type AudienceFilter, type Issue,
} from '../analysis/model';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { usePackStore } from '../store/pack';

type ViewMode = 'tree' | 'mece';
type Selection = { kind: 'issue' | 'solution'; id: string };

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    columnGap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: tokens.spacingVerticalL },
  },
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
  rowSelected: { backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  chevron: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', flexShrink: 0 },
  rowBody: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, minWidth: 0 },
  badges: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXS, rowGap: tokens.spacingVerticalXXS },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  solutions: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyle: 'none' },
  solutionButton: { justifyContent: 'flex-start', height: 'auto', textAlign: 'start', whiteSpace: 'normal', minHeight: '32px' },
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
  const [selection, setSelection] = useState<Selection | undefined>();
  const [sourceId, setSourceId] = useState<string | undefined>();
  const treeRef = useRef<HTMLDivElement>(null);

  const data = state.status === 'ready' ? state.pack.data : undefined;
  const allIssues = useMemo(() => data?.issues.issues ?? [], [data]);
  const allSolutions = useMemo(() => data?.issues.solutions ?? [], [data]);
  const visible = useMemo(() => filterIssues(allIssues, filter), [allIssues, filter]);
  const solutions = useMemo(() => filterSolutions(allSolutions, visible), [allSolutions, visible]);
  const rows = useMemo(() => buildTreeRows(allIssues, visible, collapsed), [allIssues, visible, collapsed]);
  const groups = useMemo(() => buildMeceGroups(allIssues, visible), [allIssues, visible]);

  if (!data) return <LoadingView label="課題を読み込み中" />;

  const issueById = new Map(allIssues.map((i) => [i.id, i]));
  const selectedIssue = selection?.kind === 'issue' ? issueById.get(selection.id) : undefined;
  const selectedSolution = selection?.kind === 'solution' ? allSolutions.find((x) => x.id === selection.id) : undefined;
  const detailSelection = selectedIssue
    ? ({ kind: 'issue', issue: selectedIssue } as const)
    : selectedSolution
      ? ({ kind: 'solution', solution: selectedSolution, issue: issueById.get(selectedSolution.issueId) } as const)
      : undefined;

  const select = (sel: Selection) => { setSelection(sel); setSourceId(undefined); };
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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select({ kind: 'issue', id: row.issue.id }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[at + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[at - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && row.hasChildren) { e.preventDefault(); setExpanded(row.issue.id, true); }
    else if (e.key === 'ArrowLeft' && row.hasChildren) { e.preventDefault(); setExpanded(row.issue.id, false); }
  };

  const selectedId = selection?.id;
  const firstRowId = rows[0]?.issue.id;

  return (
    <Panel
      testId="component-issue-solution"
      title="課題-解決策分析"
      description="課題をイシューツリー・MECE の形で整理し、仮説・評価属性・解決策・出典・Microsoft 製品を確かめます。"
    >
      <div className={s.toolbar}>
        <Field label="表示の形">
          <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ViewMode)}>
            <Radio value="tree" label="イシューツリー" />
            <Radio value="mece" label="MECE 表" />
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
      </div>

      <div className={s.layout}>
        <div className={s.column}>
          {visible.length === 0 ? (
            <EmptyView message="該当する課題はありません。" />
          ) : mode === 'tree' ? (
            <div role="tree" aria-label="イシューツリー" className={s.tree} ref={treeRef}>
              {rows.map((row) => {
                const id = row.issue.id;
                const isSelected = selectedId === id && selection?.kind === 'issue';
                return (
                  <div
                    key={id}
                    role="treeitem"
                    data-entity-id={id}
                    data-highlight={isSelected ? 'selected' : undefined}
                    aria-level={row.level + 1}
                    aria-expanded={row.hasChildren ? row.expanded : undefined}
                    aria-selected={isSelected}
                    tabIndex={isSelected || (!selection && id === firstRowId) ? 0 : -1}
                    className={mergeClasses(s.row, isSelected && s.rowSelected)}
                    style={{ marginInlineStart: `calc(${row.level} * ${tokens.spacingHorizontalXXL})` }}
                    onClick={() => {
                      select({ kind: 'issue', id });
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
                    {g.members.map((m) => (
                      <TableRow key={m.issue.id}>
                        <TableCell>
                          <div
                            role="button"
                            tabIndex={0}
                            data-entity-id={m.issue.id}
                            data-highlight={selection?.kind === 'issue' && selectedId === m.issue.id ? 'selected' : undefined}
                            className={s.row}
                            style={{ marginInlineStart: `calc(${m.level} * ${tokens.spacingHorizontalXXL})` }}
                            onClick={() => select({ kind: 'issue', id: m.issue.id })}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select({ kind: 'issue', id: m.issue.id }); } }}
                          >
                            <IssueSummary issue={m.issue} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}
            </div>
          )}

          <section aria-label="解決策" className={s.group}>
            <Text as="h3" size={500} weight="semibold">解決策</Text>
            {solutions.length === 0 ? <Text>該当する解決策はありません。</Text> : (
              <ul className={s.solutions}>
                {solutions.map((sol) => (
                  <li key={sol.id}>
                    <Button
                      className={s.solutionButton}
                      appearance={selection?.kind === 'solution' && selectedId === sol.id ? 'primary' : 'outline'}
                      icon={<Lightbulb24Regular aria-hidden />}
                      data-entity-id={sol.id}
                      data-highlight={selection?.kind === 'solution' && selectedId === sol.id ? 'selected' : undefined}
                      onClick={() => select({ kind: 'solution', id: sol.id })}
                    >
                      {sol.title}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DetailPanel
          selection={detailSelection}
          products={data.products.products}
          sources={data.sources.sources}
          sourceId={sourceId}
          onOpenSource={setSourceId}
          onCloseSource={() => setSourceId(undefined)}
        />
      </div>
    </Panel>
  );
}

export { IssueSolutionScreen };
