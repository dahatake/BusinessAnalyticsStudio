// ショーコントロールバー（FR-084）の枠。ミュートボタンとミュートの状態の表示・音量（FR-074）は、常に表示する。
// 自動で隠れるのは、FR-084 が children として足す他の操作（再生/停止・演出強度・3D 品質など）だけ。
// 操作がない状態が PARAM-026（3 秒）続くと children を隠し、ポインターの動き・フォーカス・Tab で再表示する。バーの中にフォーカスがある間は隠れない。
// children がなければ、隠す処理は動かない。`autoHide={false}` で children も常に表示する。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { AudioControls } from '../audio/AudioControls';

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
  extra: { display: 'contents' },
  extraHidden: { display: 'none' },
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

  return (
    <div ref={ref} className={s.bar} data-testid="show-control-bar" role="toolbar" aria-label="ショーコントロールバー">
      <AudioControls />
      {hasExtra ? <div className={extraVisible ? s.extra : s.extraHidden} data-testid="show-control-bar-extra">{children}</div> : null}
    </div>
  );
}
