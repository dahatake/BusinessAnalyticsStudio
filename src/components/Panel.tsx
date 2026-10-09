// 画面のパネルの共通の外枠（見出し・説明）。画面はこれで包み、見た目の体系をそろえる。
// 顧客パックにサンプルの項目があるときは、見出しの横に「サンプル」を明記する（FR-008）。
import type { ReactNode } from 'react';
import { Badge, Text, makeStyles, tokens } from '@fluentui/react-components';
import { hasSampleData } from '../data/sample';
import { usePackStore } from '../store/pack';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: '960px',
  },
  head: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  titleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM },
  sample: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
});

export interface PanelProps {
  testId: string;
  title: string;
  description?: string;
  /** 外枠の最大の幅（既定は 960px）。表や図で広く使う画面が指定する */
  maxWidth?: string;
  children: ReactNode;
}

export function Panel({ testId, title, description, maxWidth, children }: PanelProps) {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const sample = state.status === 'ready' && hasSampleData(state.pack.data);
  return (
    <section data-testid={testId} className={s.root} style={maxWidth ? { maxWidth } : undefined} aria-label={title}>
      <div className={s.head}>
        <div className={s.titleRow}>
          <Text as="h2" size={600} weight="semibold" block>{title}</Text>
          {sample ? (
            <span className={s.sample} data-testid="sample-badge">
              <Badge appearance="filled" color="warning" size="large">サンプル</Badge>
              <Text size={200}>架空のサンプルデータを表示しています</Text>
            </span>
          ) : null}
        </div>
        {description ? <Text size={300}>{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}
