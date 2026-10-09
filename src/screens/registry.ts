import { Chat24Regular, Cube24Regular, Settings24Regular, Table24Regular, TaskListSquareLtr24Regular, Window24Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { SettingsScreen } from './SettingsScreen';
import { CanvasScreen } from './canvas/CanvasScreen';
import { IssueSolutionScreen } from './IssueSolutionScreen';
import { TableScreen } from './TableScreen';
import { View3DScreen } from './View3DScreen';
import { ChatScreen } from '../ai/ChatScreen';

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'canvas', label: 'キャンバス', icon: Window24Regular, component: CanvasScreen },
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen },
  { key: 'table', label: '一覧表', icon: Table24Regular, component: TableScreen },
  { key: 'view3d', label: '3D ビュー', icon: Cube24Regular, component: View3DScreen },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen },
];