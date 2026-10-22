import {
  Chat24Regular, Building24Regular, CommentMultiple24Regular, Cube24Regular, Database24Regular, DataBarHorizontal24Regular, DataScatter24Regular, DocumentBulletList24Regular, Layer24Regular, Map24Regular,
  Organization24Regular, PhoneDesktop24Regular, Ruler24Regular, Settings24Regular, Table24Regular, TaskListSquareLtr24Regular, TextBulletListTree24Regular,
  Target24Regular, TextNumberListLtr24Regular, Lightbulb24Regular, Trophy24Regular, Whiteboard24Regular, Window24Regular,
} from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { tableWorldDecl, type ViewDecl } from '../view/viewModel';
import { SettingsScreen } from './SettingsScreen';
import { ThemesScreen } from './ThemesScreen';
import { CanvasScreen } from './canvas/CanvasScreen';
import { IssueSolutionScreen } from './IssueSolutionScreen';
import { MockAppScreen } from './MockAppScreen';
import { TableScreen } from './TableScreen';
import { GanttScreen } from './GanttScreen';
import { View3DScreen } from './View3DScreen';
import { Drawing2DScreen } from './Drawing2DScreen';
import { MapScreen } from './MapScreen';
import { PriorityScreen } from './PriorityScreen';
import { RankingScreen } from './RankingScreen';
import { MatrixScreen } from './MatrixScreen';
import { SummaryScreen } from './SummaryScreen';
import { KnowledgeGraphScreen } from './KnowledgeGraphScreen';
import { ArchitectureScreen } from './ArchitectureScreen';
import { DiscussionTreeScreen } from './DiscussionTreeScreen';
import { WhiteboardScreen } from './whiteboard/WhiteboardScreen';
import { KpiOkrScreen } from './KpiOkrScreen';
import { UseCaseScreen } from './UseCaseScreen';
import { DataCatalogScreen } from './DataCatalogScreen';
import { SourcesScreen } from './SourcesScreen';
import { Flow24Regular } from '@fluentui/react-icons';
import { BusinessGraphScreen } from './BusinessGraphScreen';
import { TwinViewScreen } from './TwinViewScreen';
import { SpatialScreen } from './SpatialScreen';
import { ChatScreen } from '../ai/ChatScreen';
import { GenAiScenarioScreen } from './GenAiScenarioScreen';
import '../analysis/commands';

/** 2D の表現だけを持ち、世界区分を持つデータを表示しない画面の宣言（FR-217・FR-218） */
const V2: ViewDecl = { has2D: true, has3D: false, world: false };

