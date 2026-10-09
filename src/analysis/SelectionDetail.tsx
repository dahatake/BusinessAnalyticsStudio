// 選んだ項目の詳細（一覧表の下など、専用の詳細の置き場を持たない画面で、その場の編集に使う）。FR-044
// 課題・解決策は課題-解決策分析と同じ詳細、そのほかの項目は名前の編集と追加・複製・削除を出す。
// 課題-解決策分析が出ているときは、そちらの詳細パネルだけを出す（DetailPanel の hostPriority）。
import { useMemo, useState } from 'react';
import { useSelection } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { DetailPanel } from './DetailPanel';
import { solutionIssueIds, type Issue } from './model';

export function SelectionDetail({ hostPriority = 0 }: { hostPriority?: number }) {
  const state = usePackStore((s) => s.state);
  const { primaryId, graph } = useSelection();
  const [sourceRef, setSourceRef] = useState<{ owner: string | undefined; id: string } | undefined>();
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const sourceId = sourceRef && sourceRef.owner === primaryId ? sourceRef.id : undefined;

  const selection = useMemo(() => {
    if (!data || !primaryId) return undefined;
    const issue = data.issues.issues.find((i) => i.id === primaryId);
    if (issue) return { kind: 'issue', issue } as const;
    const solution = data.issues.solutions.find((x) => x.id === primaryId);
    if (solution) {
      const byId = new Map(data.issues.issues.map((i) => [i.id, i]));
      return {
        kind: 'solution', solution, issue: byId.get(solution.issueId),
        issues: solutionIssueIds(solution).map((id) => byId.get(id)).filter((i): i is Issue => i !== undefined),
      } as const;
    }
    const node = graph?.node(primaryId);
    return node ? ({ kind: 'entity', id: node.id, nodeKind: node.kind, label: node.label } as const) : undefined;
  }, [data, primaryId, graph]);

  if (!data) return null;
  return (
    <DetailPanel
      hostPriority={hostPriority}
      selection={selection}
      solutions={data.issues.solutions}
      products={data.products.products}
      sources={data.sources.sources}
      sourceId={sourceId}
      onOpenSource={(id) => setSourceRef({ owner: primaryId, id })}
      onCloseSource={() => setSourceRef(undefined)}
    />
  );
}
