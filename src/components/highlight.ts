// 選択・ホバー・関連・減光の見た目（FR-025〜FR-027）。data-highlight の語（selected／hover／related／dimmed）に対応する共通のスタイル。
// 状態は色だけでなく、左の太線（関連）・下線の破線（ホバー）・不透明度（減光）の形でも示す。値はデザイントークンで指定する。
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset 4px 0 0 ${tokens.colorBrandStroke1}`,
    ':hover': { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  related: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    boxShadow: `inset 4px 0 0 ${tokens.colorNeutralStroke1}`,
  },
  hover: {
    outline: `${tokens.strokeWidthThin} dashed ${tokens.colorBrandStroke1}`,
    outlineOffset: '-1px',
  },
  dimmed: { opacity: 0.45 },
});

/**
 * data-highlight の値に対応するクラス名を返す関数。`const hl = useHighlightClass();` と画面で 1 回呼び、
 * `mergeClasses(own, hl(props['data-highlight']))` のように行ごとに使う（行のループの中でフックを呼ばないため）。
 */
export function useHighlightClass(): (highlight: string | undefined) => string {
  const s = useStyles();
  return (highlight) => {
    if (!highlight) return '';
    const words = highlight.split(' ');
    return mergeClasses(
      words.includes('related') && s.related,
      words.includes('selected') && s.selected,
      words.includes('hover') && s.hover,
      words.includes('dimmed') && s.dimmed,
    );
  };
}
