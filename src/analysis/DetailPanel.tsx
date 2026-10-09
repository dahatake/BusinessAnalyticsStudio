// 課題・解決策の詳細パネルと出典カード（FR-003 評価属性、FR-004 出典、FR-005 Microsoft 製品と適合理由）。
import { Badge, Button, Link, Text, makeStyles, tokens } from '@fluentui/react-components';
import { NumericValue } from '../components/NumericValue';
import {
  AUDIENCE_LABELS, causesOf, effectsOf, evaluationItems, genAiValueItems, productFits, safeHttpUrl, solutionsOfIssue,
  type Issue, type Product, type Solution, type Source,
} from './model';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    minWidth: 0,
  },
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  badges: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXS, rowGap: tokens.spacingVerticalXS },
  attr: {
    display: 'grid',
    gridTemplateColumns: 'minmax(80px, 120px) 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
  },
  attrSources: { gridColumn: '2', display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM },
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyle: 'none' },
  product: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflowWrap: 'anywhere',
  },
});

export interface DetailProps {
  selection: { kind: 'issue'; issue: Issue } | { kind: 'solution'; solution: Solution; issue?: Issue; issues?: readonly Issue[] } | undefined;
  /** 課題を選んだときに、その課題の解決策・効果・製品を示すための、表示中の解決策 */
  solutions?: readonly Solution[];
  products: readonly Product[];
  sources: readonly Source[];
  sourceId: string | undefined;
  onOpenSource: (id: string) => void;
  onCloseSource: () => void;
}

export function DetailPanel({ selection, solutions = [], products, sources, sourceId, onOpenSource, onCloseSource }: DetailProps) {
  const s = useStyles();
  const sourceById = new Map(sources.map((x) => [x.id, x]));
  const source = sourceId ? sourceById.get(sourceId) : undefined;
  return (
    <aside className={s.root} data-testid="component-detail" aria-label="詳細">
      {!selection ? (
        <Text>課題または解決策を選ぶと、詳細を表示します。</Text>
      ) : selection.kind === 'issue' ? (
        <IssueDetail issue={selection.issue} solutions={solutions} products={products} sourceById={sourceById} onOpenSource={onOpenSource} />
      ) : (
        <SolutionDetail solution={selection.solution} issue={selection.issue} issues={selection.issues} products={products} sourceById={sourceById} onOpenSource={onOpenSource} />
      )}
      {source ? <SourceCard source={source} onClose={onCloseSource} /> : null}
    </aside>
  );
}

type SourceMap = Map<string, Source>;

