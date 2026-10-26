// @vitest-environment jsdom
// FR-275 AC-773: 上部の AI の状態表示の主の表示（ai-provider-status）は共通接続の接続先・有効／モックだけで決まり、
// POST /ask（FR-132）の状態に左右されない。POST /ask の状態は用途「チャット」を明記した別の表示（ai-chat-status）に分ける。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

const { state, ai } = vi.hoisted(() => ({
  state: { runtime: { relayUrl: 'http://127.0.0.1:8787' }, state: { status: 'ready', pack: { data: { customer: { name: 'P' } } } } },
  ai: { mode: 'mock' as 'mock' | 'connected' },
}));
vi.mock('../../src/store/pack', () => ({
  usePackStore: Object.assign((select: (s: unknown) => unknown) => select(state), { subscribe: () => () => undefined, getState: () => state, setState: () => undefined }),
}));
vi.mock('../../src/ai/useAi', () => ({ useAi: () => ({ mode: ai.mode }), useAiSync: () => undefined }));
vi.mock('../../src/ai/useAzure', () => ({ useAzureSync: () => undefined }));

import { AiStatus } from '../../src/ai/AiStatus';

let provider = 'foundry';
let enabled = false;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input.includes('/ai/provider?packId=')) return new Response(JSON.stringify({ provider, enabled }));
    throw new Error(`unexpected request ${input}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = () => render(<FluentProvider theme={webLightTheme}><AiStatus /></FluentProvider>);

describe('FR-275 AC-773 上部の AI の状態表示は共通接続に従い、POST /ask と分ける', () => {
  it('FR-275 AC-773 POST /ask だけ接続済み・共通接続は無効: 主の表示はモックで「接続済み」を含まず、チャットの状態は用途つきで別に出る', async () => {
    ai.mode = 'connected'; provider = 'copilot'; enabled = false;
    show();
    const main = screen.getByTestId('ai-provider-status');
    await waitFor(() => expect(main.textContent).toBe('生成AI: GitHub Copilot（モック）'));
    expect(main.textContent).not.toContain('接続済み');
    expect(main.getAttribute('data-enabled')).toBe('false');
    const chat = screen.getByTestId('ai-chat-status');
    expect(chat.textContent).toBe('AI: 接続済み（チャット・Copilot）');
    expect(main.contains(chat) || chat.contains(main)).toBe(false);
  });

  it('FR-275 AC-773 逆に共通接続は有効・POST /ask はモック: 主の表示は「有効」でモックを含まず、チャットの状態だけがモック', async () => {
    ai.mode = 'mock'; provider = 'foundry'; enabled = true;
    show();
    const main = screen.getByTestId('ai-provider-status');
    await waitFor(() => expect(main.textContent).toBe('生成AI: Microsoft Foundry（有効）'));
    expect(main.textContent).not.toContain('モック');
    expect(main.getAttribute('data-enabled')).toBe('true');
    expect(screen.getByTestId('ai-chat-status').textContent).toBe('AI: モック（チャット）');
  });

  it('FR-275 AC-773 POST /ask の状態だけを変えても主の表示の文言・状態は変わらない', async () => {
    provider = 'foundry'; enabled = false;
    ai.mode = 'mock';
    const first = show();
    await waitFor(() => expect(screen.getByTestId('ai-provider-status').textContent).toBe('生成AI: Microsoft Foundry（モック）'));
    const before = screen.getByTestId('ai-provider-status').outerHTML;
    first.unmount();
    ai.mode = 'connected';
    show();
    await waitFor(() => expect(screen.getByTestId('ai-provider-status').textContent).toBe('生成AI: Microsoft Foundry（モック）'));
    expect(screen.getByTestId('ai-provider-status').outerHTML).toBe(before);
  });
});