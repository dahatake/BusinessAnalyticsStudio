// 2D 図面（FR-020）。モノのデジタルツイン（3D）と同じ部品の一覧と、上から見た配置図。
// 3D と同じ配置（src/three/entityLayout.ts）から描くので、同じ部品が同じ位置関係で並ぶ。
// 選択はすべてのビューと共通の状態（src/store/selection.ts）。片方で選ぶと、もう片方で同じ部品が強調される（FR-025）。
import { useMemo } from 'react';
import { Badge, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { onEntityKey, useEntityBinding } from '../selection/hooks';
import type { TwinObject } from '../three/entityLayout';
import { useTwinLayout } from '../three/twin';

const ORIGIN = 'drawing2d';

const TYPE_LABELS: Record<string, string> = { site: '拠点', part: '部品', role: '担当' };
const typeLabel = (t: string): string => TYPE_LABELS[t] ?? t;

const useStyles = makeStyles({
  body: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalL, alignItems: 'flex-start' },
  list: { flex: '1 1 340px', minWidth: 0 },
  plan: { flex: '2 1 360px', minWidth: 0 },
  row: {
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  cell: { overflowWrap: 'anywhere', minWidth: 0, justifyContent: 'flex-start' },
  svg: {
    display: 'block',
    width: '100%',
    height: 'auto',
    maxHeight: '60vh',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  grid: { stroke: tokens.colorNeutralStroke2, strokeWidth: 0.03 },
  shape: { cursor: 'pointer', strokeWidth: 0.06, stroke: tokens.colorNeutralStroke1, transitionProperty: 'none' },
  site: { fill: tokens.colorPaletteBlueBackground2 },
  part: { fill: tokens.colorPalettePeachBackground2 },
  role: { fill: tokens.colorPaletteGreenBackground2 },
  other: { fill: tokens.colorNeutralBackground5 },
  platform: { fillOpacity: 0.85 },
  related: { stroke: tokens.colorBrandStroke2, strokeWidth: 0.14 },
  selected: { stroke: tokens.colorBrandStroke1, strokeWidth: 0.24 },
  hover: { strokeDasharray: '0.2 0.12', stroke: tokens.colorBrandStroke1, strokeWidth: 0.14 },
  label: { fill: tokens.colorNeutralForeground1, fontSize: '0.3px', pointerEvents: 'none', paintOrder: 'stroke', stroke: tokens.colorNeutralBackground2, strokeWidth: 0.08 },
});

/** 階層の順（親の次に子）。パックの順は保つ */
function hierarchyOrder(objects: readonly TwinObject[]): TwinObject[] {
  const byParent = new Map<string | null, TwinObject[]>();
  for (const o of objects) byParent.set(o.parentId, [...(byParent.get(o.parentId) ?? []), o]);
  const out: TwinObject[] = [];
  const walk = (p: string | null): void => { for (const o of byParent.get(p) ?? []) { out.push(o); walk(o.entityId); } };
  walk(null);
  return out;
}

/** 配置図に名前を書けるか（台は前側の帯に、台でない項目は幅に収まるときだけ。収まらないものは、一覧と tooltip で読む） */
const LABEL_W = 0.3;
const fitsLabel = (o: TwinObject): boolean => o.platform || o.depth === 0 || o.name.length * LABEL_W * 1.05 <= Math.max(o.size[0], 1.4);

function Shape({ o, cls, props }: { o: TwinObject; cls: string; props: Record<string, unknown> }) {
  const [x, , z] = o.position;
  const [w, , d] = o.size;
  if (o.shape === 'cylinder' || o.shape === 'sphere' || o.shape === 'capsule') {
    return <ellipse cx={x} cy={z} rx={w / 2} ry={d / 2} className={cls} {...props}><title>{o.name}</title></ellipse>;
  }
  return <rect x={x - w / 2} y={z - d / 2} width={w} height={d} rx={0.12} className={cls} {...props}><title>{o.name}</title></rect>;
}

export function Drawing2DScreen() {
  const s = useStyles();
  const hl = useHighlightClass();
  const layout = useTwinLayout();
  const bind = useEntityBinding(ORIGIN);

  const shapes = useMemo(() => (layout ? [...layout.objects].sort((a, b) => a.depth - b.depth) : []), [layout]);
  const listed = useMemo(() => (layout ? hierarchyOrder(layout.objects) : []), [layout]);
  const byName = useMemo(() => new Map((layout?.objects ?? []).map((o) => [o.entityId, o.name])), [layout]);

  if (!layout) return <LoadingView label="図面を読み込み中" />;

  const pad = 1.2;
  const vx = layout.min[0] - pad;
  const vz = layout.min[2] - pad;
  const vw = layout.max[0] - layout.min[0] + pad * 2;
  const vd = layout.max[2] - layout.min[2] + pad * 2;
  const gridLines: number[] = [];
  for (let g = Math.ceil(vx / 2) * 2; g <= vx + vw; g += 2) gridLines.push(g);
  const gridRows: number[] = [];
  for (let g = Math.ceil(vz / 2) * 2; g <= vz + vd; g += 2) gridRows.push(g);

  return (
    <Panel
      testId="component-drawing2d"
      title="2D 図面"
      description="3D のデジタルツインと同じ部品を、一覧と上から見た配置図で示します。どちらでも選べ、他のビューと選択が連動します。"
      maxWidth="1200px"
    >
      {layout.objects.length === 0 ? (
        <EmptyView message="図面に表示する項目がありません。" />
      ) : (
        <div className={s.body}>
          <div className={s.list}>
            <Table aria-label="部品の一覧" size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>種別</TableHeaderCell>
                  <TableHeaderCell>名称</TableHeaderCell>
                  <TableHeaderCell>上位</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.map((o) => {
                  const props = bind(o.entityId);
                  return (
                    <TableRow
                      key={o.entityId}
                      role="row"
                      {...props}
                      tabIndex={0}
                      className={mergeClasses(s.row, hl(props['data-highlight']))}
                      onKeyDown={(e) => { onEntityKey(e, o.entityId, ORIGIN); }}
                    >
                      <TableCell className={s.cell}><Badge appearance="outline" color="informative">{typeLabel(o.type)}</Badge></TableCell>
                      <TableCell className={s.cell}><span style={{ paddingLeft: `${o.depth * 12}px` }}>{o.name}</span></TableCell>
                      <TableCell className={s.cell}><Text size={200}>{o.parentId ? byName.get(o.parentId) ?? '' : '—'}</Text></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className={s.plan}>
            <svg
              className={s.svg}
              viewBox={`${vx} ${vz} ${vw} ${vd}`}
              role="img"
              aria-label="配置図（上から見た図）"
              preserveAspectRatio="xMidYMid meet"
            >
              <g aria-hidden="true">
                {gridLines.map((g) => <line key={`x${g}`} x1={g} y1={vz} x2={g} y2={vz + vd} className={s.grid} />)}
                {gridRows.map((g) => <line key={`z${g}`} x1={vx} y1={g} x2={vx + vw} y2={g} className={s.grid} />)}
              </g>
              <g aria-hidden="true">
                {shapes.map((o) => {
                  const p = bind(o.entityId);
                  const words = (p['data-highlight'] ?? '').split(' ');
                  const cls = mergeClasses(
                    s.shape, s[o.tone], o.platform && s.platform,
                    words.includes('related') && s.related, words.includes('selected') && s.selected, words.includes('hover') && s.hover,
                  );
                  return (
                    <Shape
                      key={o.entityId}
                      o={o}
                      cls={cls}
                      props={{ 'data-entity-id': o.entityId, 'data-highlight': p['data-highlight'], onClick: p.onClick, onMouseEnter: p.onMouseEnter, onMouseLeave: p.onMouseLeave }}
                    />
                  );
                })}
                {shapes.filter(fitsLabel).map((o) => (
                  <text
                    key={`t-${o.entityId}`}
                    x={o.position[0]}
                    y={o.platform ? o.position[2] + o.size[2] / 2 - 0.22 : o.position[2] + 0.1}
                    textAnchor="middle"
                    className={s.label}
                  >
                    {o.name}
                  </text>
                ))}
              </g>
            </svg>
          </div>
        </div>
      )}
    </Panel>
  );
}
