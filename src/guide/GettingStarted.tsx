// メイン画面の「はじめての方へ」と「顧客パック」の region（FR-266・FR-268）。「使い方を見る」は右上のアイコン（WelcomeIconButton。FR-267）。
import { Text, Title3, makeStyles, tokens } from '@fluentui/react-components';
import { FlowSection, PackSection, StepsSection, TermsSection, WhatSection } from './GuideParts';
import { useT } from '../i18n';

const useStyles = makeStyles({
  region: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
});

export function GettingStarted() {
  const s = useStyles();
  const t = useT();
  return (
    <>
      <section role="region" aria-label={t('はじめての方へ')} className={s.region} data-testid="getting-started">
        <div className={s.head}>
          <Title3 as="h2">{t('はじめての方へ')}</Title3>
        </div>
        <WhatSection />
        <TermsSection />
        <StepsSection />
        <FlowSection />
        <Text size={200}>{t('この説明は、いつでもここで読めます。')}</Text>
      </section>
      <section role="region" aria-label={t('顧客パック')} className={s.region} data-testid="pack-guide">
        <Title3 as="h2">{t('顧客パックとは')}</Title3>
        <PackSection withHeading={false} />
      </section>
    </>
  );
}