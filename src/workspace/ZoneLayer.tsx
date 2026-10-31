// ゾーンの面（FR-298）。作業領域（main）の全体を、意味名つきのゾーンで隙間・重なりなく覆う背景の層。コンポーネントはこの上に置かれる。
// ゾーンの割合・結合・モードは、利用中のタスクワークスペースの状態から計算する（workspace/zones.ts）。操作は通さない（pointer-events: none）。
// FR-300: ゾーンの境界は枠の面として半透明の素材で描く。Focus で減光したゾーンは、呼び出すと広がる。切替の位置・大きさの変化は連続して動く（動きの軽減では即時）。
import { useMemo } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useActiveWorkspace } from '../store/taskWorkspaces';
import { useImmersion } from '../store/immersion';
import { ZONE_META, ZONE_NAMES, zoneLayout, type ZoneName } from './zones';
import { frameSurfaceStyle } from '../theme/frameMaterial';
import { useT } from '../i18n';

const useStyles = makeStyles({
  layer: { position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' },
  zone: {
    position: 'absolute', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
    padding: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground3,
    transitionProperty: 'left, width, opacity', transitionDuration: tokens.durationFast, transitionTimingFunction: tokens.curveEasyEase,
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
  // ゾーンの境界: 枠の面（半透明の素材）。コンポーネントの面（不透明）の下に置き、ゾーンの境目を示す
  boundary: {
    ...frameSurfaceStyle,
    position: 'absolute', top: 0, bottom: 0, width: '6px', boxSizing: 'border-box',
    color: tokens.colorNeutralForeground1,
    borderLeft: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
    transitionProperty: 'left, opacity', transitionDuration: tokens.durationFast, transitionTimingFunction: tokens.curveEasyEase,
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
  main: { backgroundColor: tokens.colorNeutralBackground1 },
  reference: { backgroundColor: tokens.colorNeutralBackground2 },
  communication: { backgroundColor: tokens.colorNeutralBackground3 },
  monitor: { backgroundColor: tokens.colorNeutralBackground4 },
  dimmed: { opacity: 0.7 },
  hidden: { display: 'none' },
});

export function ZoneLayer() {
  const s = useStyles();
  const t = useT();
  const w = useActiveWorkspace();
  const recalled = useImmersion((st) => st.recalled);
  const layout = useMemo(() => zoneLayout(w.mode, w.ratios, w.merged, recalled), [w.mode, w.ratios, w.merged, recalled]);
  return (
    <div className={s.layer} data-testid="zone-layer" aria-hidden>
      {ZONE_NAMES.map((n: ZoneName) => {
        const b = layout[n];
        const r = b.rect;
        return (
          <div
            key={n}
            data-testid={`zone-area-${n}`}
            data-role={ZONE_META[n].role}
            data-merged={b.merged ? 'true' : undefined}
            data-dimmed={b.dimmed ? 'true' : undefined}
            className={mergeClasses(s.zone, s[n], b.dimmed ? s.dimmed : undefined, r ? undefined : s.hidden)}
            style={r ? { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` } : undefined}
          >
            <span>{ZONE_META[n].label}（{t(ZONE_META[n].role)}）{b.merged ? t('・結合') : ''}</span>
          </div>
        );
      })}
      {ZONE_NAMES.map((n: ZoneName) => {
        const r = layout[n].rect;
        // 右隣にゾーンがある（最後のゾーンでない）ものの右端に境界を置く
        const hasNext = !!r && r.x + r.w < 0.999;
        return (
          <div
            key={`boundary-${n}`}
            data-testid={`zone-boundary-${n}`}
            className={mergeClasses(s.boundary, r && hasNext ? undefined : s.hidden)}
            style={r && hasNext ? { left: `calc(${(r.x + r.w) * 100}% - 3px)` } : undefined}
          />
        );
      })}
    </div>
  );
}
