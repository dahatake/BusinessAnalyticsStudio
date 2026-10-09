// オープニング（顧客名とプロジェクト名）。Esc・クリック・ボタンで本編へ進む（FR-101）。
import { useEffect } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useAnimation } from '../store/animation';
import { DURATION, EASING, scaledDuration } from '../motion/fluent';
import { useMotionProfile } from '../motion/useMotion';

const useStyles = makeStyles({
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    zIndex: 1000,
    textAlign: 'center',
    padding: tokens.spacingHorizontalXXL,
  },
  // Fluent 2 のモーション（FR-070）: 入る動きは Decelerate でフェードしながら少し上がる
  enter: {
    animationName: {
      from: { opacity: 0, transform: 'translateY(12px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    animationFillMode: 'both',
  },
});

export function Opening({ customerName, projectName, onDone }: { customerName: string; projectName: string; onDone: () => void }) {
  const s = useStyles();
  const playing = useAnimation((st) => st.playing);
  const { tempo } = useMotionProfile();
  // 動きを減らす設定・停止中は静止画の版（動きを付けない。FR-072）
  const enterStyle = playing
    ? { animationDuration: `${scaledDuration(DURATION.ultraSlow, tempo, true)}ms`, animationTimingFunction: EASING.decelerateMid }
    : undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  return (
    <div className={s.root} data-testid="opening" data-motion={playing ? 'animated' : 'static'} role="dialog" aria-label="オープニング">
      <div className={playing ? s.enter : undefined} style={enterStyle}>
        <Text as="h1" size={900} weight="semibold">{customerName}</Text>
      </div>
      <div className={playing ? s.enter : undefined} style={enterStyle}>
        <Text size={500}>{projectName}</Text>
      </div>
      <Button appearance="primary" onClick={onDone}>はじめる（Esc で飛ばす）</Button>
    </div>
  );
}
