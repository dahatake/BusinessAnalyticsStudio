// 一覧表（FR-026）。パックのすべての項目を、選択に応じて自動で絞り込む表。
// 選択はすべてのビューと共通の状態（src/store/selection.ts）で、この表の行のクリック・ホバーも同じ状態を使う（FR-024〜FR-027）。
// 件数バッジ・AND/OR の切替・「非表示/減光」の選択・フィルター解除を備える。
import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Field, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { FilterDismiss24Regular } from '@fluentui/react-icons';
import { SelectionDetail } from '../analysis/SelectionDetail';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { DataTransferButtons } from '../edit/EditControls';
import { InlineInput } from '../edit/InlineInput';
import { KIND_LABELS, type GraphNode } from '../selection/graph';
import { onEntityKey, useEntityBinding, useSelection, useSelectionFilter } from '../selection/hooks';
import { useEditStore } from '../store/edit';
import { useFallbackStore } from '../store/fallback';

const ORIGIN = 'table';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  summary: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  summarySlot: { minHeight: tokens.spacingVerticalXXXL, display: 'flex', alignItems: 'center' },
  row: {
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  cell: { overflowWrap: 'anywhere', minWidth: 0 },
  idCell: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace },
  hideNarrow: { '@media (max-width: 560px)': { display: 'none' } },
});

const idOf = (n: GraphNode): string => n.id;

/**
 * 名称のセル。編集モードが ON のとき、ダブルクリックまたは Enter でその場の編集になる（FR-044）。OFF のときは編集状態にならない（FR-047）。
 * role="gridcell" は、操作できるセルであることを伝える。
 */
function NameCell({ node, className }: { node: GraphNode; className: string }) {
  const editMode = useEditStore((st) => st.editMode);
  const rename = useEditStore((st) => st.rename);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editMode) setEditing(false); }, [editMode]);
  return (
    <TableCell
      role="gridcell"
      className={className}
      tabIndex={0}
      onDoubleClick={() => { if (editMode) setEditing(true); }}
      onKeyDown={(e) => {
        if (editMode && !editing && e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {editing ? (
        <>
          {/* 編集中も、セルの文字（元の名称）を残す。表の行・セルを名称で特定する操作（検索・テスト）が、編集の開始で外れないようにするため */}
          <span hidden aria-hidden="true">{node.label}</span>
          <InlineInput
            initial={node.label}
            label={`${KIND_LABELS[node.kind]}の名称`}
            onClose={() => setEditing(false)}
            onSubmit={(t) => { const r = rename(node.id, t); return r.ok ? undefined : r.message; }}
          />
        </>
      ) : node.label}
    </TableCell>
  );
}

function TableScreen() {
  const s = useStyles();
  const hl = useHighlightClass();
  const { graph, selectedIds, related, mode, unrelated, setMode, setUnrelated, clear } = useSelection();
  const bind = useEntityBinding(ORIGIN);
  const editMode = useEditStore((st) => st.editMode);
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
  // 編集モードでは、選択で行を隠さない（編集した行・追加した行が見えなくならないように、関連しない行は減光で残す）
  const visible = fallbackNodes ?? (editMode ? nodes : filtered);
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
      <DataTransferButtons />

      {/* 編集モードでは、選択の表示の出入りで表がずれない（ダブルクリックが別の行に当たらない）ように、1 行分の場所を常に確保する */}
      <div className={editMode ? s.summarySlot : undefined}>
        {selectedIds.length > 0 ? (
          <div className={s.summary} role="status">
            <Text weight="semibold">選択中:</Text>
            {selectedIds.map((id) => <Badge key={id} appearance="tint" color="brand">{graph.node(id)?.label ?? id}</Badge>)}
          </div>
        ) : null}
      </div>

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
              // 編集モードでは関連しない行を隠さないので、減光（dimmed）で示す
              const dimmed = editMode && !fallbackNodes && related !== null && !related.has(n.id) && !props['data-highlight']?.includes('dimmed');
              const highlight = dimmed ? [props['data-highlight'], 'dimmed'].filter(Boolean).join(' ') : props['data-highlight'];
              return (
                <TableRow
                  key={n.id}
                  role="row"
                  {...props}
                  data-highlight={highlight}
                  aria-selected={selected.has(n.id)}
                  tabIndex={0}
                  className={mergeClasses(s.row, hl(highlight))}
                  onKeyDown={(e) => { onEntityKey(e, n.id, ORIGIN); }}
                >
                  <TableCell className={s.cell}>{state ? <Badge appearance="outline" color={state === '選択中' ? 'brand' : 'informative'}>{state}</Badge> : null}</TableCell>
                  <TableCell className={s.cell}>{KIND_LABELS[n.kind]}{n.type ? `（${n.type}）` : ''}</TableCell>
                  <NameCell node={n} className={s.cell} />
                  <TableCell className={mergeClasses(s.cell, s.idCell, s.hideNarrow)}>{n.id}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <SelectionDetail />
    </Panel>
  );
}

export { TableScreen };
