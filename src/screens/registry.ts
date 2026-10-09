import { Settings24Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from './types';
import { SettingsScreen } from './SettingsScreen';

/** 画面の一覧（ナビゲーションの並び順）。 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'settings', label: '設定パネル', icon: Settings24Regular, component: SettingsScreen },
];
