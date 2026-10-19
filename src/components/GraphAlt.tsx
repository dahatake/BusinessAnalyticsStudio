// 3D・Graph の表示でも同じ情報を表とテキストで読める代替表示（NFR-A11Y-010 AC-580・NFR-A11Y-003）。
// 件数・階層のテキストの要約と、ノードの表（名称・種別・KPI などの値）と、関係の表（起点・意味ラベル・終点・向き）。
// ノードの表の行を選ぶと、図の同じ項目が選択される（共通の選択状態）。多い件数でも速く出るよう、素の table で描く。関係の表の行を選ぶと、その起点が選択される。
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { useSelection } from '../selection/hooks';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%', textAlign: 'left', fontSize: tokens.fontSizeBase200 },
  row: { cursor: 'pointer', borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  on: { backgroundColor: tokens.colorBrandBackground2 },
});

export interface AltNode { id: string; name: string; kind: string; /** 追加の列の値（columns と同じ順） */ values?: readonly string[] }
export interface AltRelation { id: string; from: string; to: string; label?: string; kind?: string }

export interface GraphAltProps {
  origin: string;
  label: string;
  nodes: readonly AltNode[];
  relations: readonly AltRelation[];
  /** 追加の列の名前（例: KPI の名前） */
  columns?: readonly string[];
  /** 件数・階層のテキストの要約に足す文 */
  summary?: string;
}

export function GraphAlt({ origin, label, nodes, relations, columns = [], summary }: GraphAltProps) {
  const s = useStyles();
  const { select, selectedIds } = useSelection();
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const nameOf = (id: string): string => names.get(id) ?? id;
  return (
    <section className={s.root} aria-label={`${label}の表と要約`} data-testid="graph-alt">
      <Text role="status" data-testid="graph-alt-summary">
        {`${label}: 項目 ${nodes.length} 件、関係 ${relations.length} 件${summary ? `。${summary}` : ''}`}
      </Text>
      <div className={s.scroll} tabIndex={0} role="region" aria-label={`${label}の項目（表。横にスクロールできます）`}>
        <table className={s.table} aria-label={`${label}の項目（表）`} data-testid="graph-alt-nodes">
          <thead><tr>{['名称', '種別', ...columns].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {nodes.map((n) => (
              <tr
                key={n.id} className={`${s.row} ${selectedIds.includes(n.id) ? s.on : ''}`} data-entity-id={n.id} aria-selected={selectedIds.includes(n.id)} tabIndex={0}
                onClick={(e) => select(n.id, { origin, additive: e.ctrlKey || e.metaKey || e.shiftKey })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.id, { origin }); } }}
              >
                <td>{n.name}</td><td>{n.kind}</td>{columns.map((c, i) => <td key={c}>{n.values?.[i] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.scroll} tabIndex={0} role="region" aria-label={`${label}の関係（表。横にスクロールできます）`}>
        <table className={s.table} aria-label={`${label}の関係（表）`} data-testid="graph-alt-relations">
          <thead><tr>{['起点', '意味ラベル', '終点', '向き'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {relations.length === 0 ? <tr><td colSpan={4}>関係はありません</td></tr> : null}
            {relations.map((r) => (
              <tr
                key={r.id} className={s.row} data-relation-id={r.id} aria-selected={selectedIds.includes(r.from)} tabIndex={0}
                onClick={() => select(r.from, { origin })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.from, { origin }); } }}
              >
                <td>{nameOf(r.from)}</td>
                <td>{r.label ?? '（ラベルなし）'}{r.kind ? `（${r.kind}）` : ''}</td>
                <td>{nameOf(r.to)}</td>
                <td>{`${nameOf(r.from)} から ${nameOf(r.to)} へ`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
