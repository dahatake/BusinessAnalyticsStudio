// 「表で見る」（NFR-A11Y-003 AC-173）。3D・地図・ナレッジグラフ・2×2 マトリクスなど、位置や大きさで見せる表現と同じ項目・同じ値を、表で読めるようにする共通部品。
//  - 切替のボタン（ViewAsTableButton）: 「表で見る」⇄「元の表示に戻る」
//  - 表（ViewTable）: 1 項目 1 行。行は選択の共通の状態（src/store/selection.ts）につながり、行を選ぶと元の表現でも選ばれる。
//    行の data-entity-id・data-highlight・aria-selected は、ほかの表現と同じ。横にあふれるときは、キーボードでスクロールできる。
import type { ReactNode } from 'react';
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ArrowLeft24Regular, Table24Regular } from '@fluentui/react-icons';
import { onEntityKey, useEntityBinding } from '../selection/hooks';
import { useHighlightClass } from './highlight';
import { isSelectedHighlight } from './roving';

const useStyles = makeStyles({
  scroll: { overflowX: 'auto', flexShrink: 0 },
  row: { cursor: 'pointer' },
});

export interface ViewAsTableButtonProps {
  asTable: boolean;
  onToggle: () => void;
}

/** 「表で見る」と「元の表示に戻る」を切り替えるボタン（表示中かどうかは、ボタンの名前で伝わる）。 */
export function ViewAsTableButton({ asTable, onToggle }: ViewAsTableButtonProps) {
  return (
    <Button icon={asTable ? <ArrowLeft24Regular aria-hidden /> : <Table24Regular aria-hidden />} onClick={onToggle}>
      {asTable ? '元の表示に戻る' : '表で見る'}
    </Button>
  );
}

export interface ViewTableRow {
  /** 項目の ID（data-entity-id。選択の共通の状態に使う） */
  id: string;
  /** 列ごとの内容（columns と同じ順） */
  cells: ReactNode[];
}

export interface ViewTableProps {
  /** 表の名前（スクリーンリーダーが読み上げる） */
  label: string;
  /** 選択を起こしたビューとして記録する名前 */
  origin: string;
  columns: readonly string[];
  rows: readonly ViewTableRow[];
}

export function ViewTable({ label, origin, columns, rows }: ViewTableProps) {
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(origin);
  return (
    <div className={s.scroll} tabIndex={0} role="region" aria-label={`${label}（横にスクロールできます）`}>
      <Table aria-label={label} size="small">
        <TableHeader>
          <TableRow>{columns.map((c) => <TableHeaderCell key={c}>{c}</TableHeaderCell>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const props = bind(r.id);
            return (
              <TableRow
                key={r.id}
                role="row"
                {...props}
                aria-selected={isSelectedHighlight(props['data-highlight'])}
                tabIndex={0}
                className={mergeClasses(s.row, hl(props['data-highlight']))}
                onKeyDown={(e) => { onEntityKey(e, r.id, origin); }}
              >
                {r.cells.map((c, i) => <TableCell key={i}>{c}</TableCell>)}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
