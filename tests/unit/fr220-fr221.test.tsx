// @vitest-environment jsdom
// FR-220（2D/3D の切替の一本化）と FR-221（左メニュー「メニューを最小化」の文字の全表示）の単体テスト。
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppShell } from '../../src/components/AppShell';
import { SCREENS, NAV_SCREENS, COMPONENT_SCREENS } from '../../src/screens/registry';
import { PERSONA_PRIMARY } from '../../src/workspace/persona';
import { defaultLayout, keysOf } from '../../src/workspace/layoutModel';
import { STEPS, stepIndexForScreen } from '../../src/stepper/model';
import { builtinCommands } from '../../src/commands/builtin';

afterEach(() => cleanup());

// 分析画面（App.tsx）と同じく、左メニューには NAV_SCREENS を渡す
const shell = () => render(
  <FluentProvider theme={webLightTheme}>
    <AppShell title="t" screens={NAV_SCREENS} onSelect={() => undefined}>x</AppShell>
  </FluentProvider>,
);

describe('FR-220 左メニューから「3D ビュー」の切替の項目を削除', () => {
  // FR-220 AC-515
  it('FR-220 AC-515 左メニューに名前が「3D ビュー」だけの項目と 2D/3D の切替の項目がない', () => {
    shell();
    const nav = screen.getByRole('navigation', { name: '画面' });
    const names = Array.from(nav.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    expect(names).not.toContain('3D ビュー');
    expect(nav.querySelector('[role="menuitemradio"], [role="switch"]')).toBeNull();
  });

  // FR-220 AC-590
  it('FR-220 AC-590 左メニューに「3D ビューと 2D 図面」と「2D 図面」の項目がない', () => {
    shell();
    const nav = screen.getByRole('navigation', { name: '画面' });
    const names = Array.from(nav.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    expect(names.some((n) => n.includes('3D ビューと 2D 図面'))).toBe(false);
    expect(names.some((n) => n === '2D 図面' || n.endsWith('2D 図面'))).toBe(false);
    expect(nav.querySelector('[data-testid="nav-view3d"]')).toBeNull();
    expect(nav.querySelector('[data-testid="nav-drawing2d"]')).toBeNull();
    // ほかの画面は左メニューに残る
    expect(nav.querySelector('[data-testid="nav-knowledge-graph"]')).not.toBeNull();
  });

  // FR-220 AC-590（画面 FR-020 は廃止しない）: 開ける経路はドック・コマンド。view3d はペルソナ（現場）・既定のレイアウトでも表示され、両画面はステッパーの「現状分析」の関連画面に含まれる（ステッパーは開く入口ではない）
  it('FR-220 AC-590 view3d・drawing2d はドック・コマンドから開け、view3d はペルソナ（現場）・既定のレイアウトでも表示され、両画面はステップ「現状分析」の関連画面に含まれる', () => {
    for (const key of ['view3d', 'drawing2d']) {
      expect(SCREENS.some((s) => s.key === key)).toBe(true);
      // ドックの対象（Dock・Workspace・setAvailableComponents に渡す一覧）
      expect(COMPONENT_SCREENS.some((s) => s.key === key)).toBe(true);
      // ステッパーの「現状分析」の関連画面に含まれる（開く入口ではない）
      expect(stepIndexForScreen(key)).toBe(STEPS.findIndex((s) => s.key === 'analysis'));
      // コマンド（「…を表示する」）
      expect(builtinCommands(COMPONENT_SCREENS).some((c) => c.id === `view.show.${key}`)).toBe(true);
    }
    // view3d はペルソナ（現場）・既定のレイアウトでも表示される
    expect(PERSONA_PRIMARY['現場']).toBe('view3d');
    expect(keysOf(defaultLayout('現場'))).toContain('view3d');
  });
});

describe('FR-221 「メニューを最小化」の文字が切れない', () => {
  // FR-221 AC-517（切れる原因: Fluent のボタンは overflow: hidden・行の高さ 20px。和文フォントの文字の箱が行より高いと上下が切り取られる）
  it('FR-221 AC-517 切替ボタンは、はみ出しを切り取らず（overflow: visible）、行の高さを 22px 以上にする', () => {
    shell();
    const btn = screen.getByTestId('nav-toggle');
    expect(btn.textContent).toBe('メニューを最小化');
    // jsdom は style 要素の順序（Fluent の既定の reset と atomic の優先順位）を再現しないので、ボタンに付いた class の規則で確かめる
    const rules = Array.from(document.styleSheets).flatMap((sh) => Array.from(sh.cssRules).map((r) => r.cssText));
    const own = btn.className.split(/\s+/).flatMap((c) => rules.filter((r) => r.startsWith(`.${c} `) || r.startsWith(`.${c}{`)));
    expect(own.some((r) => /\{overflow: visible;\}$/.test(r) || /\{\s*overflow: visible;\s*\}$/.test(r)), '文字が上下で切り取られる（overflow: visible の規則がない）').toBe(true);
    // 行の高さは Fluent の既定（lineHeightBase300 = 20px）より高い 22px 以上（lineHeightBase400 以上）
    const lh = own.map((r) => /\{\s*line-height: var\(--lineHeightBase(\d+)\);\s*\}$/.exec(r)?.[1]).find((v) => v !== undefined);
    expect(Number(lh), '行の高さが 22px（lineHeightBase400）以上でない').toBeGreaterThanOrEqual(400);
  });
});
