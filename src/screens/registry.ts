import {
  Chat24Regular, CommentMultiple24Regular, Cube24Regular, Database24Regular, DataBarHorizontal24Regular, DataScatter24Regular, DocumentBulletList24Regular, Layer24Regular, Map24Regular,
  Organization24Regular, PhoneDesktop24Regular, Ruler24Regular, Settings24Regular, Table24Regular, TaskListSquareLtr24Regular, TextBulletListTree24Regular,
  Target24Regular, TextNumberListLtr24Regular, Lightbulb24Regular, Trophy24Regular, Whiteboard24Regular, Window24Regular,
} from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import type { ViewDecl } from '../view/viewModel';
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
import { ChatScreen } from '../ai/ChatScreen';
import '../analysis/commands';

/** 2D の表現だけを持ち、世界区分を持つデータを表示しない画面の宣言（FR-217・FR-218） */
const V2: ViewDecl = { has2D: true, has3D: false, world: false };

/**
 * 画面の一覧（ナビゲーションの並び順）。
 * view は、2D・3D の表現の有無と世界区分の扱いの宣言（FR-217 AC-498・FR-218 AC-502）。
 *  - 3D の表現を持つ: ナレッジグラフ・アーキテクチャ図・ガントチャート（2.5D）・地図（地球儀/3D マップ。既定は 3D）・データカタログ（データビュアー）
 *  - 3D だけ: 3D ビュー。2D だけ: 2D 図面。この 2 つは表現を固定したコンポーネント（FR-020 の同時表示。画面の見出しの切替の対象外）
 *  - 世界区分: 項目ごと（items）＝ナレッジグラフ・一覧表・3D ビュー・2D 図面・地図。画面の項目が 1 つの世界＝KPI/OKR・アーキテクチャ図・データカタログ（§3.7 の分類でデジタル世界）
 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'canvas', label: 'キャンバス', icon: Window24Regular, component: CanvasScreen, view: V2 },
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen, view: V2 },
  { key: 'priority', label: '優先順位分析', icon: Trophy24Regular, component: PriorityScreen, view: V2 },
  { key: 'summary', label: 'サマリー', icon: DocumentBulletList24Regular, component: SummaryScreen, view: V2 },
  { key: 'matrix', label: '2×2 マトリクス', icon: DataScatter24Regular, component: MatrixScreen, view: V2 },
  { key: 'ranking', label: 'ランキング表', icon: TextNumberListLtr24Regular, component: RankingScreen, view: V2 },
  { key: 'knowledge-graph', label: 'ナレッジグラフ', icon: Organization24Regular, component: KnowledgeGraphScreen, view: { has2D: true, has3D: true, world: 'items' } },
  { key: 'architecture', label: 'アーキテクチャ図', icon: Layer24Regular, component: ArchitectureScreen, view: { has2D: true, has3D: true, world: 'digital' } },
  { key: 'discussion-tree', label: '議論ツリー', icon: TextBulletListTree24Regular, component: DiscussionTreeScreen, view: V2 },
  { key: 'table', label: '一覧表', icon: Table24Regular, component: TableScreen, view: { has2D: true, has3D: false, world: 'items' } },
  { key: 'gantt', label: 'ガントチャート', icon: DataBarHorizontal24Regular, component: GanttScreen, view: { has2D: true, has3D: true, world: false } },
  { key: 'view3d', label: '3D ビュー', icon: Cube24Regular, component: View3DScreen, view: { has2D: false, has3D: true, world: 'items', fixed: true } },
  { key: 'drawing2d', label: '2D 図面', icon: Ruler24Regular, component: Drawing2DScreen, view: { has2D: true, has3D: false, world: 'items', fixed: true } },
  { key: 'map', label: '地図', icon: Map24Regular, component: MapScreen, view: { has2D: true, has3D: true, defaultMode: '3d', world: 'items' } },
  { key: 'kpi-okr', label: 'KPI/OKR', icon: Target24Regular, component: KpiOkrScreen, view: { has2D: true, has3D: false, world: 'digital' } },
  { key: 'sources', label: '出典', icon: DocumentBulletList24Regular, component: SourcesScreen, view: V2 },
  { key: 'mock-app', label: 'ミニ・モックアプリ', icon: PhoneDesktop24Regular, component: MockAppScreen, view: V2 },
  { key: 'usecase', label: 'ユースケース', icon: Lightbulb24Regular, component: UseCaseScreen, view: V2 },
  { key: 'data-catalog', label: 'データカタログ', icon: Database24Regular, component: DataCatalogScreen, view: { has2D: true, has3D: true, world: 'digital' } },
  { key: 'whiteboard', label: 'ホワイトボード', icon: Whiteboard24Regular, component: WhiteboardScreen, view: V2 },
  { key: 'themes', label: '議論テーマ', icon: CommentMultiple24Regular, component: ThemesScreen, view: V2 },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen, view: V2 },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen, view: V2 },
];
