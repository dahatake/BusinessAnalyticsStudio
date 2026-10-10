// 出典（FR-025 AC-030）。顧客パックの出典を一覧し、各出典を根拠にしている項目（拠点・課題・機能など）を並べる。
// 出典と項目はどちらも選択を共通にし、他のビューで選んだ項目はここでハイライトされる（選択は FR-024 のストア）。
import { Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { onEntityKey, useEntityBinding, useEntityGraph } from '../selection/hooks';
import { usePackStore } from '../store/pack';

const ORIGIN = 'sources';

const useStyles = makeStyles({
  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  card: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  cited: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  chip: {
    cursor: 'pointer',
    paddingInline: tokens.spacingHorizontalS,
    minHeight: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
});

function SourcesScreen() {
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const graph = useEntityGraph();
  const state = usePackStore((st) => st.state);
  const data = state.status === 'ready' ? state.pack.data : undefined;
  if (!data || !graph) return <LoadingView label="出典を読み込み中" />;
  const sources = data.sources.sources;

  return (
    <Panel testId="component-sources" title="出典" description="各出典と、それを根拠にしている項目です。どちらを選んでも、ほかのビューで同じ項目が強調されます。" maxWidth="1200px">
      {sources.length === 0 ? (
        <EmptyView message="出典がありません。" />
      ) : (
        <ul className={s.list} aria-label="出典の一覧">
          {sources.map((src) => {
            const props = bind(src.id);
            const cited = [...graph.neighbors(src.id)].map((id) => graph.node(id)).filter((n) => n !== undefined && n.kind !== 'source');
            return (
              <li key={src.id} data-testid="source-entry" className={mergeClasses(s.card, hl(props['data-highlight']))} tabIndex={0} {...props} onKeyDown={(e) => onEntityKey(e, src.id, ORIGIN)}>
                <Text weight="semibold">{src.title}</Text>
                <Text size={200}>{[src.kind, src.retrievedAt ? `取得 ${src.retrievedAt}` : '', src.confidence ? `確度 ${src.confidence}` : ''].filter(Boolean).join(' ／ ')}</Text>
                {cited.length > 0 ? (
                  <ul className={s.cited} aria-label={`${src.title} を根拠にする項目`}>
                    {cited.map((n) => {
                      const cp = bind(n!.id);
                      return (
                        <li
                          key={n!.id}
                          className={mergeClasses(s.chip, hl(cp['data-highlight']))}
                          tabIndex={0}
                          {...cp}
                          onClick={(e) => { e.stopPropagation(); cp.onClick?.(e); }}
                          onKeyDown={(e) => { if (onEntityKey(e, n!.id, ORIGIN)) e.stopPropagation(); }}
                        >
                          {n!.label}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export { SourcesScreen };
