// オープニング（顧客名とプロジェクト名）。Esc・クリック・ボタンで本編へ進む（FR-101）。
import { useEffect } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';

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
});

export function Opening({ customerName, projectName, onDone }: { customerName: string; projectName: string; onDone: () => void }) {
  const s = useStyles();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  return (
    <div className={s.root} data-testid="opening" role="dialog" aria-label="オープニング">
      <Text as="h1" size={900} weight="semibold">{customerName}</Text>
      <Text size={500}>{projectName}</Text>
      <Button appearance="primary" onClick={onDone}>はじめる（Esc で飛ばす）</Button>
    </div>
  );
}
