// オープニング（FR-076）。カウントダウン → ロゴのリビール → タイトル「{顧客名} × Microsoft — {Project名}: The Future Ahead」。
// 全体の長さは OPENING_TOTAL_MS（PARAM-011〜012 の範囲）で、終わると本編に移る。スキップのボタン・Esc でも本編へ移れる（FR-101）。
// 動きを減らす設定・停止中は、動かさない版（タイトルを静止画で表示。FR-072）。
import { useEffect, useState } from 'react';
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { BrandLockup } from '../components/Brand';
import { DURATION, EASING, scaledDuration } from '../motion/fluent';
import { useIntensity, useMotionProfile } from '../motion/useMotion';
import { OPENING_TOTAL_MS, clampOpeningMs, openingPhaseAt, openingTitle } from '../show/model';
import { useAnimation } from '../store/animation';
import { useEffectiveBrand } from '../theme/useBrand';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: tokens.spacingVerticalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    zIndex: 1000,
    textAlign: 'center',
    padding: tokens.spacingHorizontalXXL,
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: tokens.spacingVerticalL,
    minHeight: '40vh',
  },
  count: {
    fontSize: '120px',
    lineHeight: 1,
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorBrandForeground1,
    fontVariantNumeric: 'tabular-nums',
  },
  title: { maxWidth: '24em', overflowWrap: 'anywhere' },
  caption: { color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
  // Fluent 2 のモーション（FR-070）: 入る動きは Decelerate。Executive は動かさずフェードだけ、Showcase・Entertainment は少し上がる／拡大する
  fade: {
    animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationFillMode: 'both',
  },
  rise: {
    animationName: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
    animationFillMode: 'both',
  },
  pop: {
    animationName: { from: { opacity: 0, transform: 'scale(0.7)' }, to: { opacity: 1, transform: 'scale(1)' } },
    animationFillMode: 'both',
  },
});

export function Opening({ customerName, projectName, onDone }: { customerName: string; projectName: string; onDone: () => void }) {
  const s = useStyles();
  const t = useT();
  const playing = useAnimation((st) => st.playing);
  const { tempo } = useMotionProfile();
  const intensity = useIntensity();
  const brand = useEffectiveBrand();
  const [elapsed, setElapsed] = useState(0);
  const total = clampOpeningMs(OPENING_TOTAL_MS);

  // 経過時間を進め、全体の長さに達したら本編へ移る
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const e = performance.now() - t0;
      setElapsed(e);
      if (e >= total) onDone();
    }, 200);
    return () => window.clearInterval(id);
  }, [total, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const { phase, count } = openingPhaseAt(elapsed, playing);
  const enterStyle = playing
    ? { animationDuration: `${scaledDuration(DURATION.ultraSlow * 2, tempo, true)}ms`, animationTimingFunction: EASING.decelerateMid }
    : undefined;
  const enter = playing ? (intensity === 'Executive' ? s.fade : s.rise) : undefined;
  const title = openingTitle(customerName, projectName);

  return (
    <div
      className={s.root}
      data-testid="opening"
      data-phase={phase}
      data-motion={playing ? 'animated' : 'static'}
      role="dialog"
      aria-label={t('オープニング')}
    >
      <Text size={300} className={s.caption} data-testid="opening-caption">{customerName} ／ {projectName}</Text>
      <div className={s.stage}>
        {phase === 'countdown' ? (
          <span key={count} className={mergeClasses(s.count, playing ? s.pop : undefined)} style={enterStyle} data-testid="opening-count" aria-label={t('カウントダウン {count}', { count })}>
            {count}
          </span>
        ) : null}
        {phase === 'logo' || phase === 'title' ? (
          <div className={phase === 'logo' ? enter : undefined} style={phase === 'logo' ? enterStyle : undefined} data-testid="opening-logo">
            {brand ? <BrandLockup brand={brand} customerName={customerName} /> : null}
          </div>
        ) : null}
        {phase === 'title' ? (
          <div className={enter} style={enterStyle}>
            <Text as="h1" size={900} weight="semibold" className={s.title} data-testid="opening-title">{title}</Text>
          </div>
        ) : null}
      </div>
      <Button appearance="primary" onClick={onDone}>{t('スキップ（Esc）')}</Button>
    </div>
  );
}
