// 「関連を見る」ミニビュー（FR-037 AC-045）。各分析画面に置き、選択中の項目の隣接ノードを表示する。
// 選択は共通のストア（useSelection）。隣接の項目を押すと、その項目を選ぶ。
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { KIND_LABELS } from '../selection/graph';
import { useSelection } from '../selection/hooks';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  list: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS, margin: 0, padding: 0, listStyle: 'none' },
});

export function RelatedMini({ origin }: { origin: string }) {
  const s = useStyles();
  const { graph, primaryId, select } = useSelection();
  const node = graph && primaryId ? graph.node(primaryId) : undefined;
  const neighbors = graph && node ? [...graph.neighbors(node.id)].map((id) => graph.node(id)).filter((n) => n !== undefined) : [];
  return (
    <section className={s.root} data-testid="related-mini" aria-label="関連を見る">
      <Text weight="semibold">関連を見る</Text>
      {!node ? (
        <Text size={200}>項目を選ぶと、つながっている隣接の項目がここに表示されます。</Text>
      ) : neighbors.length === 0 ? (
        <Text size={200}>「{node.label}」に隣接する項目はありません。</Text>
      ) : (
        <>
          <Text size={200}>「{node.label}」の隣接（{neighbors.length} 件）</Text>
          <ul className={s.list}>
            {neighbors.map((n) => (
              <li key={n.id}>
                <Button size="small" appearance="outline" onClick={() => select(n.id, { origin })} title={`${KIND_LABELS[n.kind]}を選ぶ`}>
                  {n.label}（{KIND_LABELS[n.kind]}）
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
