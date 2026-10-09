// ビジネス⇔IT のレンズ（FR-019）。切り替え（ビジネス／IT）または並置。同じ ID の項目は共通の選択状態で連動して強調される。
import { useMemo } from 'react';
import { Radio, RadioGroup, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useHighlightClass } from '../components/highlight';
import { GlossaryText } from '../glossary/GlossaryText';
import { onEntityKey, useEntityBinding, useEntityGraph } from '../selection/hooks';
import { useLens } from '../store/lens';
import { LENS_LABELS, LENS_MODES, buildLensItems, type LensItem, type LensMode } from './model';

/** 選択を起こしたビューとして記録する名前 */
const ORIGIN = 'canvas';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  panes: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalM,
  },
  panesBoth: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' } },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    minWidth: 0,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, margin: 0, padding: 0, listStyle: 'none' },
  item: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
});

function LensPane({ testId, title, items, field }: { testId: string; title: string; items: LensItem[]; field: 'businessNote' | 'itNote' }) {
  const s = useStyles();
  const bind = useEntityBinding(ORIGIN);
  const hl = useHighlightClass();
  return (
    <section className={s.pane} data-testid={testId} aria-label={`${title}のレンズ`}>
      <Text as="h3" weight="semibold">{title}のレンズ</Text>
      <ul className={s.list}>
        {items.map((it) => {
          const props = bind(it.id, { filterable: false });
          return (
            <li
              key={it.id}
              {...props}
              className={mergeClasses(s.item, hl(props['data-highlight']))}
              tabIndex={0}
              onKeyDown={(e) => { onEntityKey(e, it.id, ORIGIN); }}
            >
              <Text weight="semibold">{field === 'businessNote' ? <GlossaryText>{it.label}</GlossaryText> : it.label}</Text>
              <Text size={200}>{it[field]}</Text>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LensView() {
  const s = useStyles();
  const mode = useLens((st) => st.mode);
  const setMode = useLens((st) => st.setMode);
  const graph = useEntityGraph();
  const items = useMemo(() => buildLensItems(graph), [graph]);
  return (
    <div className={s.root} data-testid="lens" data-lens-mode={mode}>
      <RadioGroup aria-label="レンズ" layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as LensMode)}>
        {LENS_MODES.map((m) => <Radio key={m} value={m} label={LENS_LABELS[m]} />)}
      </RadioGroup>
      <div className={mergeClasses(s.panes, mode === 'both' ? s.panesBoth : undefined)}>
        {mode !== 'it' ? <LensPane testId="lens-business" title="ビジネス" items={items} field="businessNote" /> : null}
        {mode !== 'business' ? <LensPane testId="lens-it" title="IT" items={items} field="itNote" /> : null}
      </div>
      {items.length === 0 ? <Text size={200}>レンズに並べる項目が顧客パックにありません。</Text> : null}
    </div>
  );
}
