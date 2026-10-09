// 優先順位分析の画面から使う共通のフック（FR-039）。パックの課題と重みから、ランキング・マトリクスの行を作る。
import { useMemo } from 'react';
import { usePackStore } from '../store/pack';
import { usePriorityStore } from '../store/priority';
import { buildMatrixPoints, buildPriorityRows } from './priority';

export function usePriority() {
  const state = usePackStore((s) => s.state);
  const weights = usePriorityStore((s) => s.weights);
  const issues = state.status === 'ready' ? state.pack.data.issues.issues : undefined;
  const rows = useMemo(() => (issues ? buildPriorityRows(issues, weights) : []), [issues, weights]);
  const points = useMemo(() => buildMatrixPoints(rows, weights), [rows, weights]);
  return { ready: state.status === 'ready', issues: issues ?? [], weights, rows, points };
}
