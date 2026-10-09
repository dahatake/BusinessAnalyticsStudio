// 専門用語に用語集の定義のツールチップを付けて表示する（FR-019）。語はキーボードのフォーカスでも定義を出す。
import { Fragment, useMemo } from 'react';
import { Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { usePackStore } from '../store/pack';
import { splitByGlossary, type GlossaryEntry } from './model';

const useStyles = makeStyles({
  term: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
    cursor: 'help',
    borderRadius: tokens.borderRadiusSmall,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
});

/** 顧客パックの用語集。なければ空。 */
export function useGlossary(): GlossaryEntry[] {
  const state = usePackStore((s) => s.state);
  const glossary = state.status === 'ready' ? state.pack.data.customer.glossary : undefined;
  return useMemo(() => (glossary ?? []).map((g) => ({ term: g.term, definition: g.definition })), [glossary]);
}

export function GlossaryText({ children }: { children: string }) {
  const s = useStyles();
  const glossary = useGlossary();
  const parts = useMemo(() => splitByGlossary(children, glossary), [children, glossary]);
  return (
    <>
      {parts.map((p, i) => p.entry ? (
        <Tooltip key={i} content={p.entry.definition} relationship="description" withArrow>
          <span className={s.term} data-glossary-term={p.entry.term} tabIndex={0}>{p.text}</span>
        </Tooltip>
      ) : <Fragment key={i}>{p.text}</Fragment>)}
    </>
  );
}
