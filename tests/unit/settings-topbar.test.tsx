// @vitest-environment jsdom
// FR-223 AC-774（左メニューに設定の項目がなく、上部のボタン「設定」から設定のモーダルを開く。名称は「設定」）
// FR-275 AC-773（上部の AI の状態表示に、共通接続の接続先の名前と有効／モックを文字で示す。POST /ask の状態は含めない）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

const { state } = vi.hoisted(() => ({ state: { runtime: { relayUrl: 'http://127.0.0.1:8787' }, state: { status: 'ready', pack: { data: { customer: { name: 'P' } } } } } }));
vi.mock('../../src/store/pack', () => ({
  usePackStore: Object.assign((select: (s: unknown) => unknown) => select(state), { subscribe: () => () => undefined, getState: () => state, setState: () => undefined }),
}));

import { SettingsButton } from '../../src/screens/SettingsButton';
import { useSettingsModal } from '../../src/store/settingsModal';
import { genAiStatusLabel, providerDisplayName, toGenAiState, useGenAiProviderStatus } from '../../src/ai/genAiProviderStatus';
import { notifyFoundryChanged } from '../../src/ai/foundryClient';

const SECRET = 'dummy-key-unit-773';
let provider = 'foundry';
let enabled = false;

beforeEach(() => {
  provider = 'foundry';
  enabled = false;
  useSettingsModal.getState().setOpen(false);
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    // FR-285 AC-739: 状態表示は /foundry/* に要求を送らない（送ったら失敗させる）
    if (input.includes('/foundry')) throw new Error('unexpected /foundry request');
    // 余計な値（仮に秘密が混ざっても）を画面に出さないことも確かめる
    if (input.includes('/ai/provider?packId=')) return new Response(JSON.stringify({ provider, enabled, key: SECRET }));
    throw new Error('unexpected request');
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const s = useGenAiProviderStatus();
  return <span data-testid="probe">{genAiStatusLabel(s)}</span>;
}

describe('FR-223 上部の「設定」', () => {
  // FR-223 AC-774
  it('FR-223 AC-774 上部のボタンはアクセシブルな名前「設定」で、クリックとキーボード（Enter）で設定のモーダルを開く', () => {
    render(<FluentProvider theme={webLightTheme}><SettingsButton /></FluentProvider>);
    const btn = screen.getByRole('button', { name: '設定' });
    expect(btn.getAttribute('data-testid')).toBe('settings-button');
    fireEvent.click(btn);
    expect(useSettingsModal.getState().open).toBe(true);
    useSettingsModal.getState().setOpen(false);
    btn.focus();
    expect(document.activeElement).toBe(btn);
    // ネイティブの button は Enter／Space で click を起こす（jsdom では click を直接送る）
    fireEvent.click(btn);
    expect(useSettingsModal.getState().open).toBe(true);
  });
});

describe('FR-275 上部の AI の状態表示の接続先', () => {
  // FR-275 AC-773
  it('FR-275 AC-773 接続先の名前は「Microsoft Foundry」「GitHub Copilot」で、無効は「モック」、有効は「有効」（「接続済み」は使わない）', () => {
    expect(providerDisplayName('foundry')).toBe('Microsoft Foundry');
    expect(providerDisplayName('copilot')).toBe('GitHub Copilot');
    expect(genAiStatusLabel({ provider: 'copilot', enabled: false })).toContain('GitHub Copilot');
    expect(genAiStatusLabel({ provider: 'copilot', enabled: false })).toContain('モック');
    const on = genAiStatusLabel({ provider: 'foundry', enabled: true });
    expect(on).toContain('Microsoft Foundry');
    expect(on).toContain('有効');
    expect(on).not.toContain('モック');
    expect(on).not.toContain('接続済み');
    // 異常系: 中継に届かない・旧中継は Microsoft Foundry・モック
    expect(toGenAiState(null)).toEqual({ provider: 'foundry', enabled: false });
    expect(toGenAiState({ enabled: true })).toEqual({ provider: 'foundry', enabled: true });
  });

  // FR-275 AC-773
  it('FR-275 AC-773 共通接続の設定の変更・設定を閉じたときに読み直し、接続先と有効／モックが変わり、キーの値は表示しない', async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('生成AI: Microsoft Foundry（モック）'));
    provider = 'copilot';
    act(() => notifyFoundryChanged());
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('生成AI: GitHub Copilot（モック）'));
    enabled = true;
    act(() => { useSettingsModal.getState().setOpen(true); });
    act(() => { useSettingsModal.getState().setOpen(false); });
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('生成AI: GitHub Copilot（有効）'));
    expect(document.body.textContent).not.toContain(SECRET);
  });
});
