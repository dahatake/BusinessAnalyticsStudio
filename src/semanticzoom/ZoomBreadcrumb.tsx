// 意味的ズームのパンくず（FR-237・FR-033）。現在の階層は aria-current="location"。押すとその階層へ戻る。
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { breadcrumbs } from './model';
import { useT } from '../i18n';

const useStyles = makeStyles({
  list: { display: 'flex', columnGap: tokens.spacingHorizontalXS, listStyleType: 'none', margin: 0, padding: 0, alignItems: 'center' },
});

export interface ZoomBreadcrumbProps {
  depth: number;
  /** 要素の段の数 D */
  elementDepth: number;
  elementLabels?: readonly string[];
  detailLabel?: string;
  onGo: (depth: number) => void;
}

export function ZoomBreadcrumb({ depth, elementDepth, elementLabels, detailLabel, onGo }: ZoomBreadcrumbProps) {
  const items = breadcrumbs(depth, elementDepth, elementLabels, detailLabel);
  const s = useStyles();
  const t = useT();
  return (
    <nav aria-label={t('パンくず')} data-testid="zoom-breadcrumb">
      <ol className={s.list}>
        {items.map((c, i) => (
          <li key={c.depth}>
            {i > 0 ? <span aria-hidden="true"> › </span> : null}
            {c.current
              ? <span aria-current="location">{c.label}</span>
              : <Button size="small" appearance="transparent" onClick={() => onGo(c.depth)}>{c.label}</Button>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
