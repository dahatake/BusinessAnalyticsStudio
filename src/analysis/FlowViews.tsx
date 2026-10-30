// 課題-解決策分析のサンキー図とマトリクス（FR-038）。イシューツリーと同じ選択状態を使い、
// 課題→原因→解決策→効果→Microsoft 製品の関係と、解決策の出典リンクを示す。
import {
  Button, Link, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import {
  effectsOf, FLOW_COLUMNS, FLOW_LABELS, relatedFlowNodes,
  type FlowModel, type FlowNode, type MatrixModel, type Solution, type Source,
} from './model';
import { useT } from '../i18n';
import { lifeOpacity, lifeScale, usePresenceItems } from '../motion';

export interface FlowSelection { kind: 'issue' | 'solution'; id: string }

const NODE_H = 84;
const GAP = 12;

const useStyles = makeStyles({
  scroll: { overflowX: 'auto', paddingBottom: tokens.spacingVerticalS },
  sankey: { position: 'relative', minWidth: '900px' },
  heads: { display: 'grid', gridTemplateColumns: 'repeat(5, 20%)', marginBottom: tokens.spacingVerticalS },
  head: { paddingInlineStart: tokens.spacingHorizontalXS },
  canvas: { position: 'relative' },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  node: {
    position: 'absolute',
    width: '18%',
    height: `${NODE_H}px`,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalS,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  nodeClickable: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  nodeRelated: { backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}` },
  nodeSelected: { backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  mainButton: {
    height: 'auto',
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    justifyContent: 'flex-start',
    textAlign: 'start',
    whiteSpace: 'normal',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  clamp: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  links: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    // 出典のリンクの当たり判定は 24px 以上（NFR-A11Y-009 AC-485）
    '& a': { display: 'inline-flex', alignItems: 'center', minHeight: '24px' } },
  chip: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalXS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
  },
  rowHead: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
  },
  causes: { margin: 0, paddingInlineStart: tokens.spacingHorizontalXL },
  matrixCell: { verticalAlign: 'top' },
});

/** 解決策の出典へのリンク。押すと出典カードを開く。出典が無ければ「出典なし」 */
export function SourceLinks({ solution, sources, onOpen }: {
  solution: Solution; sources: ReadonlyMap<string, Source>; onOpen: (solutionId: string, sourceId: string) => void;
}) {
  const s = useStyles();
  const t = useT();
  const ids = solution.sourceIds ?? [];
  if (ids.length === 0) return <Text size={200}>{t('出典なし')}</Text>;
  return (
    <span className={s.links}>
      {ids.map((id) => (
        <Link
          key={id}
          href={`#${id}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(solution.id, id); }}
        >
          {sources.get(id)?.title ?? id}
        </Link>
      ))}
    </span>
  );
}

export interface FlowViewProps {
  selection: FlowSelection | undefined;
  solutions: ReadonlyMap<string, Solution>;
  sources: ReadonlyMap<string, Source>;
  onSelectIssue: (id: string) => void;
  onSelectSolution: (id: string) => void;
  onOpenSource: (solutionId: string, sourceId: string) => void;
}

