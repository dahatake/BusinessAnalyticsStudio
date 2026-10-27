// ビューの切替（FR-217 の 2D/3D と、FR-218 の現実世界／デジタル世界／両方）の規則。画面の部品・ストアに依存しない純粋なモジュール。
// 各画面は、2D・3D の表現の有無と、世界区分を持つデータを表示するかを宣言する（ScreenDefinition.view）。
// 切替の状態はレイアウトとして保存する（src/store/layout.ts の views。FR-014・FR-110）。
import { WORLD_LABELS, tableWorldOfAll, type World } from '../schema/world';
import { tr } from '../i18n';

/** 表示形式（FR-217 の表示モード 2D／3D に、FR-238 の Graph を足したもの。同じ画面に二つの状態を持たない） */
export type ViewMode = '2d' | '3d' | 'graph';
/** 世界の表示（FR-218） */
export type WorldView = World | 'both';

export const VIEW_MODES: readonly ViewMode[] = ['2d', '3d', 'graph'];
export const WORLD_VIEWS: readonly WorldView[] = ['real', 'digital', 'both'];
export const MODE_LABELS: Record<ViewMode, string> = { '2d': '2D', '3d': '3D', graph: 'Graph' };
export const WORLD_VIEW_LABELS: Record<WorldView, string> = { real: WORLD_LABELS.real, digital: WORLD_LABELS.digital, both: '両方' };
/** 世界の表示の既定（FR-218: 既定は「両方」） */
export const DEFAULT_WORLD_VIEW: WorldView = 'both';

/** 選べない理由（FR-217 AC-500・FR-218 AC-502） */
export const NO_3D_REASON = 'この画面には 3D の表現がありません';
export const NO_3D_ENV_REASON = 'この環境では 3D を描画できません';
export const NO_GRAPH_REASON = 'この画面には Graph の表現がありません';
export const NO_2D_REASON = 'この画面には 2D の表現がありません';
export const NO_WORLD_REASON = 'この画面には世界区分を持つデータがありません';
/** 選択中の項目が、いまの世界の表示で隠れているときの表示（FR-218。選択は保つ） */
export const HIDDEN_SELECTION_TEXT = '選択中の項目はこの表示では隠れています';

/** 画面のビューの宣言（FR-217 AC-498・FR-218 AC-502） */
export interface ViewDecl {
  /** 2D の表現を持つか */
  has2D: boolean;
  /** 3D（またはその画面の 3D 相当の表現。ガントの 2.5D など）を持つか */
  has3D: boolean;
  /** Graph（ノードと意味ラベル付きの向き付きのエッジで描く平面の図。FR-238）の表現を持つか。省略は持たない */
  hasGraph?: boolean;
  /** 本要求より前の既定の表示（3D の表現だけを持つ画面は 3D、それ以外は 2D）。省略時はそれに従って決める */
  defaultMode?: ViewMode;
  /**
   * 世界区分を持つデータを表示するか。
   *  - 'items': 項目ごとの世界区分で表示・非表示を決める（エンティティ関係グラフの節の world。顧客パックの entities[].world と、
   *    世界区分の項目を持たない課題などに §3.7 の分類表から当てた世界区分。A-57）
   *  - 'real' / 'digital': 画面の項目がすべてその世界に属する（§3.7 の分類。例: KPI・OKR はデジタル世界。tableWorldDecl で表から引く）
   *  - false: 世界区分を持つデータを表示しない（切替は無効で理由を示す）
   */
  world: 'items' | World | false;
  /** 表現を固定したコンポーネント（FR-020 の 3D ビューと 2D 図面）。画面の見出しの切替の対象にしない（AC-507） */
  fixed?: boolean;
  /** 3D 相当の表現を WebGPU・WebGL2 なしで描ける（ガントの 2.5D は canvas 2D。FR-022 を後退させない） */
  cpu3D?: boolean;
  /** 画面が表示する項目の種類（エンティティ関係グラフの節の種類）。選択中の項目がこの画面の項目かの判定に使う。省略はすべて */
  kinds?: readonly string[];
  /** 1 つの世界の画面（world が 'real'／'digital'）の根拠: §3.7 の分類表のエンティティの名前（例: 「課題・解決策」） */
  basis?: string;
}

/** 3D 相当の表現を、この環境で描けるか */
export function canRender3D(decl: ViewDecl, envCan3D: boolean): boolean {
  return decl.cpu3D === true || envCan3D;
}

