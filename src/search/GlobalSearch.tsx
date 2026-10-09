// グローバル検索（FR-017）。ヘッダーの検索欄に入力すると、課題・解決策・製品などを種別ごとに表示し、選ぶとその対象が共通の選択状態になる。
// 入力欄の文字入力（H など）はパネルの操作に取られない。結果は矢印キー・Enter でも選べる。
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Input, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Search20Regular } from '@fluentui/react-icons';
import { useEntityGraph, useSelection } from '../selection/hooks';
import { countHits, searchGraph } from './model';

const ORIGIN = 'search';

const useStyles = makeStyles({
  root: { position: 'relative', minWidth: '220px', flexGrow: 1, maxWidth: '360px' },
  popup: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    marginTop: tokens.spacingVerticalXS,
    maxHeight: '60vh',
    overflowY: 'auto',
    padding: tokens.spacingHorizontalS,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
  },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
  option: {
    minHeight: '32px',
    display: 'flex',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
});

export function GlobalSearch() {
  const s = useStyles();
  const graph = useEntityGraph();
  const { select } = useSelection();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const groups = useMemo(() => searchGraph(graph, query), [graph, query]);
  const total = countHits(groups);
  const show = open && query.trim() !== '';

  const options = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  const choose = (id: string) => {
    select(id, { origin: ORIGIN });
    setOpen(false);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && show) { e.preventDefault(); options()[0]?.focus(); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };
  const onOptionKey = (e: KeyboardEvent<HTMLElement>, id: string) => {
    const all = options();
    const i = all.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(all.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.current?.focus(); else all[i - 1]?.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(id); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); input.current?.focus(); }
  };

  return (
    <div
      ref={root}
      className={s.root}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <Input
        ref={input}
        type="search"
        aria-label="検索"
        placeholder="課題・解決策・製品を検索"
        contentBefore={<Search20Regular aria-hidden />}
        value={query}
        aria-controls={show ? resultsId : undefined}
        style={{ width: '100%' }}
        onChange={(_, d) => { setQuery(d.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
      />
      {show ? (
        <div
          id={resultsId}
          className={s.popup}
          data-testid="search-results"
          role={total > 0 ? 'listbox' : 'region'}
          aria-label="検索結果"
        >
          {total === 0 ? <Text role="status">該当なし</Text> : null}
          {groups.map((g) => (
            <div key={g.kind} role="group" aria-label={`${g.label}（${g.hits.length} 件）`} className={s.group}>
              <Text size={200} weight="semibold" aria-hidden>{g.label}</Text>
              {g.hits.map((n) => (
                <div
                  key={n.id}
                  role="option"
                  aria-selected={false}
                  tabIndex={-1}
                  data-result-id={n.id}
                  className={s.option}
                  onClick={() => choose(n.id)}
                  onKeyDown={(e) => onOptionKey(e, n.id)}
                >
                  {n.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
