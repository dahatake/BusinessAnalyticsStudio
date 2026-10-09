import { Chat24Regular, Settings24Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { SettingsScreen } from './SettingsScreen';
import { ChatScreen } from '../ai/ChatScreen';

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
  { key: 'chat', label: 'チャット', icon: Chat24Regular, component: ChatScreen },
];
