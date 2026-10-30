// ペルソナ別の既定の情報表現（要求定義書 §7。FR-015・FR-112）。
// 既定のレイアウトは layoutModel.defaultLayout（§7 の表）。ここでは「最も大きく前面に置く表現」を、そのレイアウトから求める。
// ペルソナの切替は表示の利便性のためで、表示できるデータの範囲は変えない（FR-112）。このファイルとレイアウトのストアは、データを持たない・絞らない。
import { PERSONAS, defaultLayout, type Layout, type LayoutNode, type Persona } from './layoutModel';

/** §7 の表: ペルソナ → 最大の領域に置く既定の情報表現（コンポーネントのキー）。 */
export const PERSONA_PRIMARY: Readonly<Record<Persona, string>> = {
  経営層: 'matrix',
  事業部門: 'issue-solution',
  IT: 'architecture',
  現場: 'twin-view',
};

/** レイアウトの中で、面積の割合が最大のコンポーネント（タブのまとまりは、前面のタブを数える）。同じ大きさなら先の方。 */
export function largestComponent(layout: Layout): string | null {
  if (!layout) return null;
  let best: { key: string; share: number } | null = null;
  const walk = (n: LayoutNode, share: number): void => {
    if (n.kind === 'tabs') {
      if (!best || share > best.share + 1e-9) best = { key: n.active, share };
      return;
    }
    n.children.forEach((c, i) => walk(c, share * (n.sizes[i] ?? 0)));
  };
  walk(layout, 1);
  return (best as { key: string } | null)?.key ?? null;
}

/** ペルソナの既定のレイアウトで最大の領域になる表現（登録済みの画面に絞る前の、§7 のとおりの値）。 */
export function primaryOf(persona: Persona): string | null {
  return largestComponent(defaultLayout(persona));
}

/** すべてのペルソナで、既定のレイアウトの最大の領域が §7 の表と一致するか（単体テストと自己点検用）。 */
export function personaDefaultsMatchTable(): boolean {
  return PERSONAS.every((p) => primaryOf(p) === PERSONA_PRIMARY[p]);
}
