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
import { useT } from '../i18n';
import { lifeOpacity, lifeScale, usePresenceItems } from '../motion';

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
  const t = useT();
  const bind = useEntityBinding(ORIGIN);
  const { ready, points } = usePriority();
  const [asTable, setAsTable] = useState(false);
  const { mode } = useComponentView(ORIGIN);
  // 2D と 3D で同じ項目（FR-217 AC-501）。位置=実現性（横）×インパクト（高さ）、大きさ=コスト、色=象限
  const items3d = useMemo<Item3D[]>(() => {
    const maxCost = Math.max(1, ...points.map((p) => p.cost));
    return points.map((p) => ({ id: p.id, label: p.title, x: norm(p.x, 1, 5), y: norm(p.y, 1, 5), z: 0.5, size: Math.sqrt(p.cost / maxCost), group: t(QUADRANT_LABEL[p.quadrant]) }));
  }, [points, t]);
  usePublishViewItems(ORIGIN, useMemo(() => points.map((p) => p.id), [points]));
  const maxCostAll = Math.max(1, ...points.map((p) => p.cost));
  // 出入り・遷移（FR-070 AC-086）: バブルは同じ ID のまま、位置・大きさが動き、追加は現れ、削除は薄れて消える
  const bubbles = usePresenceItems(points, (p) => p.id, (p) => [sx(p.x), sy(p.y), 12 + 26 * Math.sqrt(p.cost / maxCostAll)]);
  if (!ready) return <LoadingView label={t('マトリクスを読み込み中')} />;



  return (
    <Panel
      testId="component-matrix"
      title={t('2×2 マトリクス')}
      description={t('横軸=実現性、縦軸=インパクト、バブルの大きさ=コスト。重みを変えると配置が変わります。')}
      maxWidth="1200px"
    >
      <div className={s.bar}>
        <ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>
      {points.length === 0 ? (
        <EmptyView message={t('配置する課題がありません。')} />
      ) : asTable ? (
        <ViewTable
          label={t('2×2 マトリクスの値')}
          origin={ORIGIN}
          columns={[t('課題'), t('実現性（軸）'), t('インパクト（軸）'), t('コスト（万円）'), t('象限')]}
          rows={points.map((p) => ({ id: p.id, cells: [p.title, p.x.toFixed(1), p.y.toFixed(1), p.cost.toLocaleString('ja-JP'), t(QUADRANT_LABEL[p.quadrant])] }))}
        />
      ) : mode === '3d' ? (
        <Items3DSurface viewKey={ORIGIN} origin={ORIGIN} label={t('インパクト×実現性の 2×2 マトリクス')} items={items3d} axes={{ x: t('実現性'), y: t('インパクト') }} />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="group" aria-label={t('インパクト×実現性の 2×2 マトリクス')}>
          <line className={s.axis} x1={L} y1={H - B} x2={W - R} y2={H - B} />
          <line className={s.axis} x1={L} y1={T} x2={L} y2={H - B} />
          <line className={s.mid} x1={sx(3)} y1={T} x2={sx(3)} y2={H - B} />
          <line className={s.mid} x1={L} y1={sy(3)} x2={W - R} y2={sy(3)} />
          <text className={s.quad} x={W - R - 6} y={T + 14} textAnchor="end">{t('今すぐ実行')}</text>
          <text className={s.quad} x={L + 6} y={T + 14}>{t('計画して実行')}</text>
          <text className={s.quad} x={W - R - 6} y={H - B - 8} textAnchor="end">{t('手早く実行')}</text>
          <text className={s.quad} x={L + 6} y={H - B - 8}>{t('保留')}</text>
          <text className={s.axisLabel} x={(L + W - R) / 2} y={H - 16} textAnchor="middle">{t('実現性 →')}</text>
          <text className={s.axisLabel} x={16} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>{t('インパクト →')}</text>
          {bubbles.map(({ item: p, vec, life, exiting }) => {
            const props = bind(p.id);
            const hlWords = (props['data-highlight'] ?? '').split(' ');
            return (
              <g
                key={p.id} {...(props as unknown as SVGProps<SVGGElement>)} role="button" tabIndex={exiting ? -1 : 0} className={s.node}
                aria-label={t('{title}（実現性 {x}、インパクト {y}、コスト {cost} 万円）', { title: p.title, x: p.x.toFixed(1), y: p.y.toFixed(1), cost: p.cost })}
                aria-pressed={hlWords.includes('selected')} aria-hidden={exiting || undefined} opacity={lifeOpacity(life)} pointerEvents={exiting ? 'none' : undefined}
                onKeyDown={(e) => { onEntityKey(e as never, p.id, ORIGIN); }}
              >
                <circle
                  cx={vec[0]} cy={vec[1]} r={vec[2]! * lifeScale(life)}
                  className={mergeClasses(s.bubble, hlWords.includes('selected') && s.selected, hlWords.includes('related') && s.related, hlWords.includes('hover') && s.hover)}
                />
                <text className={s.label} x={vec[0]} y={vec[1]! + vec[2]! + 14} textAnchor="middle">{p.title}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Text size={200}>{t('象限: 右上=今すぐ実行／左上=計画して実行／右下=手早く実行／左下=保留。バブルの大きさはコスト（万円）です。')}</Text>
    </Panel>
  );
}

export { MatrixScreen };
