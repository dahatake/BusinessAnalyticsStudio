// ショーコントロールバー（FR-084）の枠。操作がない状態が PARAM-026（3 秒）続くと隠れ、ポインターの動きかフォーカスで再表示する。
// バーの中にフォーカスがある間は隠れない。この項目（I20-audio）では音声の操作（ミュート・音量。FR-074）を置く。
// 再生/停止・演出強度・3D 品質などの操作は、FR-084 の項目が children として足す。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { AudioControls } from '../audio/AudioControls';

/** PARAM-026: ショーコントロールバーが自動で隠れるまでの時間（秒） */
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
  hidden: { display: 'none' },
});

export function ShowControlBar({ children }: { children?: ReactNode }) {
  const s = useStyles();
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    const arm = () => {
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        // バーの中にフォーカスがある間は隠さない
        if (ref.current?.contains(document.activeElement)) return;
        setVisible(false);
      }, SHOW_BAR_HIDE_SECONDS * 1000);
    };
    const reveal = () => { setVisible(true); arm(); };
    // Tab キーでも再表示する（隠れたバーの操作にキーボードで届くため）
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab' || ref.current?.contains(e.target as Node)) reveal(); };
    const onFocusOut = () => arm();
    arm();
    window.addEventListener('pointermove', reveal, true);
    window.addEventListener('pointerdown', reveal, true);
    window.addEventListener('focusin', reveal, true);
    window.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      clear();
      window.removeEventListener('pointermove', reveal, true);
      window.removeEventListener('pointerdown', reveal, true);
      window.removeEventListener('focusin', reveal, true);
      window.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={visible ? s.bar : `${s.bar} ${s.hidden}`}
      data-testid="show-control-bar"
      role="toolbar"
      aria-label="ショーコントロールバー"
    >
      <AudioControls />
      {children}
    </div>
  );
}
