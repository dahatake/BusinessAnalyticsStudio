// @vitest-environment jsdom
// FR-284 AC-733・AC-734・AC-736、FR-285 AC-737・AC-739 の結合テスト: 画面の押したときだけ実行・モック・入力検査・失敗時の代替。
// Foundry へは接続しない（fetch の差し替え）。共通接続の有効化は中継の GET /foundry/config の enabled に従う（FR-275）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GenAiScenarioScreen } from '../../src/screens/GenAiScenarioScreen';
import { SCREENS } from '../../src/screens/registry';
import { usePackStore } from '../../src/store/pack';
import { useConsentStore } from '../../src/ai/useConsent';
import { consentKeyOf } from '../../src/ai/consent';

const data = {
  customer: { name: '合成株式会社', projectName: 'P' },
  entities: { entities: [] },
  issues: { issues: [], solutions: [{ id: 'S1', issueId: 'I1', title: '問い合わせメールの大量の文章を要約し、担当部署へ振り分ける' }] },
};
const setPack = (relayUrl?: string) => usePackStore.setState({
  state: { status: 'ready', pack: { data } as never, warnings: [] },
  runtime: { relayUrl } as never,
});
const view = () => render(<FluentProvider theme={webLightTheme}><GenAiScenarioScreen /></FluentProvider>);
const input = () => screen.getByRole('textbox', { name: /解決策/ });
const run = () => fireEvent.click(screen.getByRole('button', { name: '分析実行' }));

