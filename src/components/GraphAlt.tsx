// 3D・Graph の表示でも同じ情報を表とテキストで読める代替表示（NFR-A11Y-010 AC-580・NFR-A11Y-003）。
// 件数・階層のテキストの要約と、ノードの表（名称・種別・KPI などの値）と、関係の表（起点・意味ラベル・終点・向き）。
// ノードの表の行を選ぶと、図の同じ項目が選択される（共通の選択状態）。多い件数でも速く出るよう、素の table で描く。関係の表の行を選ぶと、その起点が選択される。
import { useRef } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { useSelection } from '../selection/hooks';
import { requestGraphFocus } from './graphViewStore';
import { ViewAsTableButton } from './ViewTable';
import { useT } from '../i18n';
import { lifeOpacity } from '../motion';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%', textAlign: 'left', fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  row: { cursor: 'pointer', borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  on: { backgroundColor: tokens.colorBrandBackground2 },
});

export interface AltNode { id: string; name: string; kind: string; /** 追加の列の値（columns と同じ順） */ values?: readonly string[]; /** 出入りの途中の値（0〜1。省略は 1）と、削除の遷移中（行は薄れて残り、操作できない） */ life?: number; exiting?: boolean }
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
  /** 「表で見る」ボタンを置く（既定 true。ビジネス関係グラフは置かない） */
  showTableButton?: boolean;
}

export function GraphAlt({ origin, label, nodes, relations, columns = [], summary, showTableButton = true }: GraphAltProps) {
  const s = useStyles();
  const t = useT();
  const { select, selectedIds } = useSelection();
  // 「表で見る」: 表は図と同時に表示されている（NFR-A11Y-010）。ボタンは表へ移る（フォーカスする）。表の行を選ぶと、図の同じ項目が選択され、図がその項目へ移動してハイライトされる（FR-248）
  const tableRef = useRef<HTMLDivElement>(null);
  const pick = (id: string, additive = false): void => { select(id, { origin, additive }); requestGraphFocus(origin, id); };
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const nameOf = (id: string): string => names.get(id) ?? id;
  const liveCount = nodes.filter((n) => !n.exiting).length;
  return (
    <section className={s.root} aria-label={t('{label}の表と要約', { label })} data-testid="graph-alt">
      <Text role="status" data-testid="graph-alt-summary">
        {`${label}: ${liveCount === 0 ? t('項目なし') : t('項目 {n} 件', { n: liveCount })}${t('、')}${relations.length === 0 ? t('関係なし') : t('関係 {n} 件', { n: relations.length })}${summary ? `${t('。')}${summary}` : ''}`}
      </Text>
      {showTableButton ? <div><ViewAsTableButton asTable={false} onToggle={() => { tableRef.current?.scrollIntoView?.({ block: 'nearest' }); tableRef.current?.focus(); }} /></div> : null}
      <div ref={tableRef} className={s.scroll} tabIndex={0} role="region" aria-label={t('{label}の項目（表。横にスクロールできます）', { label })}>
        <table className={s.table} aria-label={t('{label}の項目（表）', { label })} data-testid="graph-alt-nodes">
          <thead><tr>{[t('名称'), t('種別'), ...columns].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {nodes.map((n) => n.exiting ? (
              <tr key={n.id} aria-hidden data-entity-id={n.id} data-exiting style={{ opacity: lifeOpacity(n.life ?? 0), pointerEvents: 'none' }}>
                <td>{n.name}</td><td>{n.kind}</td>{columns.map((c) => <td key={c}>—</td>)}
              </tr>
            ) : (
              <tr
                key={n.id} className={`${s.row} ${selectedIds.includes(n.id) ? s.on : ''}`} data-entity-id={n.id} aria-selected={selectedIds.includes(n.id)} tabIndex={0}
                style={n.life !== undefined && n.life < 1 ? { opacity: lifeOpacity(n.life) } : undefined}
                onClick={(e) => pick(n.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(n.id); } }}
              >
                <td>{n.name}</td><td>{n.kind}</td>{columns.map((c, i) => <td key={c}>{n.values?.[i] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.scroll} tabIndex={0} role="region" aria-label={t('{label}の関係（表。横にスクロールできます）', { label })}>
        <table className={s.table} aria-label={t('{label}の関係（表）', { label })} data-testid="graph-alt-relations">
          <thead><tr>{[t('起点'), t('意味ラベル'), t('終点'), t('向き')].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {relations.length === 0 ? <tr><td colSpan={4}>{t('関係はありません')}</td></tr> : null}
            {relations.map((r) => (
              <tr
                key={r.id} className={s.row} data-relation-id={r.id} aria-selected={selectedIds.includes(r.from)} tabIndex={0}
                onClick={() => select(r.from, { origin })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.from, { origin }); } }}
              >
                <td>{nameOf(r.from)}</td>
                <td>{r.label ?? t('（ラベルなし）')}{r.kind ? `（${r.kind}）` : ''}</td>
                <td>{nameOf(r.to)}</td>
                <td>{t('{from} から {to} へ', { from: nameOf(r.from), to: nameOf(r.to) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
