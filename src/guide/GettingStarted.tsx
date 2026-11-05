// メイン画面の右側の補足パネル（FR-266・FR-268。「使い方を見る」は右上の WelcomeIconButton。FR-267）。「はじめての方へ」と「顧客パックとは」を 1 つにまとめ、開閉ボタンで表示/非表示を切り替える。
// 既定は閉じた状態（再読込後も）。開閉は短いアニメーション（PARAM-074: 500ms 以内）で、prefers-reduced-motion: reduce では 0（即時）。
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Text, Title3, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import { FlowSection, PackSection, StepsSection, TermsSection, WhatSection } from './GuideParts';
import { useT } from '../i18n';
import { usePackUploadUi } from '../projects/packUploadUi';

/** 開閉のアニメーションの長さ（ms。PARAM-074 の 500ms 以内） */
export const PANEL_MOTION_MS = 200;

const useStyles = makeStyles({
  panel: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  toggle: { alignSelf: 'flex-start' },
  region: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1, minWidth: 0, overflowWrap: 'anywhere',
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  motion: {
    animationDuration: `${PANEL_MOTION_MS}ms`, animationTimingFunction: tokens.curveEasyEase, animationFillMode: 'both',
    '@media (prefers-reduced-motion: reduce)': { animationDuration: '0ms', transitionDuration: '0ms' },
  },
  enter: { animationName: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } } },
  leave: { animationName: { from: { opacity: 1, transform: 'translateY(0)' }, to: { opacity: 0, transform: 'translateY(-8px)' } } },
});

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function GettingStarted() {
  const s = useStyles();
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false); // 既定は閉じる（AC-675）
  const [shown, setShown] = useState(false); // 閉じるアニメーションが終わるまで描画を残す
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggle = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!open) { setShown(true); setOpen(true); return; }
    setOpen(false);
    if (reducedMotion()) setShown(false); // 動きの軽減: 即座に切り替える（AC-820）
    else timer.current = setTimeout(() => { setShown(false); timer.current = null; }, PANEL_MOTION_MS);
  };

  return (
    <div className={s.panel} data-testid="getting-started-panel">
      <div className={s.head}>
      <Button
        className={s.toggle}
        appearance="secondary"
        icon={open ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {t('はじめての方へ')}
      </Button>
      </div>
      {shown ? (
        <section id={id} role="region" aria-label={t('はじめての方へ')} className={`${s.region} ${s.motion} ${open ? s.enter : s.leave}`} data-testid="getting-started">
          <Title3 as="h2">{t('はじめての方へ')}</Title3>
          <WhatSection />
          <TermsSection />
          <StepsSection />
          <FlowSection />
          <Text size={200}>{t('この説明は、いつでもここで読めます。')}</Text>
          <section role="region" aria-label={t('顧客パック')} className={s.card} data-testid="pack-guide">
            <Title3 as="h2">{t('顧客パックとは')}</Title3>
            <PackSection withHeading={false} entry={<Button appearance="primary" onClick={() => usePackUploadUi.getState().show()}>{t('顧客パックを取り込む')}</Button>} />
          </section>
        </section>
      ) : null}
    </div>
  );
}