/**
 * 画面の一覧（ナビゲーションの並び順）。
 * view は、2D・3D の表現の有無と世界区分の扱いの宣言（FR-217 AC-498・FR-218 AC-502）。
 *  - 3D の表現を持つ: ナレッジグラフ・アーキテクチャ図・ガントチャート（2.5D。canvas 2D で描くので WebGL2 がなくても選べる）・地図（既定は 3D）・データカタログ（データビュアー）、
 *    一覧表・2×2 マトリクス・ランキング表・課題-解決策分析・議論ツリー・KPI/OKR（項目を位置・大きさ・つながりで表す共通の 3D の面 Items3DSurface。FR-217 AC-501）
 *  - 3D だけ: 3D ビュー。2D だけ: 2D 図面。この 2 つは表現を固定したコンポーネント（FR-020 の同時表示。画面の見出しの切替の対象外）
 *  - 世界区分（§3.7 の分類表。1 つの世界の画面は tableWorldDecl で src/schema/world.ts の TABLE_WORLDS から引く。A-57）:
 *    項目ごと（items。グラフの節の world＝entities[].world、課題などは §3.7 の分類表の世界区分）＝ナレッジグラフ・一覧表・3D ビュー・2D 図面・地図
 *    現実世界＝キャンバス（議題＝コト）、課題-解決策分析・優先順位分析・2×2 マトリクス・ランキング表（課題・解決策＝コト）、ガントチャート（工程＝業務）、ユースケース（業務）
 *    デジタル世界＝アーキテクチャ図（モデル）、議論ツリー（モデル）、KPI/OKR（センサー/指標）、出典・データカタログ・ホワイトボード（付箋）・議論テーマ（データ）
 *    世界区分を持つデータを表示しない＝サマリー（ほかの画面の数値の要約）・ミニ・モックアプリ・設定パネル・チャット
 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'canvas', label: 'キャンバス', icon: Window24Regular, component: CanvasScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['議題']), kinds: ['chapter', 'topic'] } },
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen, view: { has2D: true, has3D: true, hasGraph: true, ...tableWorldDecl(['課題', '原因', '解決策', '効果']), kinds: ['issue', 'solution'] } },
  { key: 'priority', label: '優先順位分析', icon: Trophy24Regular, component: PriorityScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['課題', '解決策']), kinds: ['issue', 'solution'] } },
  { key: 'summary', label: 'サマリー', icon: DocumentBulletList24Regular, component: SummaryScreen, view: V2 },
  { key: 'matrix', label: '2×2 マトリクス', icon: DataScatter24Regular, component: MatrixScreen, view: { has2D: true, has3D: true, ...tableWorldDecl(['課題', '解決策']), kinds: ['issue', 'solution'] } },
  { key: 'ranking', label: 'ランキング表', icon: TextNumberListLtr24Regular, component: RankingScreen, view: { has2D: true, has3D: true, ...tableWorldDecl(['課題', '解決策']), kinds: ['issue', 'solution'] } },
  { key: 'knowledge-graph', label: 'ナレッジグラフ', icon: Organization24Regular, component: KnowledgeGraphScreen, view: { has2D: true, has3D: true, world: 'items' } },
  { key: 'business-graph', label: 'ビジネス関係グラフ', icon: Flow24Regular, component: BusinessGraphScreen, view: { has2D: true, has3D: true, hasGraph: true, defaultMode: 'graph', world: 'items' } },
  { key: 'architecture', label: 'アーキテクチャ図', icon: Layer24Regular, component: ArchitectureScreen, view: { has2D: true, has3D: true, ...tableWorldDecl(['アーキテクチャ']), kinds: ['architecture'] } },
  { key: 'discussion-tree', label: '議論ツリー', icon: TextBulletListTree24Regular, component: DiscussionTreeScreen, view: { has2D: true, has3D: true, ...tableWorldDecl(['議論ツリー']), kinds: [] } },
  { key: 'table', label: '一覧表', icon: Table24Regular, component: TableScreen, view: { has2D: true, has3D: true, world: 'items' } },
  { key: 'gantt', label: 'ガントチャート', icon: DataBarHorizontal24Regular, component: GanttScreen, view: { has2D: true, has3D: true, cpu3D: true, ...tableWorldDecl(['工程']), kinds: ['task'] } },
  { key: 'view3d', label: '3D ビューと 2D 図面', icon: Cube24Regular, component: View3DScreen, view: { has2D: false, has3D: true, world: 'items', fixed: true, kinds: ['entity'] }, nav: false },
  { key: 'drawing2d', label: '2D 図面', icon: Ruler24Regular, component: Drawing2DScreen, view: { has2D: true, has3D: false, world: 'items', fixed: true, kinds: ['entity'] }, nav: false },
  { key: 'map', label: '地図', icon: Map24Regular, component: MapScreen, view: { has2D: true, has3D: true, defaultMode: '3d', world: 'items', kinds: ['entity'] } },
  { key: 'kpi-okr', label: 'KPI/OKR', icon: Target24Regular, component: KpiOkrScreen, view: { has2D: true, has3D: true, hasGraph: true, ...tableWorldDecl(['KPI', 'OKR']), kinds: [] } },
  { key: 'twin-view', label: 'Twin ビュー', icon: Layer24Regular, component: TwinViewScreen, view: { has2D: true, has3D: true, hasGraph: true, world: 'items', kinds: ['entity'] } },
  { key: 'sources', label: '出典', icon: DocumentBulletList24Regular, component: SourcesScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['出典']), kinds: ['source'] } },
  { key: 'mock-app', label: 'ミニ・モックアプリ', icon: PhoneDesktop24Regular, component: MockAppScreen, view: V2 },
  { key: 'usecase', label: 'ユースケース', icon: Lightbulb24Regular, component: UseCaseScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['ユースケース']), kinds: [] } },
  { key: 'data-catalog', label: 'データカタログ', icon: Database24Regular, component: DataCatalogScreen, view: { has2D: true, has3D: true, hasGraph: true, ...tableWorldDecl(['データエンティティ', '企業データカタログ']), kinds: [] } },
  { key: 'spatial-view', label: '空間ビュー', icon: Building24Regular, component: SpatialScreen, view: { has2D: true, has3D: true, hasGraph: true, defaultMode: '3d', world: false, kinds: [] } },
  { key: 'whiteboard', label: 'ホワイトボード', icon: Whiteboard24Regular, component: WhiteboardScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['付箋', 'ストローク'], 'ボードの付箋・ストローク'), kinds: [] } },
  { key: 'themes', label: '議論テーマ', icon: CommentMultiple24Regular, component: ThemesScreen, view: { has2D: true, has3D: false, ...tableWorldDecl(['議論テーマ']), kinds: [] } },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen, view: V2, modal: true },
  { key: 'genai-scenario', label: '生成AIの効果的な活用シナリオの分析', icon: Lightbulb24Regular, component: GenAiScenarioScreen, view: V2 },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen, view: V2 },
];

/** 左メニュー（AppShell）に出す画面。`nav: false` の画面は除く（FR-220 AC-590）。除いた画面も、ドック・コマンドから開ける（view3d はペルソナ〈現場〉・既定のレイアウトでも表示される。ステッパー〈FR-228〉は開く入口ではなく、両画面はステップ「現状分析」の関連画面 STEPS.screens に含まれるだけ） */
export const NAV_SCREENS: readonly ScreenDefinition[] = SCREENS.filter((s) => s.nav !== false);
/** ワークスペースのコンポーネントとして並ぶ画面（モーダルを除く。FR-223）。ドック・コマンド・レイアウトの対象 */
export const COMPONENT_SCREENS: readonly ScreenDefinition[] = SCREENS.filter((s) => !s.modal);