/** 宣言の既定の表示モード */
export function defaultModeOf(decl: ViewDecl): ViewMode {
  if (decl.defaultMode) return decl.defaultMode;
  return decl.has3D && !decl.has2D ? '3d' : '2d';
}

/**
 * 1 つの世界の画面の宣言（world と basis）を、§3.7 の分類表の行の名前から作る（FR-218・A-57）。世界区分は TABLE_WORLDS から引き、
 * 画面ごとに書き直さない。basis を省くと行の名前を「・」でつないだもの。表にない行・世界区分の異なる行は例外（宣言の誤り）。
 */
export function tableWorldDecl(rows: readonly string[], basis: string = rows.join('・')): { world: World; basis: string } {
  return { world: tableWorldOfAll(rows), basis };
}

/** 保存した値（なければ既定）と、描画できるかから、いま表示する表示モードを決める。表現のないモードは選ばない */
export function effectiveMode(decl: ViewDecl, stored: ViewMode | undefined, can3D: boolean): ViewMode {
  const want = stored ?? defaultModeOf(decl);
  if (want === 'graph') return decl.hasGraph ? 'graph' : effectiveMode(decl, undefined, can3D);
  if (want === '3d' && (!decl.has3D || (!canRender3D(decl, can3D) && decl.has2D))) return '2d';
  if (want === '2d' && !decl.has2D) return '3d';
  return want;
}

export function effectiveWorld(decl: ViewDecl, stored: WorldView | undefined): WorldView {
  return decl.world === false ? DEFAULT_WORLD_VIEW : stored ?? DEFAULT_WORLD_VIEW;
}

export interface ViewOption<T> {
  value: T;
  label: string;
  enabled: boolean;
  /** 選べないときの理由 */
  reason?: string;
}

/** 表示モードの選択肢と、選べないときの理由（AC-500） */
export function modeOptions(decl: ViewDecl, can3D: boolean): ViewOption<ViewMode>[] {
  const two: ViewOption<ViewMode> = decl.has2D
    ? { value: '2d', label: MODE_LABELS['2d'], enabled: true }
    : { value: '2d', label: MODE_LABELS['2d'], enabled: false, reason: NO_2D_REASON };
  const three: ViewOption<ViewMode> = !decl.has3D
    ? { value: '3d', label: MODE_LABELS['3d'], enabled: false, reason: NO_3D_REASON }
    : !canRender3D(decl, can3D)
      ? { value: '3d', label: MODE_LABELS['3d'], enabled: false, reason: NO_3D_ENV_REASON }
      : { value: '3d', label: MODE_LABELS['3d'], enabled: true };
  const graph: ViewOption<ViewMode> = decl.hasGraph
    ? { value: 'graph', label: MODE_LABELS.graph, enabled: true }
    : { value: 'graph', label: MODE_LABELS.graph, enabled: false, reason: NO_GRAPH_REASON };
  return [two, three, graph];
}

/** 世界の表示の選択肢（AC-502） */
export function worldOptions(decl: ViewDecl): ViewOption<WorldView>[] {
  return WORLD_VIEWS.map((w) => (decl.world === false
    ? { value: w, label: WORLD_VIEW_LABELS[w], enabled: false, reason: NO_WORLD_REASON }
    : { value: w, label: WORLD_VIEW_LABELS[w], enabled: true }));
}

/** 「ビュー」ボタンに見せる文字（現在の表示モードと世界の表示。NFR-UX-018・D-01） */
export function viewText(mode: ViewMode, world: WorldView): string {
  return `${tr(MODE_LABELS[mode])}${tr('・')}${tr(WORLD_VIEW_LABELS[world])}`;
}

/**
 * 世界区分 `world`（undefined は区分なし。世界区分の項目を持つエンティティで値がないもの。課題などは §3.7 の分類表の世界区分を持つ）の項目を、世界の表示 `view` で表示するか（FR-218 AC-504・A-57）。
 *  - 現実世界: 現実世界の項目だけ
 *  - デジタル世界: デジタル世界の項目だけ
 *  - 両方: すべて（区分なしは「両方」でだけ表示する）
 */
export function isShownInWorld(world: World | undefined, view: WorldView): boolean {
  if (view === 'both') return true;
  return world === view;
}

