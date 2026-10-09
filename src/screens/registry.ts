import { Chat24Regular, Cube24Regular, DataBarHorizontal24Regular, Settings24Regular, TaskListSquareLtr24Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { SettingsScreen } from './SettingsScreen';
import { IssueSolutionScreen } from './IssueSolutionScreen';
import { GanttScreen } from './GanttScreen';
import { View3DScreen } from './View3DScreen';
import { ChatScreen } from '../ai/ChatScreen';

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'issue-solution', label: '課題-解決策分析', icon: TaskListSquareLtr24Regular, component: IssueSolutionScreen },
  { key: 'gantt', label: 'ガントチャート', icon: DataBarHorizontal24Regular, component: GanttScreen },
  { key: 'view3d', label: '3D ビュー', icon: Cube24Regular, component: View3DScreen },
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen },
];