let fetchMock: ReturnType<typeof vi.fn>;
// jsdom には ResizeObserver がない（Fluent の MessageBar が使う）
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= RO;
(window as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= RO;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useConsentStore.setState({ records: {} });
  setPack('http://127.0.0.1:8787');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FR-284 AC-733 画面の登録と「押したときだけ実行」', () => {
  it('AC-733 左メニューの画面として登録され、開くと [分析実行] と入力欄がある。開いた直後・入力直後は結果がなく、呼び出し 0 回', () => {
    const def = SCREENS.find((s) => s.key === 'genai-scenario');
    expect(def?.label).toBe('生成AIの効果的な活用シナリオの分析');
    expect(def?.nav).not.toBe(false);
    view();
    expect(screen.getByRole('button', { name: '分析実行' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: '分析結果' })).toBeNull();
    fireEvent.change(input(), { target: { value: '毎月の請求金額を計算する。' } });
    expect(screen.queryByRole('region', { name: '分析結果' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('FR-284 AC-734 モックの分析', () => {
  it('AC-734 [分析実行] で結論・判断基準の判定と根拠・代替案・理由の文章が出て、外部送信は 0 回', () => {
    view();
    fireEvent.change(input(), { target: { value: '問い合わせメールの大量の文章を要約する。' } });
    run();
    const r = screen.getByRole('region', { name: '分析結果' });
    expect(r.textContent).toMatch(/適する/);
    expect(r.textContent).toContain('使う具体的な理由');
    expect(r.textContent).toContain('適合性の判断基準');
    expect(r.textContent).toContain('代替案');
    expect(within(r).getAllByRole('listitem').length).toBeGreaterThan(7);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('AC-734 「不要／不向き」も正当な結論として使わない理由が出る', () => {
    view();
    fireEvent.change(input(), { target: { value: '毎月の請求金額を計算する。' } });
    run();
    const r = screen.getByRole('region', { name: '分析結果' });
    expect(r.textContent).toContain('生成AIは不要／不向き');
    expect(r.textContent).toContain('使わない理由');
  });
});

describe('FR-284 AC-736 入力の検査と解決策の選択', () => {
  it('AC-736 空は実行せず理由と対処を表示する', () => {
    view();
    run();
    expect(screen.getByRole('alert').textContent).toMatch(/入力されていない.*入力/);
    expect(screen.queryByRole('region', { name: '分析結果' })).toBeNull();
  });
  it('AC-736 上限（8000 文字）超過は実行せず、短くする対処を表示する', () => {
    view();
    fireEvent.change(input(), { target: { value: 'あ'.repeat(8001) } });
    run();
    expect(screen.getByRole('alert').textContent).toMatch(/8000.*短く/);
    expect(screen.queryByRole('region', { name: '分析結果' })).toBeNull();
  });
  it('AC-736 本アプリの解決策を選ぶと入力欄にその内容が入る', () => {
    view();
    fireEvent.change(screen.getByRole('combobox', { name: '本アプリの解決策を選ぶ' }), { target: { value: 'S1' } });
    expect((input() as HTMLTextAreaElement).value).toBe(data.issues.solutions[0]!.title);
  });
});

describe('FR-285 AC-737・AC-739 実接続の条件と失敗時の代替', () => {
  const consent = () => useConsentStore.setState({ records: { [consentKeyOf('合成株式会社', 'P')]: { confirmedOn: '2026-10-21', note: '同意書あり' } } as never });
  /** 共通接続（FR-275）の状態を返す中継の差し替え。analyze の応答は分析ごとに指定する */
  const relayMock = (cfg: { configured: boolean; enabled: boolean }, analyze: () => Response) => fetchMock.mockImplementation((u: string) =>
    Promise.resolve(String(u).includes('/foundry/config') ? new Response(JSON.stringify({ ...cfg, endpoint: 'https://x.services.ai.azure.com/openai/v1', host: 'x.services.ai.azure.com', deployment: 'd', keyMask: '••••' }), { status: 200 }) : analyze()));
  const enable = () => consent();
  it('AC-737 共通接続が有効でも、了承の記録がなければモックで外部呼び出し 0 回', () => {
    relayMock({ configured: true, enabled: true }, () => new Response('{}', { status: 500 }));
    view();
    fireEvent.change(input(), { target: { value: '文章を要約する' } });
    run();
    expect(screen.getByRole('region', { name: '分析結果' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('AC-739 失敗（キー未設定）は原因を表示し、ルールベースの結果を代替で表示する。要求は 1 回で再試行しない', async () => {
    enable();
    relayMock({ configured: true, enabled: true }, () => new Response(JSON.stringify({ error: { cause: 'key-missing' } }), { status: 503 }));
    view();
    fireEvent.change(input(), { target: { value: '問い合わせメールの文章を要約する' } });
    run();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/接続情報.*設定されていません/));
    expect(screen.getByRole('region', { name: '分析結果' }).textContent).toContain('代替');
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/foundry/analyze'));
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe('http://127.0.0.1:8787/foundry/analyze');
    expect(JSON.parse(init.body)).toEqual({ packId: '合成株式会社', solution: '問い合わせメールの文章を要約する' });
  });
  it('AC-738 成功時は Foundry の結果を表示する', async () => {
    enable();
    relayMock({ configured: true, enabled: true }, () => new Response(JSON.stringify({
      conclusion: 'conditional', criteria: [{ id: 'cost-benefit', verdict: 'partial', reason: '差し替えの根拠' }], reason: '差し替えの理由', alternatives: ['業務改善'],
    }), { status: 200 }));
    view();
    fireEvent.change(input(), { target: { value: '文章を要約する' } });
    run();
    await waitFor(() => expect(screen.getByRole('region', { name: '分析結果' }).textContent).toContain('差し替えの理由'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('AC-737 共通接続が無効（enabled=false）のときは了承ありでも /foundry/analyze を呼ばずモックで動く', async () => {
    enable();
    relayMock({ configured: true, enabled: false }, () => new Response('{}', { status: 500 }));
    view();
    fireEvent.change(input(), { target: { value: '文章を要約する' } });
    run();
    await waitFor(() => expect(screen.getByRole('region', { name: '分析結果' }).textContent).toContain('モック'));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/foundry/analyze'))).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
