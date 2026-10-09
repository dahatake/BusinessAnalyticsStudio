// 一覧表（FR-026）。パックのすべての項目を、選択に応じて自動で絞り込む表。
// 選択はすべてのビューと共通の状態（src/store/selection.ts）で、この表の行のクリック・ホバーも同じ状態を使う（FR-024〜FR-027）。
// 件数バッジ・AND/OR の切替・「非表示/減光」の選択・フィルター解除を備える。
import { useMemo } from 'react';
import {
  Badge, Button, Field, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Radio, RadioGroup, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { FilterDismiss24Regular } from '@fluentui/react-icons';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { KIND_LABELS, type GraphNode } from '../selection/graph';
import { onEntityKey, useEntityBinding, useSelection, useSelectionFilter } from '../selection/hooks';
import { useFallbackStore } from '../store/fallback';

const ORIGIN = 'table';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  summary: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  row: {
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  cell: { overflowWrap: 'anywhere', minWidth: 0 },
  idCell: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace },
  hideNarrow: { '@media (max-width: 560px)': { display: 'none' } },
});

const idOf = (n: GraphNode): string => n.id;

function TableScreen() {
  const s = useStyles();
  const hl = useHighlightClass();
  const { graph, selectedIds, mode, unrelated, setMode, setUnrelated, clear } = useSelection();
  const bind = useEntityBinding(ORIGIN);
  // FR-113: 表現が成り立たない項目（位置情報なしなど）を「表で見る」要求があるときは、その項目だけを出す
  const fallback = useFallbackStore((st) => st.request);
  const clearFallback = useFallbackStore((st) => st.clear);
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const { visible: filtered, count: filteredCount } = useSelectionFilter(nodes, idOf);
  const fallbackNodes = useMemo(() => {
    if (!fallback) return null;
    const ids = new Set(fallback.ids);
    return nodes.filter((n) => ids.has(n.id));
  }, [fallback, nodes]);
  const visible = fallbackNodes ?? filtered;
  const count = fallbackNodes ? fallbackNodes.length : filteredCount;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (!graph) return <LoadingView label="一覧を読み込み中" />;

  return (
    <Panel
      testId="component-table"
      title="一覧表"
      description="すべての項目を一覧にします。他のビューで項目を選ぶと、関連する行に自動で絞り込まれます。"
    >
      {fallback ? (
        <MessageBar intent="info" layout="multiline" data-testid="fallback-notice">
          <MessageBarBody>
            <MessageBarTitle>{fallback.reason}の項目を表示しています</MessageBarTitle>
            {fallback.source} の表現に必要な属性がないため、地図などには表示できない項目です（{fallbackNodes?.length ?? 0} 件）。
          </MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={clearFallback}>すべての項目に戻す</Button>
          </MessageBarActions>
        </MessageBar>
      ) : null}
      <div className={s.toolbar}>
        <Field label="選択の組み合わせ">
          <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as 'AND' | 'OR')}>
            <Radio value="AND" label="AND" />
            <Radio value="OR" label="OR" />
          </RadioGroup>
        </Field>
        <Field label="関連しない行">
          <RadioGroup layout="horizontal" value={unrelated} onChange={(_, d) => setUnrelated(d.value as 'hide' | 'dim')}>
            <Radio value="hide" label="非表示" />
            <Radio value="dim" label="減光" />
          </RadioGroup>
        </Field>
        <Badge appearance="filled" color="brand" size="large" data-testid="count-badge" aria-label={`該当 ${count} 件`}>
          {count} 件
        </Badge>
        <Button icon={<FilterDismiss24Regular aria-hidden />} disabled={selectedIds.length === 0} onClick={() => clear({ origin: ORIGIN })}>
          フィルター解除
        </Button>
      </div>

      {selectedIds.length > 0 ? (
        <div className={s.summary} role="status">
          <Text weight="semibold">選択中:</Text>
          {selectedIds.map((id) => <Badge key={id} appearance="tint" color="brand">{graph.node(id)?.label ?? id}</Badge>)}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyView message="選択に関連する項目はありません。「フィルター解除」で全件に戻せます。" />
      ) : (
        <Table aria-label="項目の一覧" size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>状態</TableHeaderCell>
              <TableHeaderCell>種別</TableHeaderCell>
              <TableHeaderCell>名称</TableHeaderCell>
              <TableHeaderCell className={s.hideNarrow}>ID</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((n) => {
              const props = bind(n.id, { filterable: true });
              const state = selected.has(n.id) ? '選択中' : props['data-highlight']?.includes('related') ? '関連' : '';
              return (
                <TableRow
                  key={n.id}
                  role="row"
                  {...props}
                  tabIndex={0}
                  className={mergeClasses(s.row, hl(props['data-highlight']))}
                  onKeyDown={(e) => { onEntityKey(e, n.id, ORIGIN); }}
                >
                  <TableCell className={s.cell}>{state ? <Badge appearance="outline" color={state === '選択中' ? 'brand' : 'informative'}>{state}</Badge> : null}</TableCell>
                  <TableCell className={s.cell}>{KIND_LABELS[n.kind]}{n.type ? `（${n.type}）` : ''}</TableCell>
                  <TableCell className={s.cell}>{n.label}</TableCell>
                  <TableCell className={mergeClasses(s.cell, s.idCell, s.hideNarrow)}>{n.id}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

export { TableScreen };
