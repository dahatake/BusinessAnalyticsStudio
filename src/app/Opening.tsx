// オープニング（FR-076）。カウントダウン → ロゴ → アプリケーション名「Business Analytics Studio」のリビール。表示する文字はアプリ名だけ（顧客名・Project 名は出さない）。
// 演出強度に関わらず Entertainment スタイル（拡大・上昇・光彩）で再生する。
// 全体の長さは OPENING_TOTAL_MS（PARAM-011〜012 の範囲）で、終わると本編に移る。スキップのボタン・Esc でも本編へ移れる（FR-101）。
// 動きを減らす設定・停止中は、動かさない版（アプリ名を静止画で表示。FR-072）。
import { useEffect, useState } from 'react';
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { DURATION, EASING, scaledDuration } from '../motion/fluent';
import { useMotionProfile } from '../motion/useMotion';
import { OPENING_TOTAL_MS, clampOpeningMs, openingPhaseAt } from '../show/model';
import { useAnimation } from '../store/animation';
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
  mark: {
    width: '96px',
    height: '96px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundImage: `radial-gradient(circle at 35% 30%, ${tokens.colorBrandBackground2Hover}, ${tokens.colorBrandBackground})`,
    filter: `drop-shadow(0 0 24px ${tokens.colorBrandBackground})`,
  },
  title: { maxWidth: '16em', overflowWrap: 'anywhere', fontSize: '64px', lineHeight: 1.1, color: tokens.colorBrandForeground1, filter: `drop-shadow(0 0 12px ${tokens.colorBrandBackground})` },
  glow: {
    animationName: { '0%': { filter: `drop-shadow(0 0 4px ${tokens.colorBrandBackground})` }, '50%': { filter: `drop-shadow(0 0 28px ${tokens.colorBrandBackground})` }, '100%': { filter: `drop-shadow(0 0 12px ${tokens.colorBrandBackground})` } },
    animationFillMode: 'both',
  },
  // Entertainment スタイル（FR-076）: 入る動きは Decelerate。上昇・拡大・光彩で派手に見せる（演出強度に関わらず）
  rise: {
    animationName: { from: { opacity: 0, transform: 'translateY(48px) scale(0.6)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
    animationFillMode: 'both',
  },
  pop: {
    animationName: { from: { opacity: 0, transform: 'scale(0.7)' }, to: { opacity: 1, transform: 'scale(1)' } },
    animationFillMode: 'both',
  },
});

export function Opening({ onDone }: { onDone: () => void }) {
  const s = useStyles();
  const t = useT();
  const playing = useAnimation((st) => st.playing);
  const { tempo } = useMotionProfile();
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
  const enter = playing ? s.rise : undefined;
  const appName = t('Business Analytics Studio');

  return (
    <div
      className={s.root}
      data-testid="opening"
      data-phase={phase}
      data-motion={playing ? 'animated' : 'static'}
      role="dialog"
      aria-label={t('オープニング')}
    >
      <div className={s.stage}>
        {phase === 'countdown' ? (
          <span key={count} className={mergeClasses(s.count, playing ? s.pop : undefined)} style={enterStyle} data-testid="opening-count" aria-label={t('カウントダウン {count}', { count })}>
            {count}
          </span>
        ) : null}
        {phase === 'logo' || phase === 'title' ? (
          <div className={phase === 'logo' ? enter : undefined} style={phase === 'logo' ? enterStyle : undefined} data-testid="opening-logo">
            <div className={s.mark} aria-hidden />
          </div>
        ) : null}
        {phase === 'title' ? (
          <div className={enter} style={enterStyle}>
            <Text as="h1" weight="bold" className={mergeClasses(s.title, playing ? s.glow : undefined)} style={playing ? { animationDuration: `ms` } : undefined} data-testid="opening-title">{appName}</Text>
          </div>
        ) : null}
      </div>
      <Button appearance="primary" onClick={onDone}>{t('スキップ（Esc）')}</Button>
    </div>
  );
}
