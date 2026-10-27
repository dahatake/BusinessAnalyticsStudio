// 中核オブジェクトの選定理由パネル（FR-018）。候補すべて・比較の観点・選定理由を示し、別の候補に変更できる。
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { GlossaryText } from '../glossary/GlossaryText';
import { useCoreObject } from '../store/coreObject';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tableBox: { overflowX: 'auto' },
});

export function CoreObjectPanel() {
  const s = useStyles();
  const t = useT();
  const { info, selectedId, selected, choose } = useCoreObject();
  return (
    <section className={s.root} data-testid="component-core-object" data-tier="supporting" aria-label={t('中核オブジェクトの選定理由')}>
      <Text as="h3" weight="semibold">{t('中核オブジェクトの選定理由')}</Text>
      {info.candidates.length === 0 ? (
        <Text>{t('中核オブジェクトの候補が顧客パックの customer.json にありません。')}</Text>
      ) : (
        <>
          <RadioGroup aria-label={t('中核オブジェクトの候補')} layout="horizontal" value={selectedId ?? ''} onChange={(_, d) => choose(d.value)}>
            {info.candidates.map((c) => <Radio key={c.id} value={c.id} label={c.name} />)}
          </RadioGroup>
          <div className={s.tableBox} data-testid="comparison-criteria">
            {info.criteria.length === 0 ? (
              <Text>{t('比較の観点は顧客パックに設定されていません。')}</Text>
            ) : (
              <Table aria-label={t('候補の比較')} size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t('比較の観点')}</TableHeaderCell>
                    {info.candidates.map((c) => <TableHeaderCell key={c.id}>{c.name}</TableHeaderCell>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {info.criteria.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell><Text weight="semibold">{k.label}</Text></TableCell>
                      {info.candidates.map((c) => <TableCell key={c.id}>{c.scores[k.id] ?? '—'}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div data-testid="selection-reason">
            <Text weight="semibold">{t('選定理由: ')}</Text>
            <Text><GlossaryText>{info.reason || t('選定理由は顧客パックに設定されていません。')}</GlossaryText></Text>
            {selected && info.defaultId && selected.id !== info.defaultId ? (
              <Text block size={200}>
                {t('利用者が「{name}」に変更しました（顧客パックの選定は「{defaultName}」）。', { name: selected.name, defaultName: info.candidates.find((c) => c.id === info.defaultId)?.name ?? '' })}
              </Text>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
