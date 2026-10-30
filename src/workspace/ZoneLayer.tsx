// ゾーンの面（FR-298）。作業領域（main）の全体を、意味名つきのゾーンで隙間・重なりなく覆う背景の層。コンポーネントはこの上に置かれる。
// ゾーンの割合・結合・モードは、利用中のタスクワークスペースの状態から計算する（workspace/zones.ts）。操作は通さない（pointer-events: none）。
import { useMemo } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useActiveWorkspace } from '../store/taskWorkspaces';
import { ZONE_META, ZONE_NAMES, zoneLayout, type ZoneName } from './zones';
import { useT } from '../i18n';

const useStyles = makeStyles({
  layer: { position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' },
  zone: {
    position: 'absolute', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
    padding: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground3,
    borderRight: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke2}`,
    transitionProperty: 'left, width, opacity', transitionDuration: tokens.durationFast, transitionTimingFunction: tokens.curveEasyEase,
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
  const layout = useMemo(() => zoneLayout(w.mode, w.ratios, w.merged), [w.mode, w.ratios, w.merged]);
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
    </div>
  );
}