function IssueDetail({ issue, solutions, products, sourceById, onOpenSource }: {
  issue: Issue; solutions: readonly Solution[]; products: readonly Product[]; sourceById: SourceMap; onOpenSource: (id: string) => void;
}) {
  const s = useStyles();
  const causes = causesOf(issue);
  const mine = solutionsOfIssue(issue.id, solutions);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return (
    <>
      <div className={s.section}>
        <Text as="h3" size={500} weight="semibold">{issue.title}</Text>
        <div className={s.badges}>
          <Badge appearance="tint" color={issue.audience === 'external' ? 'brand' : 'informative'}>{AUDIENCE_LABELS[issue.audience]}</Badge>
          {(issue.personas ?? []).map((p) => <Badge key={p} appearance="outline">{p}</Badge>)}
        </div>
        {issue.hypothesis ? <Text>仮説: {issue.hypothesis}</Text> : null}
      </div>
      <div className={s.section} data-testid="issue-causes">
        <Text as="h4" weight="semibold">原因</Text>
        {causes.length === 0 ? <Text>原因は未設定です</Text> : (
          <ul className={s.list}>{causes.map((c) => <li key={c.id}><Text>{c.title}</Text></li>)}</ul>
        )}
      </div>
      <div className={s.section} data-testid="issue-solutions">
        <Text as="h4" weight="semibold">解決策・効果・Microsoft 製品</Text>
        {mine.length === 0 ? <Text>解決策は未設定です</Text> : (
          <ul className={s.list}>
            {mine.map((sol) => (
              <li key={sol.id} className={s.product}>
                <Text weight="semibold">{sol.title}</Text>
                <Text size={200}>効果: {effectsOf(sol).map((e) => e.title).join('、') || '未設定'}</Text>
                <Text size={200}>製品: {(sol.productIds ?? []).map((id) => productName.get(id) ?? id).join('、') || '製品の関連付けなし'}</Text>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={s.section}>
        <Text as="h4" weight="semibold">評価属性</Text>
        {evaluationItems(issue).map((item) => (
          <div key={item.key} className={s.attr} data-testid={`attr-${item.key}`}>
            <Text weight="semibold">{item.label}</Text>
            <Text data-testid="attr-value">
              {item.display ? <NumericValue sourceIds={item.sourceIds}>{item.display}</NumericValue> : '未設定'}
            </Text>
            <div className={s.attrSources}>
              {item.sourceIds.map((id) => {
                const src = sourceById.get(id);
                return (
                  <Link
                    key={id}
                    href={`#${id}`}
                    onClick={(e) => { e.preventDefault(); onOpenSource(id); }}
                  >
                    {src ? src.title : id}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SolutionDetail({ solution, issue, issues, products, sourceById, onOpenSource }: {
  solution: Solution; issue?: Issue; issues?: readonly Issue[]; products: readonly Product[]; sourceById: SourceMap; onOpenSource: (id: string) => void;
}) {
  const s = useStyles();
  const fits = productFits(solution, products);
  const effects = effectsOf(solution);
  const genAi = genAiValueItems(solution);
  const targets = issues && issues.length > 0 ? issues : issue ? [issue] : [];
  return (
    <>
      <div className={s.section}>
        <Text as="h3" size={500} weight="semibold">{solution.title}</Text>
        {targets.length > 0 ? <Text>対象の課題: {targets.map((i) => i.title).join('、')}</Text> : null}
      </div>
      <div className={s.section}>
        <Text as="h4" weight="semibold">効果</Text>
        {effects.length === 0 ? <Text>効果は未設定です</Text> : (
          <ul className={s.list}>{effects.map((e) => <li key={e.id}><Text>{e.title}</Text></li>)}</ul>
        )}
      </div>
      <div className={s.section}>
        <Text as="h4" weight="semibold">生成 AI の価値</Text>
        {genAi.length === 0 ? <Text>生成 AI の価値の指定なし</Text> : (
          <ul className={s.list}>
            {genAi.map((v) => (
              <li key={v.key} className={s.product} data-testid="genai-value">
                <Text weight="semibold">{v.label}</Text>
                <Text>{v.description}</Text>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={s.section}>
        <Text as="h4" weight="semibold">出典</Text>
        {(solution.sourceIds ?? []).length === 0 ? <Text>出典なし</Text> : (
          <div className={s.badges}>
            {(solution.sourceIds ?? []).map((id) => (
              <Button key={id} size="small" appearance="outline" onClick={() => onOpenSource(id)}>
                {sourceById.get(id)?.title ?? id}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className={s.section}>
        <Text as="h4" weight="semibold">Microsoft 製品と適合理由</Text>
        {fits.length === 0 ? <Text>製品の関連付けなし</Text> : (
          <ul className={s.list}>
            {fits.map(({ product, reason }) => (
              <li key={product.id} className={s.product} data-testid="product-fit">
                <Text weight="semibold">{product.name}</Text>
                {product.vendor ? <Text size={200}>{product.vendor}</Text> : null}
                <Text data-testid="product-fit-reason">{reason ?? '適合理由が未設定です'}</Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const CONFIDENCE_HINT: Record<string, string> = {
  高: '複数の確かな資料で裏付けられている',
  中: '一部の資料・聞き取りに基づく',
  低: '裏付けが弱い',
  推定: '資料に基づかない推定',
};

/** 出典カード: タイトル・URL・取得日・確度（FR-004）。URL は新しいタブで開く */
export function SourceCard({ source, onClose }: { source: Source; onClose: () => void }) {
  const s = useStyles();
  const href = safeHttpUrl(source.url);
  return (
    <section className={s.card} data-testid="source-card" aria-label={`出典: ${source.title}`}>
      <Text as="h4" weight="semibold">{source.title}</Text>
      <Text>
        URL:{' '}
        {href ? (
          <Link href={href} target="_blank" rel="noopener noreferrer">{href}</Link>
        ) : (
          source.url ?? 'なし'
        )}
      </Text>
      <Text>取得日: {source.retrievedAt}</Text>
      <Text>確度: {source.confidence}（{CONFIDENCE_HINT[source.confidence]}）</Text>
      <div>
        <Button size="small" appearance="subtle" onClick={onClose}>出典カードを閉じる</Button>
      </div>
    </section>
  );
}
