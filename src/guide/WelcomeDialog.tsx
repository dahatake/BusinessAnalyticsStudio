// ウェルカム／使い方のダイアログ（FR-267・FR-272）。カードを「次へ」「戻る」「スキップ」で送る。
// 「次回から表示しない」を選んで閉じたときだけ確認済みを記録する。Esc で閉じ、閉じると焦点が開く前の位置へ戻る（components/Dialog）。
import { useState, type ReactNode } from 'react';
import { Button, Checkbox, DialogActions, DialogBody, DialogContent, DialogTitle, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { useMotionAllowed } from '../motion/transitions';
import { useGuide, type GuideVariant } from './guideStore';
import { PackSection, StepsSection, TermsSection, WhatSection, FlowSection, WorkspaceSection } from './GuideParts';

const useStyles = makeStyles({
  surface: { maxWidth: '720px', width: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' },
  card: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minHeight: '12rem' },
  fade: { animationName: { from: { opacity: 0 }, to: { opacity: 1 } }, animationDuration: tokens.durationFast, animationTimingFunction: tokens.curveDecelerateMid },
  nofade: { animationName: 'none' }, // 動きを減らす設定のときは、カードの切替にアニメーションを付けない（0 ms）
  pos: { color: tokens.colorNeutralForeground2 },
});

interface Card { id: string; title: string; body: ReactNode }

function cardsFor(variant: GuideVariant): Card[] {
  const shared: Card[] = [
    { id: 'what', title: 'このアプリでできること', body: <WhatSection /> },
    { id: 'terms', title: '用語の説明', body: <TermsSection /> },
    { id: 'steps', title: '4 つの手順', body: <><StepsSection /><FlowSection /></> },
    { id: 'pack', title: '顧客パックとは', body: <PackSection withHeading={false} /> },
  ];
  return variant === 'workspace' ? [{ id: 'workspace', title: '画面の見方とよく使う操作', body: <WorkspaceSection /> }, ...shared] : shared;
}

export function WelcomeDialogView({ variant, onClose }: { variant: GuideVariant; onClose: (dontShow: boolean) => void }) {
  const s = useStyles();
  const motion = useMotionAllowed();
  const cards = cardsFor(variant);
  const [i, setI] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const card = cards[i]!;
  const last = i === cards.length - 1;
  const name = variant === 'workspace' ? '使い方' : 'ウェルカム';
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) onClose(dontShow); }}>
      <DialogSurface className={s.surface} aria-label={name}>
        <DialogBody>
          <DialogTitle>{name}：{card.title}</DialogTitle>
          <DialogContent>
            <Text className={s.pos} role="status" aria-live="polite" data-testid="guide-position">{`カード ${i + 1} / ${cards.length}`}</Text>
            <div key={card.id} className={`${s.card} ${motion ? s.fade : s.nofade}`} data-testid="guide-card" data-motion-ms={motion ? 150 : 0}>{card.body}</div>
            {variant === 'main' ? <Checkbox label="次回から表示しない" checked={dontShow} onChange={(_, d) => setDontShow(d.checked === true)} /> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onClose(dontShow)}>スキップ</Button>
            <Button appearance="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>戻る</Button>
            {last
              ? <Button appearance="primary" onClick={() => onClose(dontShow)}>閉じる</Button>
              : <Button appearance="primary" autoFocus onClick={() => setI(i + 1)}>次へ</Button>}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** App に 1 つ置く。開閉は useGuide（メイン画面の「使い方を見る」・分析画面の「使い方」・起動時の自動表示） */
export function GuideHost() {
  const open = useGuide((g) => g.open);
  const variant = useGuide((g) => g.variant);
  const close = useGuide((g) => g.close);
  return open ? <WelcomeDialogView key={variant} variant={variant} onClose={close} /> : null;
}