/** 項目の一覧を、世界の表示で絞る */
export function filterByWorld<T>(items: readonly T[], worldOf: (item: T) => World | undefined, view: WorldView): T[] {
  return view === 'both' ? [...items] : items.filter((i) => isShownInWorld(worldOf(i), view));
}

/** 世界の表示で隠れている、選択中の項目（選択状態は変えず、隠れている印だけを付ける。AC-504） */
export function hiddenSelected(
  selectedIds: readonly string[], worldOf: (id: string) => World | undefined, known: (id: string) => boolean, view: WorldView,
): string[] {
  if (view === 'both') return [];
  return selectedIds.filter((id) => known(id) && !isShownInWorld(worldOf(id), view));
}

export interface TwinPair { realId: string; digitalId: string }

/** 表示中の項目どうしのツイン関係（「両方」のときだけ。両端が表示中のもの）。重複は除く */
export function twinLinksAmong(twins: readonly TwinPair[] | undefined, shown: ReadonlySet<string>, view: WorldView): Array<[string, string]> {
  if (view !== 'both') return [];
  const out: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const t of twins ?? []) {
    if (!shown.has(t.realId) || !shown.has(t.digitalId)) continue;
    const k = `${t.realId}\u0000${t.digitalId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([t.realId, t.digitalId]);
  }
  return out;
}

/**
 * 「選択中の項目はこの表示では隠れています」を出すか（FR-218）。選択中の項目のうち、この画面の項目（宣言の kinds に当たる節）が、
 * いまの世界の表示で隠れているときだけ true。ほかの画面の項目の選択では出さない。
 *  - 項目ごとの画面: 節の世界区分（区分なしは「両方」でだけ表示）で判定する
 *  - 1 つの世界の画面: 別の世界を選んでいれば、この画面の項目はすべて隠れている
 */
export function selectionHiddenIn(
  decl: ViewDecl, view: WorldView, selectedIds: readonly string[], nodeOf: (id: string) => { kind: string; world?: World } | undefined,
): boolean {
  if (decl.world === false || view === 'both') return false;
  const mine = (id: string) => {
    const n = nodeOf(id);
    return n && (decl.kinds === undefined || decl.kinds.includes(n.kind)) ? n : undefined;
  };
  if (decl.world === 'items') return selectedIds.some((id) => { const n = mine(id); return !!n && !isShownInWorld(n.world, view); });
  return view !== decl.world && selectedIds.some((id) => !!mine(id));
}

/** 1 つの世界の画面で、別の世界を選んだときに示す理由（§3.7 の分類） */
export function singleWorldNote(decl: ViewDecl): string | null {
  if (decl.world !== 'real' && decl.world !== 'digital') return null;
  const w = tr(WORLD_VIEW_LABELS[decl.world]);
  const what = decl.basis ? tr('この画面の項目（{basis}）', { basis: decl.basis }) : tr('この画面の項目');
  return tr('{what}は §3.7 の分類で{w}の項目です。「ビュー」で「{w}」か「両方」を選ぶと表示します。', { what, w });
}

/** 画面の見出しの切替（全コンポーネントにまとめて効く）で、このコンポーネントに入れる値。対象外・表現のないものは変えない（undefined） */
export function screenModeFor(decl: ViewDecl, mode: ViewMode): ViewMode | undefined {
  if (decl.fixed) return undefined;
  if (mode === 'graph' ? !decl.hasGraph : mode === '3d' ? !decl.has3D : !decl.has2D) return undefined;
  return mode;
}

export function screenWorldFor(decl: ViewDecl, world: WorldView): WorldView | undefined {
  return decl.world === false ? undefined : world;
}

// ---- 宣言の登録（App が起動時に画面の登録から設定する） ----
const decls = new Map<string, ViewDecl>();
/** 宣言のない画面（後から足された画面）の扱い: 2D だけ・世界区分なし */
export const FALLBACK_DECL: ViewDecl = { has2D: true, has3D: false, world: false };

export function registerViewDecls(list: ReadonlyArray<{ key: string; view?: ViewDecl }>): void {
  for (const s of list) decls.set(s.key, s.view ?? FALLBACK_DECL);
}
export function viewDeclOf(key: string): ViewDecl {
  return decls.get(key) ?? FALLBACK_DECL;
}
export function viewDeclKeys(): string[] {
  return [...decls.keys()];
}
