import type { ComponentType } from 'react';
import type { FluentIcon } from '@fluentui/react-icons';
import type { ViewDecl } from '../view/viewModel';

/** 主要画面の登録。以降の項目は、画面を作ったら `registry.ts` に 1 行足す。 */
export interface ScreenDefinition {
  /** `nav-<key>` / `component-<key>` の key（tests/system/CONTRACT.md §4） */
  key: string;
  label: string;
  icon: FluentIcon;
  component: ComponentType;
  /** 2D・3D の表現の有無と、世界区分を持つデータを表示するか（FR-217 AC-498・FR-218 AC-502）。見出しの「ビュー」の選択肢を決める。
   *  registry.ts の画面はすべて宣言する（tests/unit/view-switch.test.ts が確かめる）。宣言のないもの（テスト用の仮の画面）は 2D だけ・世界区分なし */
  view?: ViewDecl;
  /** モーダルで開く画面（FR-223）。ナビゲーションには出るが、ワークスペースのコンポーネントとして並ばず、レイアウトの対象にならない */
  modal?: boolean;
  /** false なら左メニュー（AppShell）に出さない（FR-220 AC-590）。画面は廃止せず、ペルソナ・レイアウト・ステッパー・ドック・コマンドから開ける */
  nav?: false;
}
