// フローティングツールバー（FR-091）。画面の端に浮かせたインクの道具。
// - 利き手の設定（設定パネル）で、画面の左右どちらの端に置くかが変わる（左利きなら左端、右利きなら右端）。
// - 自動で格納する: 描いている間は薄くして入力を邪魔しない。しばらく使わなければ小さな取っ手に畳む。
//   取っ手（ボタン）を押すか、Enter／Space で開き直せる。手動でも「ツールバーを格納」で畳める。
// - どのボードを操作するかは `InkToolbarHost` が決める（ホワイトボードを開いているとき・プレゼン中の注釈）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { Dismiss16Regular, PenSparkle24Regular } from '@fluentui/react-icons';
import { InkToolbar } from './InkToolbar';
import { selectBoard, useInk } from './store';
import { usePresentationInk, PRESENTATION_BOARD_ID } from './presentationInk';
import { effectiveLayout, useLayout } from '../store/layout';
import { currentTopic, usePresentationStore } from '../store/presentation';
import { useSettings } from '../store/settings';
import { isVisible } from '../workspace/layoutModel';

/** 操作がなければ畳むまでの時間（ミリ秒）。 */
export const AUTO_STOW_MS = 30_000;

const useStyles = makeStyles({
  host: { position: 'fixed', top: '50%', transform: 'translateY(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  left: { left: tokens.spacingHorizontalS, alignItems: 'flex-start' },
  right: { right: tokens.spacingHorizontalS, alignItems: 'flex-end' },
  panel: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    boxShadow: tokens.shadow16, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1,
    transitionProperty: 'opacity', transitionDuration: tokens.durationFast, transitionTimingFunction: tokens.curveEasyEase,
  },
  dim: { opacity: 0.25, pointerEvents: 'none' },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

export interface FloatingInkToolbarProps {
  boardId: string;
  label?: string;
  whiteboard?: boolean;
}

export function FloatingInkToolbar({ boardId, label = 'インクの道具', whiteboard = false }: FloatingInkToolbarProps) {
  const s = useStyles();
  const handedness = useSettings((st) => st.handedness);
  const [stowed, setStowed] = useState(false);
  const [dim, setDim] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armIdle = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      const h = host.current;
      // 操作中（ポインターが上にある・フォーカスがある）は畳まない
      if (h && (h.matches(':hover') || h.contains(document.activeElement))) { armIdle(); return; }
      setStowed(true);
    }, AUTO_STOW_MS);
  }, []);

  useEffect(() => {
    if (stowed) return undefined;
    armIdle();
    return () => { if (idle.current) clearTimeout(idle.current); };
  }, [stowed, armIdle]);

  // 描いている間（ツールバーの外のポインター押下中）は薄くして、入力の邪魔をしない
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const h = host.current;
      if (!h || !(e.target instanceof Node) || h.contains(e.target)) return;
      setDim(true);
    };
    const up = () => setDim(false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  return (
    <div
      ref={host}
      className={`${s.host} ${handedness === 'left' ? s.left : s.right}`}
      data-testid="floating-toolbar"
      data-side={handedness}
      onPointerDownCapture={() => { if (!stowed) armIdle(); }}
      onKeyDownCapture={() => { if (!stowed) armIdle(); }}
    >
      {stowed ? (
        <Button className={s.forcedAuto} appearance="primary" icon={<PenSparkle24Regular aria-hidden />} aria-label="ツールバーを開く" onClick={() => setStowed(false)} />
      ) : (
        <div className={`${s.panel} ${dim ? s.dim : ''}`}>
          <InkToolbar boardId={boardId} label={label} whiteboard={whiteboard} compact />
          <Button size="small" appearance="subtle" icon={<Dismiss16Regular aria-hidden />} aria-label="ツールバーを格納" onClick={() => setStowed(true)} />
        </div>
      )}
    </div>
  );
}

/**
 * アプリに 1 つだけ置く。プレゼン中の注釈を書く間はプレゼンのボード、そうでなくホワイトボードを表示している間はその（選択中の）ボードを操作する。
 * どちらでもなければ出さない（他のビューの上の注釈は、そのビューの「注釈の道具」を使う）。
 */
export function InkToolbarHost() {
  const wbVisible = useLayout((st) => isVisible(effectiveLayout(st), 'whiteboard'));
  const presenting = usePresentationStore((st) => currentTopic(st) !== null);
  const mode = usePresentationInk((st) => st.mode);
  const activeId = useInk((st) => st.activeBoardId);
  const activeIsBoard = useInk((st) => selectBoard(st.activeBoardId)(st)?.kind === 'board');

  const annotating = presenting && mode !== 'off';
  if (!annotating && !(wbVisible && activeIsBoard)) return null;
  return <FloatingInkToolbar boardId={annotating ? PRESENTATION_BOARD_ID : activeId} whiteboard={!annotating} />;
}
