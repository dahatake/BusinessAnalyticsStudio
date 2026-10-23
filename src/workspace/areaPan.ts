// 作業領域（配置を受けるキャンバス。FR-086・FR-173）の矢印キーによるパン（FR-016 AC-192）。
// 画面「キャンバス」の廃止（FR-012）に伴い、矢印キーの操作を作業領域へ移した。プレゼンテーション中の `←`/`→`（修飾キーなし）は
// 前/次の論点への移動（presentation/model.ts の presentationKeyAction）がキャプチャ段階で先に受けるので、ここには届かない。
export const AREA_PAN_STEP = 80;

/** 矢印キー → スクロール量（対応しないキー・修飾キー付き（Shift 以外）は null）。 */
export function areaPanDelta(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): { dx: number; dy: number } | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowLeft': return { dx: -AREA_PAN_STEP, dy: 0 };
    case 'ArrowRight': return { dx: AREA_PAN_STEP, dy: 0 };
    case 'ArrowUp': return { dx: 0, dy: -AREA_PAN_STEP };
    case 'ArrowDown': return { dx: 0, dy: AREA_PAN_STEP };
    default: return null;
  }
}
