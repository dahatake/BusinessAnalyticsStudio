// 作業領域の上部に置く、中核オブジェクト（FR-018）とビジネス⇔IT のレンズ（FR-019）。
// 画面「キャンバス」の廃止（FR-012）に伴い、画面ではなく作業領域の帯に移した（機能は変えない）。
import { useState } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { CoreObjectPanel } from '../coreobject/CoreObjectPanel';
import { LensView } from '../lens/LensView';
import { useCoreObject } from '../store/coreObject';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, flex: '0 0 auto', maxHeight: '35vh', overflowY: 'auto',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  core: {
    display: 'inline-flex', columnGap: tokens.spacingHorizontalS, alignItems: 'baseline', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusXLarge,
  },
});

export function WorkspaceOverview() {
  const s = useStyles();
  const { selected: core } = useCoreObject();
  const [showReason, setShowReason] = useState(false);
  return (
    <section className={s.root} aria-label="中核オブジェクトとレンズ">
      <div className={s.row}>
        {core ? (
          <div data-testid="core-object" data-entity-id={core.id} className={s.core} role="group" aria-label={`中核オブジェクト: ${core.name}`}>
            <Text size={200}>中核オブジェクト</Text>
            <Text weight="semibold" size={400}>{core.name}</Text>
          </div>
        ) : <Text size={200}>中核オブジェクト: 未設定</Text>}
        <Button aria-expanded={showReason} aria-controls="core-object-reason" onClick={() => setShowReason((v) => !v)}>選定理由</Button>
      </div>
      <div id="core-object-reason">{showReason ? <CoreObjectPanel /> : null}</div>
      <LensView />
    </section>
  );
}
