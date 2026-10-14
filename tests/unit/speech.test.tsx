// @vitest-environment jsdom
// FR-167（AC-325・AC-326・AC-328）の単体・結合テスト。音声合成の接続先はモック（実際の Azure は呼ばない）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SpeechSettings } from '../../src/speech/SpeechSettings';
import type { StoryScene } from '../../src/usecase/storyboard';
import { StoryboardPlayer } from '../../src/usecase/StoryboardPlayer';
import { buildSsml, explainFailure, isSpeechConfigured, requestSpeech } from '../../src/speech/speech';
import { usePackStore } from '../../src/store/pack';
import { useSettings } from '../../src/store/settings';
import { useStoryboardUi } from '../../src/store/storyboardUi';

const URL_MOCK = 'https://speech.mock.invalid/tts';
const CFG = { endpoint: URL_MOCK, key: 'mock-key-not-secret' };
const scenes: StoryScene[] = [
  { kind: 'intro', heading: '見出し1', caption: '一つ目の字幕です', telop: '*強調*' },
  { kind: 'step', heading: '見出し2', caption: '二つ目の字幕です', telop: '*効果*' },
];
const wrap = (ui: React.ReactElement) => render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
const okRes = () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array(8)]) }) as unknown as Response;

beforeEach(() => {
  usePackStore.setState({ runtime: {} });
  useSettings.setState({ speechEnabled: false, muted: true });
  useStoryboardUi.setState({ index: 0, state: 'paused' } as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('requestSpeech（接続先へ送る口）', () => {
  // FR-167 AC-325
  it('字幕の文言を SSML にして接続先へ送る', async () => {
    const f = vi.fn(async () => okRes());
    const r = await requestSpeech(CFG, '字幕 & <文言>', { fetchFn: f as never, online: () => true });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_MOCK);
    expect(String(init.body)).toContain('字幕 &amp; &lt;文言&gt;');
    expect(buildSsml('a')).toContain('<speak');
  });
  // FR-167 AC-326
  it('未設定・オフライン・HTTP 失敗・タイムアウト・通信失敗は、例外にせず原因と直し方を返す', async () => {
    const f = vi.fn(async () => okRes());
    const un = await requestSpeech({}, 'x', { fetchFn: f as never });
    expect(un).toMatchObject({ ok: false, kind: 'unconfigured' });
    expect(f).not.toHaveBeenCalled();
    expect(await requestSpeech(CFG, 'x', { fetchFn: f as never, online: () => false })).toMatchObject({ ok: false, kind: 'offline' });
    const h = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    expect(await requestSpeech(CFG, 'x', { fetchFn: h as never, online: () => true })).toMatchObject({ ok: false, kind: 'http' });
    const n = vi.fn(async () => { throw new TypeError('net'); });
    expect(await requestSpeech(CFG, 'x', { fetchFn: n as never, online: () => true })).toMatchObject({ ok: false, kind: 'network' });
    const hang = vi.fn((_u: string, i: RequestInit) => new Promise<Response>((_, rej) => i.signal?.addEventListener('abort', () => rej(new Error('abort')))));
    expect(await requestSpeech(CFG, 'x', { fetchFn: hang as never, online: () => true, timeoutMs: 10 })).toMatchObject({ ok: false, kind: 'timeout' });
    for (const k of ['unconfigured', 'offline', 'timeout', 'http', 'network'] as const) expect(explainFailure(k)).toMatch(/原因.*直し方/);
  });
  it('接続先が https でない・キーが空のときは未設定', () => {
    expect(isSpeechConfigured({ endpoint: 'http://example.com', key: 'k' })).toBe(false);
    expect(isSpeechConfigured({ endpoint: URL_MOCK, key: ' ' })).toBe(false);
    expect(isSpeechConfigured(CFG)).toBe(true);
  });
});

describe('SpeechSettings（設定画面の音声設定）', () => {
  // FR-167 AC-325 AC-328
  it('設定済みと表示し、キーの値は画面に出さない', () => {
    usePackStore.setState({ runtime: { speech: CFG } });
    wrap(<SpeechSettings />);
    expect(screen.getByRole('region', { name: '音声設定' })).toBeTruthy();
    expect(screen.getByTestId('speech-status').textContent).toBe('設定済み');
    expect(document.body.textContent).not.toContain(CFG.key);
  });
  // FR-167 AC-328
  it('読み上げのスイッチに名前があり、未設定で有効にするとエラーが文字で出る。localStorage にキーを書かない', () => {
    wrap(<SpeechSettings />);
    expect(screen.getByTestId('speech-status').textContent).toBe('未設定');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: '字幕の読み上げ' }));
    expect(useSettings.getState().speechEnabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/未設定/);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('key');
  });
});

describe('StoryboardPlayer の読み上げ', () => {
  const play = () => wrap(<StoryboardPlayer name="UC" scenes={scenes} onClose={() => undefined} />);
  // FR-167 AC-326
  it('ミュートのまま（既定）では要求を送らず、通知も出ない', async () => {
    const f = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', f);
    usePackStore.setState({ runtime: { speech: CFG } });
    useSettings.setState({ speechEnabled: true, muted: true });
    play();
    await act(async () => { await Promise.resolve(); });
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByTestId('speech-sending-notice')).toBeNull();
  });
  // FR-167 AC-325
  it('有効・ミュート解除で、字幕と同じ文言が送られ、送信が表示される', async () => {
    const f = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', f);
    usePackStore.setState({ runtime: { speech: CFG } });
    useSettings.setState({ speechEnabled: true, muted: false });
    play();
    await act(async () => { await Promise.resolve(); });
    expect(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain(scenes[0]!.caption);
    expect(screen.getByTestId('speech-sending-notice').textContent).toContain('speech.mock.invalid');
    expect(screen.queryByTestId('speech-error')).toBeNull();
  });
  // FR-167 AC-326
  it('未設定のとき、字幕は出たままで、原因と直し方が表示され、何も送らない', async () => {
    const f = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', f);
    useSettings.setState({ speechEnabled: true, muted: false });
    play();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('speech-error').textContent).toMatch(/原因.*直し方/);
    expect(screen.getByTestId('storyboard-caption').textContent).toBe(scenes[0]!.caption);
    expect(f).not.toHaveBeenCalled();
  });
  // FR-167 AC-326
  it('接続先が失敗を返しても、字幕だけで続き、エラーが表示される', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    usePackStore.setState({ runtime: { speech: CFG } });
    useSettings.setState({ speechEnabled: true, muted: false });
    play();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByTestId('speech-error').textContent).toMatch(/原因/);
    expect(screen.getByTestId('storyboard-caption')).toBeTruthy();
    expect(screen.queryByTestId('speech-sending-notice')).toBeNull();
  });
});
