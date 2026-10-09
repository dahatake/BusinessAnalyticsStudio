import { Chat24Regular, CommentMultiple24Regular, Cube24Regular, DataBarHorizontal24Regular, Map24Regular, Ruler24Regular, Settings24Regular, Table24Regular, TaskListSquareLtr24Regular, Whiteboard24Regular, Window24Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { SettingsScreen } from './SettingsScreen';
import { ThemesScreen } from './ThemesScreen';
import { CanvasScreen } from './canvas/CanvasScreen';
import { IssueSolutionScreen } from './IssueSolutionScreen';
import { TableScreen } from './TableScreen';
import { GanttScreen } from './GanttScreen';
import { View3DScreen } from './View3DScreen';
import { Drawing2DScreen } from './Drawing2DScreen';
import { MapScreen } from './MapScreen';
import { WhiteboardScreen } from './whiteboard/WhiteboardScreen';
import { ChatScreen } from '../ai/ChatScreen';

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'canvas', label: 'キャンバス', icon: Window24Regular, component: CanvasScreen },
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen },
  { key: 'table', label: '一覧表', icon: Table24Regular, component: TableScreen },
  { key: 'gantt', label: 'ガントチャート', icon: DataBarHorizontal24Regular, component: GanttScreen },
  { key: 'view3d', label: '3D ビュー', icon: Cube24Regular, component: View3DScreen },
  { key: 'drawing2d', label: '2D 図面', icon: Ruler24Regular, component: Drawing2DScreen },
  { key: 'map', label: '地図', icon: Map24Regular, component: MapScreen },
  { key: 'whiteboard', label: 'ホワイトボード', icon: Whiteboard24Regular, component: WhiteboardScreen },
  { key: 'themes', label: '議論テーマ', icon: CommentMultiple24Regular, component: ThemesScreen },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen },
];
