// 標準のコマンド（FR-111）: ビューの表示/非表示・最大化、ペルソナの切替、レイアウトの復元、演出（アニメーション）の切替、レンズの切替など。
// エクスポート・音のミュートなど、ほかの項目が持つ操作は、その項目が registerCommands で足す。
import { tr } from '../i18n';
import { LENS_LABELS, LENS_MODES } from '../lens/model';
import type { ScreenDefinition } from '../screens/types';
import { useAnimation } from '../store/animation';
import { useLayout } from '../store/layout';
import { useLens } from '../store/lens';
import { PERSONAS } from '../workspace/layoutModel';
import type { Command } from './registry';
import { useCommandUi } from './ui';

/** コンポーネントを表示し、フォーカスを移す。 */
export function revealComponent(key: string): void {
  useLayout.getState().showComponent(key);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="component-${key}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, 0);
}

export function builtinCommands(screens: readonly ScreenDefinition[]): Command[] {
  const layout = () => useLayout.getState();
  return [
    {
      id: 'layout.reset',
      label: tr('既定のレイアウトに戻す'),
      keywords: ['レイアウト', 'リセット', 'reset', 'default'],
      run: () => layout().resetLayout(),
    },
    ...screens.flatMap<Command>((sc) => [
      { id: `view.show.${sc.key}`, label: tr('{label}を表示する', { label: sc.label }), keywords: ['ビュー', '表示', 'show', sc.key], run: () => revealComponent(sc.key) },
      { id: `view.hide.${sc.key}`, label: tr('{label}を非表示にする', { label: sc.label }), keywords: ['ビュー', '非表示', 'hide', sc.key], shortcut: 'H', run: () => layout().hideComponent(sc.key) },
      {
        id: `view.maximize.${sc.key}`,
        label: tr('{label}を最大化する', { label: sc.label }),
        keywords: ['ビュー', '最大化', 'maximize', sc.key],
        shortcut: 'Shift+F',
        run: () => { layout().showComponent(sc.key); layout().setMaximized(sc.key); },
      },
    ]),
    ...PERSONAS.map<Command>((p) => ({
      id: `persona.${p}`,
      label: tr('ペルソナを「{p}」に切り替える', { p }),
      keywords: ['ペルソナ', 'persona', p],
      run: () => layout().setPersona(p),
    })),
    {
      id: 'animation.toggle',
      label: tr('アニメーションの再生／停止を切り替える'),
      keywords: ['演出', 'アニメーション', '再生', '停止', 'animation'],
      shortcut: 'P',
      run: () => useAnimation.getState().toggle(),
    },
    ...LENS_MODES.map<Command>((m) => ({
      id: `lens.${m}`,
      label: tr('レンズを「{lens}」にする', { lens: LENS_LABELS[m] }),
      keywords: ['レンズ', 'lens', 'ビジネス', 'IT', '並置'],
      run: () => useLens.getState().setMode(m),
    })),
    {
      id: 'search.focus',
      label: tr('検索欄に移動する'),
      keywords: ['検索', 'search'],
      run: () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    },
    {
      id: 'help.shortcuts',
      label: tr('ショートカット一覧を表示する'),
      keywords: ['ヘルプ', 'キー', 'shortcut', 'help'],
      shortcut: '?',
      run: () => useCommandUi.getState().setShortcutsOpen(true),
    },
  ];
}
