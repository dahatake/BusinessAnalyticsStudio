// 項目を位置・大きさ・つながりで 3D 空間に表す共通の面（FR-217 AC-501）。
// 一覧表・2×2 マトリクス・ランキング表・課題-解決策分析・議論ツリー・KPI/OKR が、同じ項目（2D と同じ ID・件数）をこの面に渡す。
// 拡大・縮小する描画領域として data-zoom-surface="3d" を付け（CONTRACT.md §21）、描いている項目の ID を t.view.state の items3d に知らせる。
// 同じ情報を表・テキストで読める「表で見る」（NFR-A11Y-003）は、各画面が ViewAsTableButton でこの面の外に置く。
import { Suspense, lazy, useMemo } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { useSelectionStore } from '../store/selection';
import { usePublishItems3D } from '../view/useView';
import { idsOf, type Axes3D, type Item3D, type Link3D } from '../view/items3d';
import { useT } from '../i18n';

const Items3DScene = lazy(() => import('./Items3DScene'));

const useStyles = makeStyles({
  surface: { width: '100%', minWidth: 0, flexShrink: 0 },
  loading: { padding: tokens.spacingHorizontalL },
});

export interface Items3DSurfaceProps {
  /** コンポーネントの key（t.view.state(key)） */
  viewKey: string;
  /** 選択を起こしたビューとして記録する名前 */
  origin: string;
  /** 3D の面の名前（スクリーンリーダー向け） */
  label: string;
  items: readonly Item3D[];
  links?: readonly Link3D[];
  axes?: Axes3D;
  /** 選択中の項目の ID。省略は共通の選択（項目の ID が選択の ID と同じ画面） */
  selected?: ReadonlySet<string>;
  /** 項目を選んだとき。省略は共通の選択に入れる */
  onSelect?: (id: string, additive: boolean) => void;
}

const NO_LINKS: readonly Link3D[] = [];

export function Items3DSurface({ viewKey, origin, label, items, links = NO_LINKS, axes, selected: selectedProp, onSelect }: Items3DSurfaceProps) {
  const s = useStyles();
  const t = useT();
  const selectedIds = useSelectionStore((st) => st.selectedIds);
  const common = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selected = selectedProp ?? common;
  const ids = useMemo(() => idsOf(items), [items]);
  usePublishItems3D(viewKey, ids);
  return (
    <div className={s.surface} data-zoom-surface="3d" data-items-3d={ids.length}>
      <Suspense fallback={<Text className={s.loading} role="status">{t('3D を読み込み中')}</Text>}>
        <Items3DScene
          label={t('{label}（3D）。ドラッグで回転、ホイールで拡大縮小。同じ情報は「表で見る」で読めます', { label })}
          items={items} links={links} selected={selected} axes={axes}
          onSelect={onSelect ?? ((id, additive) => { useSelectionStore.getState().select(id, { origin, additive }); })}
        />
      </Suspense>
    </div>
  );
}
