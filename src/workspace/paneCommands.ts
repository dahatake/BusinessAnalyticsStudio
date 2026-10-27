// 見出しの「その他の操作」メニューの操作を、コマンドパレット（FR-111）からも実行できるようにする（NFR-UX-018 AC-481・FR-215 AC-494）。
// 対象は「操作中のコンポーネント」（最後にフォーカスのあったコンポーネント）。最大化・非表示は画面ごとのコマンド（builtin.ts）もある。
import type { Command } from '../commands/registry';
import type { PaneInfo } from './PaneContext';
import { SNAP_LABEL } from './snap';
import { PIN_MOVE_REASON, PIN_RESIZE_REASON, PIN_TABS_REASON } from './paneActions';
import { TIERS, TIER_LABEL } from './tiers';
import { useLayout } from '../store/layout';
import { tr } from '../i18n';
import { detect3D } from '../view/render3d';
import { MODE_LABELS, VIEW_MODES, WORLD_VIEWS, WORLD_VIEW_LABELS, modeOptions, viewDeclOf, worldOptions } from '../view/viewModel';

/** コマンドの名前（表示時の言語で）。末尾に対象（操作中のコンポーネント）を付ける */
const L = (ja: string) => `${tr(ja)}${tr('（操作中のコンポーネント）')}`;
export const NO_TARGET_MESSAGE = 'コンポーネントを選んでから実行してください';

/**
 * 操作中のコンポーネントへのコマンドの一覧。
 * `current` は操作中のコンポーネントの文脈（なければ null）、`notify` は結果や理由を支援技術にも伝える通知。
 */
