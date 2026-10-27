// 意味的ズーム（FR-237）の画面側の共通部品。Twin ビュー・空間ビューなどが、同じ操作・同じ属性（CONTRACT §23）で全体 → 要素 → 詳細をたどる。
//  - ZoomBar: ボタン（拡大・縮小・全体表示に戻す・一つ上の階層へ）・階層の表示（data-testid="zoom-level" data-depth）・パンくず
//  - useZoomRootAttrs: ズームの対象の面（component-<key>）に data-zoom-level 等を付ける（Panel の共通の外枠は変えない）
//  - ZoomClusters: 全体の階層の塊（data-zoom-cluster・「<n> 件」。ダブルクリックか Enter で一つ下の階層へ）
//  - ZoomDetail: 詳細の階層（data-testid="zoom-detail" の中に見出し「属性」「出典」「関係」と選んだ項目の data-entity-id）
import { useEffect, type RefObject } from 'react';
import { Badge, Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { MIN_TARGET_PX } from '../theme/tokens';
import { ZoomBreadcrumb } from './ZoomBreadcrumb';
import { useT } from '../i18n';
import { ZOOM_KIND_LABELS, canZoomIn, canZoomOut, kindOfDepth, stepDepth, zoomAttrs, zoomDepthCount } from './model';

const useStyles = makeStyles({
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  clusters: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM },
  cluster: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '140px', minHeight: `${MIN_TARGET_PX}px`, padding: tokens.spacingHorizontalM, cursor: 'pointer',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  detail: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM },
});

export interface ZoomBarProps {
  depth: number;
  /** 要素の段の数 D */
  elementDepth: number;
  onGo: (depth: number) => void;
  elementLabels?: readonly string[];
  detailLabel?: string;
  /** 画面の名前（ツールバーの名前） */
  label: string;
}

export function ZoomBar({ depth, elementDepth, onGo, elementLabels, detailLabel, label }: ZoomBarProps) {
  const s = useStyles();
  const t = useT();
  const kind = kindOfDepth(depth, elementDepth);
  return (
    <>
      <div className={s.bar} role="toolbar" aria-label={t('{label}のズーム', { label })}>
        <Button size="small" disabled={!canZoomIn(depth, elementDepth)} onClick={() => onGo(stepDepth(depth, 1, elementDepth))}>{t('拡大')}</Button>
        <Button size="small" disabled={!canZoomOut(depth)} onClick={() => onGo(stepDepth(depth, -1, elementDepth))}>{t('縮小')}</Button>
        <Button size="small" onClick={() => onGo(0)}>{t('全体表示に戻す')}</Button>
        <Button size="small" disabled={depth === 0} onClick={() => onGo(depth - 1)}>{t('一つ上の階層へ')}</Button>
        <span data-testid="zoom-level" data-depth={depth} data-depth-count={zoomDepthCount(elementDepth)}>
          <Badge appearance="tint">{ZOOM_KIND_LABELS[kind]}</Badge>
        </span>
      </div>
      <ZoomBreadcrumb depth={depth} elementDepth={elementDepth} elementLabels={elementLabels} detailLabel={detailLabel} onGo={onGo} />
    </>
  );
}

/** ズームの対象の面（`[data-testid="<testId>"]`）に階層の属性を付ける */
export function useZoomRootAttrs(rootRef: RefObject<HTMLElement | null>, testId: string, depth: number, elementDepth: number): void {
  const za = zoomAttrs(depth, elementDepth);
  useEffect(() => {
    const el = rootRef.current?.closest<HTMLElement>(`[data-testid="${testId}"]`);
    if (!el) return;
    for (const [k, v] of Object.entries(za)) el.setAttribute(k, String(v));
  }, [za['data-zoom-level'], za['data-depth'], za['data-depth-count']]); // eslint-disable-line react-hooks/exhaustive-deps
}

export interface ZoomClusterIn { name: string; count: number }

export function ZoomClusters({ clusters, onOpen }: { clusters: readonly ZoomClusterIn[]; onOpen: (name: string) => void }) {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.clusters} role="group" aria-label={t('塊')}>
      {clusters.map((c) => (
        <div
          key={c.name} role="button" tabIndex={0} className={s.cluster} data-zoom-cluster={c.name}
          aria-label={t('{name} {count} 件。ダブルクリックか Enter で要素へ', { name: c.name, count: c.count })}
          onDoubleClick={() => onOpen(c.name)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(c.name); } }}
        >
          <Text weight="semibold">{c.name}</Text>
          <Text>{t('{count} 件', { count: c.count })}</Text>
        </div>
      ))}
    </div>
  );
}

export interface ZoomDetailIn {
  id: string;
  name: string;
  attributes: ReadonlyArray<readonly [string, string]>;
  sources: readonly string[];
  relations: readonly string[];
}

export function ZoomDetail({ item }: { item: ZoomDetailIn }) {
  const s = useStyles();
  const t = useT();
  return (
    <section className={s.detail} data-testid="zoom-detail" aria-label={t('詳細')}>
      <Text as="h2" size={500} weight="semibold" data-entity-id={item.id}>{item.name}</Text>
      <Text as="h3" weight="semibold">{t('属性')}</Text>
      <dl style={{ margin: 0 }}>{item.attributes.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
      <Text as="h3" weight="semibold">{t('出典')}</Text>
      <ul style={{ margin: 0 }}>{item.sources.length ? item.sources.map((x) => <li key={x}>{x}</li>) : <li>{t('出典なし')}</li>}</ul>
      <Text as="h3" weight="semibold">{t('関係')}</Text>
      <ul style={{ margin: 0 }}>{item.relations.length ? item.relations.map((x, i) => <li key={i}>{x}</li>) : <li>{t('関係なし')}</li>}</ul>
    </section>
  );
}
