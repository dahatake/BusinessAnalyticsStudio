import type { ComponentType } from 'react';
import type { FluentIcon } from '@fluentui/react-icons';

/** 主要画面の登録。以降の項目は、画面を作ったら `registry.ts` に 1 行足す。 */
export interface ScreenDefinition {
  /** `nav-<key>` / `component-<key>` の key（tests/system/CONTRACT.md §4） */
  key: string;
  label: string;
  icon: FluentIcon;
  component: ComponentType;
}