export function SankeyView({ flow, selection, solutions, sources, onSelectIssue, onSelectSolution, onOpenSource }: FlowViewProps & { flow: FlowModel }) {
  const s = useStyles();
  const t = useT();
  const height = flow.rows * (NODE_H + GAP) - GAP;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const selectedId = selection && byId.has(selection.id) ? selection.id : undefined;
  const related = selectedId ? relatedFlowNodes(flow, selectedId) : new Set<string>();
  const top = (n: FlowNode) => n.row * (NODE_H + GAP);
  // 出入り・遷移（FR-070 AC-086）: 節・線は同じ ID のまま動き、追加は現れ、削除は薄れて消える
  const nodeItems = usePresenceItems(flow.nodes, (n) => n.id, (n) => [n.column, n.row]);
  const linkItems = usePresenceItems(flow.links, (l) => `${l.from}>${l.to}`, (l) => {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    return a && b ? [a.column * 20 + 19, top(a) + NODE_H / 2, b.column * 20 + 1, top(b) + NODE_H / 2] : [0, 0, 0, 0];
  });

  return (
    <div className={s.scroll} role="region" aria-label={t('サンキー図')} tabIndex={0}>
      <div className={s.sankey} data-testid="sankey">
        <div className={s.heads} aria-hidden>
          {FLOW_COLUMNS.map((k) => <Text key={k} size={200} weight="semibold" className={s.head}>{FLOW_LABELS[k]}</Text>)}
        </div>
        <div className={s.canvas} style={{ height }}>
          <svg className={s.svg} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
            {linkItems.map(({ item: l, vec, life }) => {
              const [x1, y1, x2, y2] = vec as [number, number, number, number];
              const mid = (x1 + x2) / 2;
              const on = selectedId !== undefined && (l.from === selectedId || related.has(l.from)) && (l.to === selectedId || related.has(l.to));
              return (
                <path
                  key={`${l.from}>${l.to}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  opacity={lifeOpacity(life)}
                  style={{ stroke: on ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke1, strokeWidth: on ? 3 : 1.5 }}
                />
              );
            })}
          </svg>
          {nodeItems.map(({ item: n, vec, life, exiting }) => {
            const isSelected = n.id === selectedId;
            const isRelated = related.has(n.id);
            const solution = n.kind === 'solution' ? solutions.get(n.id) : undefined;
            const clickable = (n.kind === 'issue' || n.kind === 'solution') && !exiting;
            const select = () => { if (n.kind === 'issue') onSelectIssue(n.id); else if (n.kind === 'solution') onSelectSolution(n.id); };
            return (
              <div
                key={n.id}
                data-entity-id={n.id}
                data-highlight={isSelected ? 'selected' : isRelated ? 'related' : undefined}
                data-exiting={exiting || undefined}
                aria-hidden={exiting || undefined}
                className={mergeClasses(s.node, clickable && s.nodeClickable, isRelated && s.nodeRelated, isSelected && s.nodeSelected)}
                style={{ left: `${vec[0]! * 20 + 1}%`, top: vec[1]! * (NODE_H + GAP), ...(life < 1 || exiting ? { opacity: lifeOpacity(life), transform: `scale(${lifeScale(life).toFixed(3)})`, pointerEvents: 'none' as const } : {}) }}
                onClick={clickable ? select : undefined}
              >
                {clickable ? (
                  <Button appearance="transparent" size="small" className={s.mainButton} aria-pressed={isSelected} onClick={(e) => { e.stopPropagation(); select(); }}>
                    <span className={s.clamp}>{n.label}</span>
                  </Button>
                ) : (
                  <Text size={200} className={s.clamp}>{n.label}</Text>
                )}
                {solution ? <SourceLinks solution={solution} sources={sources} onOpen={onOpenSource} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MatrixView({ matrix, selection, sources, onSelectIssue, onSelectSolution, onOpenSource }: FlowViewProps & { matrix: MatrixModel }) {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.scroll} role="region" aria-label={t('マトリクス')} tabIndex={0}>
      <Table aria-label={t('課題と Microsoft 製品のマトリクス')} size="small" data-testid="matrix">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>{t('課題と原因')}</TableHeaderCell>
            {matrix.columns.map((p) => <TableHeaderCell key={p?.id ?? 'none'}>{p ? p.name : t('製品の関連付けなし')}</TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.rows.map((row) => {
            const selected = selection?.kind === 'issue' && selection.id === row.issue.id;
            return (
              <TableRow key={row.issue.id}>
                <TableCell className={s.matrixCell}>
                  <div
                    data-entity-id={row.issue.id}
                    data-highlight={selected ? 'selected' : undefined}
                    className={mergeClasses(s.rowHead, selected && s.nodeSelected)}
                    style={{ marginInlineStart: `calc(${row.level} * ${tokens.spacingHorizontalXL})` }}
                    onClick={() => onSelectIssue(row.issue.id)}
                  >
                    <Button appearance="transparent" size="small" className={s.mainButton} aria-pressed={selected} onClick={(e) => { e.stopPropagation(); onSelectIssue(row.issue.id); }}>
                      {row.issue.title}
                    </Button>
                    {row.causes.length > 0 ? (
                      <ul className={s.causes} aria-label={t('原因')}>
                        {row.causes.map((c) => <li key={c.id}><Text size={200}>{c.title}</Text></li>)}
                      </ul>
                    ) : <Text size={200}>{t('原因は未設定です')}</Text>}
                  </div>
                </TableCell>
                {row.cells.map((cell) => (
                  <TableCell key={cell.product?.id ?? 'none'} className={s.matrixCell}>
                    {cell.solutions.length === 0 ? <Text size={200}>—</Text> : cell.solutions.map((sol) => {
                      const on = selection?.kind === 'solution' && selection.id === sol.id;
                      return (
                        <div
                          key={sol.id}
                          data-entity-id={sol.id}
                          data-highlight={on ? 'selected' : undefined}
                          className={mergeClasses(s.chip, on && s.nodeSelected)}
                          onClick={() => onSelectSolution(sol.id)}
                        >
                          <Button appearance="transparent" size="small" className={s.mainButton} aria-pressed={on} onClick={(e) => { e.stopPropagation(); onSelectSolution(sol.id); }}>
                            {sol.title}
                          </Button>
                          <Text size={200}>{t('効果: {v}', { v: effectsOf(sol).map((e) => e.title).join('、') || t('未設定') })}</Text>
                          <SourceLinks solution={sol} sources={sources} onOpen={onOpenSource} />
                        </div>
                      );
                    })}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
