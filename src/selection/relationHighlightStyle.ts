// FR-227 の見た目（大域スタイル）。減光は不透明度を下げず、文字色を「薄いが 4.5:1 以上」の既定の補助色にし、
// 破線の枠と細い字で、色以外でも区別できるようにする。関連・選択は左の太線で示す。値はデザイントークン（CSS 変数）。
const CSS = `
[data-entity-id][data-highlight~="dimmed"],
[data-entity-id][data-highlight~="dimmed"] * {
  color: var(--colorNeutralForeground3) !important;
}
[data-entity-id][data-highlight~="dimmed"] {
  outline: var(--strokeWidthThin) dashed var(--colorNeutralStroke2);
  outline-offset: calc(-1 * var(--strokeWidthThin));
  font-weight: var(--fontWeightRegular);
}
[data-entity-id][data-highlight~="related"]:not([data-highlight~="selected"]) {
  box-shadow: inset var(--strokeWidthThickest) 0 0 var(--colorNeutralStroke1);
}
[data-entity-id][data-highlight~="selected"] {
  box-shadow: inset var(--strokeWidthThickest) 0 0 var(--colorBrandStroke1);
}
`;

/** 大域スタイルを 1 回だけ入れる */
export function installRelationHighlightStyle(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let el = document.getElementById('relation-highlight-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'relation-highlight-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }
  return () => { el?.remove(); };
}