export function paneCommands(current: () => PaneInfo | null, notify: (text: string) => void): Command[] {
  const on = (fn: (p: PaneInfo) => void) => () => {
    const p = current();
    if (!p) { notify(NO_TARGET_MESSAGE); return; }
    fn(p);
  };
  const moving = (fn: (p: PaneInfo) => void) => on((p) => (p.pinned ? notify(PIN_MOVE_REASON) : fn(p)));
  const kw = ['コンポーネント', '操作中', 'pane'];
  return [
    { id: 'pane.pin', label: L('ピン止めの切替'), keywords: [...kw, 'ピン', '固定', 'pin'], run: on((p) => p.togglePin()) },
    { id: 'pane.maximize', label: L('最大化の切替'), keywords: [...kw, '最大化', '通常表示', 'maximize'], run: on((p) => p.toggleMaximize()) },
    { id: 'pane.minimize', label: L('最小化の切替'), keywords: [...kw, '最小化', '元に戻す', 'minimize'], run: on((p) => p.toggleMinimize()) },
    { id: 'pane.expand', label: L('拡大表示（75%）の切替'), keywords: [...kw, '拡大表示', 'expand'], run: on((p) => p.toggleExpand()) },
    { id: 'pane.float', label: L('自由に動かせる配置の切替'), keywords: [...kw, '自由配置', '分割', 'float'], run: moving((p) => p.toggleFloat()) },
    { id: 'pane.move.up', label: L('上へ移動'), keywords: [...kw, '移動', 'move'], run: moving((p) => p.move('up')) },
    { id: 'pane.move.down', label: L('下へ移動'), keywords: [...kw, '移動', 'move'], run: moving((p) => p.move('down')) },
    { id: 'pane.move.left', label: L('左へ移動'), keywords: [...kw, '移動', 'move'], run: moving((p) => p.move('left')) },
    { id: 'pane.move.right', label: L('右へ移動'), keywords: [...kw, '移動', 'move'], run: moving((p) => p.move('right')) },
    { id: 'pane.direction', label: L('並べる方向を変える（横/縦）'), keywords: [...kw, '方向', '横', '縦'], run: moving((p) => p.toggleDirection()) },
    ...(['left', 'right', 'top', 'bottom', 'quad', 'third', 'tabs'] as const).map<Command>((k) => ({
      id: `pane.snap.${k}`,
      label: `${tr('画面に配置: {kind}', { kind: tr(SNAP_LABEL[k]) })}${tr('（操作中のコンポーネント）')}`,
      keywords: [...kw, '画面に配置', 'スナップ', 'snap'],
      run: moving((p) => { if (p.snapKinds.includes(k)) p.snapTo(k); }),
    })),
    {
      id: 'pane.tabs',
      label: L('タブにまとめる'),
      keywords: [...kw, 'タブ', 'tabs'],
      run: on((p) => {
        if (p.pinned) { notify(PIN_TABS_REASON); return; }
        const t = p.peers[0];
        if (t) p.mergeInto(t.key);
      }),
    },
    { id: 'pane.untab', label: L('タブから出す'), keywords: [...kw, 'タブ', 'untab'], run: on((p) => { if (p.inTabs && !p.pinned) p.untab(); }) },
    { id: 'pane.hide', label: L('非表示'), keywords: [...kw, '非表示', 'hide'], run: on((p) => p.hide()) },
    // 情報の階層（主役→補助→詳細。FR-244）。理由の確認と変更もコマンドパレットから（メニューと同じ操作。NFR-UX-018）
    { id: 'pane.tier.show', label: L('情報の階層を確かめる'), keywords: [...kw, '階層', '主役', '補助', '詳細', '理由', 'tier'], run: on((p) => notify(p.tierReason)) },
    ...TIERS.map<Command>((t) => ({
      id: `pane.tier.set.${t}`,
      label: `${tr('階層を{tier}にする', { tier: tr(TIER_LABEL[t]) })}${tr('（操作中のコンポーネント）')}`,
      keywords: [...kw, '階層', '主役', '補助', '詳細', 'tier'],
      run: on((p) => p.setTier(t)),
    })),
    { id: 'pane.tier.reset', label: L('階層を既定に戻す'), keywords: [...kw, '階層', '既定', 'tier'], run: on((p) =>     p.setTier(null)) },    // 縦・横を独立に大きさを変える（FR-224 AC-522。ドラッグを使わない手段）
    ...([['w', 1, '幅を広げる'], ['w', -1, '幅を狭める'], ['h', 1, '高さを広げる'], ['h', -1, '高さを狭める']] as const).map<Command>(([axis, dir, text]) => ({
      id: `pane.resize.${axis}.${dir > 0 ? 'grow' : 'shrink'}`,
      label: L(text),
      keywords: [...kw, '大きさ', 'サイズ', 'リサイズ', 'resize'],
      run: on((p) => (p.pinned ? notify(PIN_RESIZE_REASON) : p.resizeBy(axis, dir))),
    })),
    // ビューの切替（FR-217・FR-218）。選べないものは変えずに理由を示す（AC-500・AC-502）
    ...VIEW_MODES.map<Command>((m) => ({
      id: `pane.view.mode.${m}`,
      label: `${tr('ビュー: {name}', { name: tr(MODE_LABELS[m]) })}${tr('（操作中のコンポーネント）')}`,
      keywords: [...kw, 'ビュー', '表示モード', '2D', '3D', 'view'],
      run: on((p) => {
        const o = modeOptions(viewDeclOf(p.key), detect3D()).find((x) => x.value === m)!;
        if (!o.enabled) { notify(o.reason ?? ''); return; }
        useLayout.getState().setView(p.key, { mode: m });
      }),
    })),
    ...WORLD_VIEWS.map<Command>((w) => ({
      id: `pane.view.world.${w}`,
      label: `${tr('ビュー: {name}', { name: tr(WORLD_VIEW_LABELS[w]) })}${tr('（操作中のコンポーネント）')}`,
      keywords: [...kw, 'ビュー', '世界', '現実世界', 'デジタル世界', '両方', 'view'],
      run: on((p) => {
        const o = worldOptions(viewDeclOf(p.key)).find((x) => x.value === w)!;
        if (!o.enabled) { notify(o.reason ?? ''); return; }
        useLayout.getState().setView(p.key, { world: w });
      }),
    })),
  ];
}
