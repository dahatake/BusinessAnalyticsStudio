import {
  Chat24Regular, CommentMultiple24Regular, Cube24Regular, Database24Regular, DataBarHorizontal24Regular, DataScatter24Regular, DocumentBulletList24Regular, Layer24Regular, Map24Regular,
  Organization24Regular, PhoneDesktop24Regular, Ruler24Regular, Settings24Regular, Table24Regular, TaskListSquareLtr24Regular, TextBulletListTree24Regular,
  Target24Regular, TextNumberListLtr24Regular, Lightbulb24Regular, Trophy24Regular, Whiteboard24Regular, Window24Regular,
} from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
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

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'canvas', label: 'キャンバス', icon: Window24Regular, component: CanvasScreen },
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen },
  { key: 'priority', label: '優先順位分析', icon: Trophy24Regular, component: PriorityScreen },
  { key: 'summary', label: 'サマリー', icon: DocumentBulletList24Regular, component: SummaryScreen },
  { key: 'matrix', label: '2×2 マトリクス', icon: DataScatter24Regular, component: MatrixScreen },
  { key: 'ranking', label: 'ランキング表', icon: TextNumberListLtr24Regular, component: RankingScreen },
  { key: 'knowledge-graph', label: 'ナレッジグラフ', icon: Organization24Regular, component: KnowledgeGraphScreen },
  { key: 'architecture', label: 'アーキテクチャ図', icon: Layer24Regular, component: ArchitectureScreen },
  { key: 'discussion-tree', label: '議論ツリー', icon: TextBulletListTree24Regular, component: DiscussionTreeScreen },
  { key: 'table', label: '一覧表', icon: Table24Regular, component: TableScreen },
  { key: 'gantt', label: 'ガントチャート', icon: DataBarHorizontal24Regular, component: GanttScreen },
  { key: 'view3d', label: '3D ビュー', icon: Cube24Regular, component: View3DScreen },
  { key: 'drawing2d', label: '2D 図面', icon: Ruler24Regular, component: Drawing2DScreen },
  { key: 'map', label: '地図', icon: Map24Regular, component: MapScreen },
  { key: 'kpi-okr', label: 'KPI/OKR', icon: Target24Regular, component: KpiOkrScreen },
  { key: 'sources', label: '出典', icon: DocumentBulletList24Regular, component: SourcesScreen },
  { key: 'mock-app', label: 'ミニ・モックアプリ', icon: PhoneDesktop24Regular, component: MockAppScreen },
  { key: 'usecase', label: 'ユースケース', icon: Lightbulb24Regular, component: UseCaseScreen },
  { key: 'data-catalog', label: 'データカタログ', icon: Database24Regular, component: DataCatalogScreen },
  { key: 'whiteboard', label: 'ホワイトボード', icon: Whiteboard24Regular, component: WhiteboardScreen },
  { key: 'themes', label: '議論テーマ', icon: CommentMultiple24Regular, component: ThemesScreen },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen },
];
