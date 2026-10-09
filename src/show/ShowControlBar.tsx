// ショーコントロールバー（FR-084）。再生/停止・ミュート/音量・演出強度・3D 品質・Light/Dark・全画面・プレゼンタービュー・レーザーポインター・オープニングの再生を並べる。
// 操作がない状態が PARAM-026（3 秒）続くと、バー（操作部）は見えなくなる。ポインターの動き・フォーカス・Tab で再表示し、バーの中にフォーカスがある間は隠れない。
// バーが隠れている間も、ミュートのボタン（FR-074: 常に表示）だけは小さく出し続ける（`show-mute-dock`）。
// children がなければ、隠す処理は動かない（ミュート/音量だけの枠）。`autoHide={false}` で隠さない。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { AudioControls, MuteButton } from '../audio/AudioControls';

/** PARAM-026: ショーコントロールバーの（常時表示でない）操作が自動で隠れるまでの時間（秒） */
export const SHOW_BAR_HIDE_SECONDS = 3;

const useStyles = makeStyles({
  bar: {
    position: 'fixed',
    left: '50%',
    bottom: tokens.spacingVerticalM,
    transform: 'translateX(-50%)',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXS,
    maxWidth: 'calc(100vw - 16px)',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
  },
  // 隠れているとき: 大きさを 0 にして見えなくする（display:none にしない。キーボードのフォーカスで届き、再表示できるようにするため）
  barHidden: {
    width: 0,
    height: 0,
    padding: 0,
    columnGap: 0,
    rowGap: 0,
    overflow: 'hidden',
    flexWrap: 'nowrap',
    border: 'none',
    boxShadow: 'none',
  },
  // バーが隠れている間も出し続ける、ミュートだけの小さな表示（FR-074: ミュートボタンは常に表示する）
  dock: {
    position: 'fixed',
    left: '50%',
    bottom: tokens.spacingVerticalM,
    transform: 'translateX(-50%)',
    zIndex: 20,
    padding: `0 ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow8,
  },
});

export function ShowControlBar({ children, autoHide = true }: { children?: ReactNode; autoHide?: boolean }) {
  const s = useStyles();
  const [extraVisible, setExtraVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExtra = children !== undefined && children !== null && children !== false;

  useEffect(() => {
    if (!autoHide || !hasExtra) { setExtraVisible(true); return undefined; }
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    const arm = () => {
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        // バーの中にフォーカスがある間は隠さない
        if (ref.current?.contains(document.activeElement)) return;
        setExtraVisible(false);
      }, SHOW_BAR_HIDE_SECONDS * 1000);
    };
    const reveal = () => { setExtraVisible(true); arm(); };
    // Tab キーでも再表示する（隠れた操作にキーボードで届くため）
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab' || ref.current?.contains(e.target as Node)) reveal(); };
    arm();
    window.addEventListener('pointermove', reveal, true);
    window.addEventListener('pointerdown', reveal, true);
    window.addEventListener('focusin', reveal, true);
    window.addEventListener('focusout', arm, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      clear();
      window.removeEventListener('pointermove', reveal, true);
      window.removeEventListener('pointerdown', reveal, true);
      window.removeEventListener('focusin', reveal, true);
      window.removeEventListener('focusout', arm, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [autoHide, hasExtra]);

  const hidden = hasExtra && !extraVisible;
  return (
    <>
      <div ref={ref} className={mergeClasses(s.bar, hidden && s.barHidden)} data-testid="show-control-bar" role="toolbar" aria-label="ショーコントロールバー">
        <AudioControls />
        {hasExtra ? <>{children}</> : null}
      </div>
      {hidden ? <div className={s.dock} data-testid="show-mute-dock"><MuteButton /></div> : null}
    </>
  );
}
