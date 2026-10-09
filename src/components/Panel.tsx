// 画面のパネルの共通の外枠（見出し・説明）。画面はこれで包み、見た目の体系をそろえる。
import type { ReactNode } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: '960px',
  },
  head: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
});

export interface PanelProps {
  testId: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Panel({ testId, title, description, children }: PanelProps) {
  const s = useStyles();
  return (
    <section data-testid={testId} className={s.root} aria-label={title}>
      <div className={s.head}>
        <Text as="h2" size={600} weight="semibold" block>{title}</Text>
        {description ? <Text size={300}>{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}
