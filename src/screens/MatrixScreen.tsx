// 2×2 マトリクス（FR-039）。インパクト × 実現性の配置で、バブルの大きさはコスト。重みを変えると配置がすぐ変わる。
// 軸の値は、その軸に属する観点の重み付き平均（インパクト側=インパクト・ROI、実現性側=実現性・リスク低減）。
// 位置・大きさだけに頼らず、「表で見る」で同じ値を表にして読める（NFR-A11Y-003）。
import { useMemo, useState, type SVGProps } from 'react';
import { Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { QUADRANT_LABEL } from '../analysis/priority';
import { usePriority } from '../analysis/usePriority';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { ViewAsTableButton, ViewTable } from '../components/ViewTable';
import { onEntityKey, useEntityBinding } from '../selection/hooks';
import { Items3DSurface } from '../three/Items3DSurface';
import { norm, type Item3D } from '../view/items3d';
import { useComponentView, usePublishViewItems } from '../view/useView';

const ORIGIN = 'matrix';
const W = 640;
const H = 480;
const L = 64;
const R = 24;
const T = 28;
const B = 56;

const sx = (v: number): number => L + ((v - 1) / 4) * (W - L - R);
const sy = (v: number): number => H - B - ((v - 1) / 4) * (H - T - B);

const useStyles = makeStyles({
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM },
  svg: { width: '100%', height: 'auto', maxHeight: '70vh', minHeight: '280px', flexShrink: 0, display: 'block' },
  axis: { stroke: tokens.colorNeutralStroke1, strokeWidth: 1 },
  mid: { stroke: tokens.colorNeutralStroke2, strokeWidth: 1.5, strokeDasharray: '6 4' },
  quad: { fill: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase400 },
  label: { fill: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase300, pointerEvents: 'none' },
  axisLabel: { fill: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase400 },
  bubble: {
    fill: tokens.colorBrandBackground2, stroke: tokens.colorBrandStroke1, strokeWidth: 2, cursor: 'pointer',
  },
  node: { cursor: 'pointer', ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` } },
  selected: { strokeWidth: 4, fill: tokens.colorBrandBackground },
  related: { strokeWidth: 3 },
  hover: { strokeDasharray: '4 3' },
});

function MatrixScreen() {
  const s = useStyles();
  const bind = useEntityBinding(ORIGIN);
  const { ready, points } = usePriority();
  const [asTable, setAsTable] = useState(false);
  const { mode } = useComponentView(ORIGIN);
  // 2D と 3D で同じ項目（FR-217 AC-501）。位置=実現性（横）×インパクト（高さ）、大きさ=コスト、色=象限
  const items3d = useMemo<Item3D[]>(() => {
    const maxCost = Math.max(1, ...points.map((p) => p.cost));
    return points.map((p) => ({ id: p.id, label: p.title, x: norm(p.x, 1, 5), y: norm(p.y, 1, 5), z: 0.5, size: Math.sqrt(p.cost / maxCost), group: QUADRANT_LABEL[p.quadrant] }));
  }, [points]);
  usePublishViewItems(ORIGIN, useMemo(() => points.map((p) => p.id), [points]));
  if (!ready) return <LoadingView label="マトリクスを読み込み中" />;

  const maxCost = Math.max(1, ...points.map((p) => p.cost));
  const radius = (cost: number): number => 12 + 26 * Math.sqrt(cost / maxCost);

  return (
    <Panel
      testId="component-matrix"
      title="2×2 マトリクス"
      description="横軸=実現性、縦軸=インパクト、バブルの大きさ=コスト。重みを変えると配置が変わります。"
      maxWidth="1200px"
    >
      <div className={s.bar}>
        <ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>
      {points.length === 0 ? (
        <EmptyView message="配置する課題がありません。" />
      ) : asTable ? (
        <ViewTable
          label="2×2 マトリクスの値"
          origin={ORIGIN}
          columns={['課題', '実現性（軸）', 'インパクト（軸）', 'コスト（万円）', '象限']}
          rows={points.map((p) => ({ id: p.id, cells: [p.title, p.x.toFixed(1), p.y.toFixed(1), p.cost.toLocaleString('ja-JP'), QUADRANT_LABEL[p.quadrant]] }))}
        />
      ) : mode === '3d' ? (
        <Items3DSurface viewKey={ORIGIN} origin={ORIGIN} label="インパクト×実現性の 2×2 マトリクス" items={items3d} axes={{ x: '実現性', y: 'インパクト' }} />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="group" aria-label="インパクト×実現性の 2×2 マトリクス">
          <line className={s.axis} x1={L} y1={H - B} x2={W - R} y2={H - B} />
          <line className={s.axis} x1={L} y1={T} x2={L} y2={H - B} />
          <line className={s.mid} x1={sx(3)} y1={T} x2={sx(3)} y2={H - B} />
          <line className={s.mid} x1={L} y1={sy(3)} x2={W - R} y2={sy(3)} />
          <text className={s.quad} x={W - R - 6} y={T + 14} textAnchor="end">今すぐ実行</text>
          <text className={s.quad} x={L + 6} y={T + 14}>計画して実行</text>
          <text className={s.quad} x={W - R - 6} y={H - B - 8} textAnchor="end">手早く実行</text>
          <text className={s.quad} x={L + 6} y={H - B - 8}>保留</text>
          <text className={s.axisLabel} x={(L + W - R) / 2} y={H - 16} textAnchor="middle">実現性 →</text>
          <text className={s.axisLabel} x={16} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>インパクト →</text>
          {points.map((p) => {
            const props = bind(p.id);
            const hlWords = (props['data-highlight'] ?? '').split(' ');
            return (
              <g
                key={p.id} {...(props as unknown as SVGProps<SVGGElement>)} role="button" tabIndex={0} className={s.node}
                aria-label={`${p.title}（実現性 ${p.x.toFixed(1)}、インパクト ${p.y.toFixed(1)}、コスト ${p.cost} 万円）`}
                aria-pressed={hlWords.includes('selected')}
                onKeyDown={(e) => { onEntityKey(e as never, p.id, ORIGIN); }}
              >
                <circle
                  cx={sx(p.x)} cy={sy(p.y)} r={radius(p.cost)}
                  className={mergeClasses(s.bubble, hlWords.includes('selected') && s.selected, hlWords.includes('related') && s.related, hlWords.includes('hover') && s.hover)}
                />
                <text className={s.label} x={sx(p.x)} y={sy(p.y) + radius(p.cost) + 14} textAnchor="middle">{p.title}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Text size={200}>象限: 右上=今すぐ実行／左上=計画して実行／右下=手早く実行／左下=保留。バブルの大きさはコスト（万円）です。</Text>
    </Panel>
  );
}

export { MatrixScreen };
