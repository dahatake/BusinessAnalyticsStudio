// @vitest-environment jsdom
// FR-168（AC-327・AC-331）と NFR-SEC-005（AC-329・AC-330）の単体・結合テスト。
// 中継プロセスは実物（一時フォルダーの保管庫）、音声合成の接続先はモック（実際の Azure は呼ばない）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { maskKey, openSpeechVault } from '../../scripts/relay/speech-vault';
import { SpeechSettings } from '../../src/speech/SpeechSettings';
import { requestSpeechViaRelay, useSpeechRelay } from '../../src/speech/relayKey';
import { usePackStore } from '../../src/store/pack';
import { useSettings } from '../../src/store/settings';

const KEY = 'MOCK-KEY-0123456789-abcdefXYZ';
const KEY2 = 'MOCK-KEY-SECOND-9876543210-uvw';
const ENDPOINT = 'https://speech.mock.invalid/tts';

let relay: Relay;
let dir: string;
let upstream: Array<{ url: string; key: string | null }>;
// jsdom の AbortSignal は Node の fetch に渡せないため、検査では signal を外す
const nodeFetch: typeof fetch = (u, i) => fetch(u, { ...i, signal: undefined });
const wrap = () => render(<FluentProvider theme={webLightTheme}><SpeechSettings /></FluentProvider>);

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebak-vault-'));
  upstream = [];
  const speechFetch = (async (url: string, init: RequestInit) => {
    upstream.push({ url, key: (init.headers as Record<string, string>)['ocp-apim-subscription-key'] ?? null });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;
  relay = await startRelay({ sdk: null, speechVault: openSpeechVault(dir), speechFetch });
  usePackStore.setState({ runtime: { relayUrl: relay.url } });
  useSettings.setState({ speechEnabled: false, muted: true });
  useSpeechRelay.setState({ view: null });
});
afterEach(async () => {
  cleanup();
  await relay.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function saveVia(key: string, endpoint = ENDPOINT) {
  type('接続先の URL', endpoint);
  type('リージョン', 'japaneast');
  type('API キー', key);
  fireEvent.click(screen.getByRole('button', { name: 'API キーを保存' }));
}

describe('FR-168 AC-327 キーの保存・変更・削除', () => {
  it('保存→「設定済み」と伏せ字だけ→上書き→削除で未設定になり、以後の読み上げは送られない', async () => {
    wrap();
    await waitFor(() => expect(screen.getByTestId('speech-status').textContent).toBe('未設定'));
    await saveVia(KEY);
    await waitFor(() => expect(screen.getByTestId('speech-status').textContent).toBe('設定済み'));
    const mask = screen.getByTestId('speech-key-mask').textContent ?? '';
    expect(mask).toContain('•');
    expect(mask).not.toContain(KEY);
    expect((screen.getByLabelText('API キー') as HTMLInputElement).value).toBe('');
    expect(document.body.innerHTML).not.toContain(KEY);

    await saveVia(KEY2); // 変更（上書き）
    await waitFor(() => expect(screen.getByTestId('speech-key-mask').textContent).toContain(KEY2.slice(-4)));
    const ok = await requestSpeechViaRelay(relay.url, 'こんにちは', { fetchFn: nodeFetch });
    expect(ok).toMatchObject({ ok: true });
    expect(upstream).toEqual([{ url: ENDPOINT, key: KEY2 }]);

    fireEvent.click(screen.getByRole('button', { name: 'API キーを削除' }));
    await waitFor(() => expect(screen.getByTestId('speech-status').textContent).toBe('未設定'));
    const after = await requestSpeechViaRelay(relay.url, 'こんにちは', { fetchFn: nodeFetch });
    expect(after.ok).toBe(false);
    expect(upstream).toHaveLength(1); // 削除後は接続先へ要求が送られない
  });
  it('キーを省略した更新は、保存済みのキーを変えない', () => {
    const v = openSpeechVault(dir);
    v.save({ endpoint: ENDPOINT, region: 'a', key: KEY });
    v.save({ endpoint: ENDPOINT, region: 'b' });
    expect(v.secret()?.key).toBe(KEY);
    expect(() => openSpeechVault(fs.mkdtempSync(path.join(os.tmpdir(), 'ebak-v2-'))).save({ endpoint: ENDPOINT })).toThrow();
  });
});

describe('NFR-SEC-005 AC-329 ブラウザーに平文を置かない', () => {
  it('保存後、ストレージ・Cookie・URL・DOM・設定の取得の応答にキーの平文がない', async () => {
    wrap();
    await waitFor(() => expect(screen.getByTestId('speech-status')).toBeTruthy());
    await saveVia(KEY);
    await waitFor(() => expect(screen.getByTestId('speech-status').textContent).toBe('設定済み'));
    const dump = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.cookie, location.href, document.documentElement.outerHTML, JSON.stringify(useSpeechRelay.getState())].join('\n');
    expect(dump).not.toContain(KEY);
    const res = await fetch(`${relay.url}/speech/config`);
    const body = await res.text();
    expect(body).not.toContain(KEY);
    const j = JSON.parse(body) as { configured: boolean; keyMask: string };
    expect(j.configured).toBe(true);
    expect(j.keyMask).toBe(maskKey(KEY));
    expect(Object.keys(j).sort()).toEqual(['configured', 'endpoint', 'host', 'keyMask', 'region']);
  });
});

describe('NFR-SEC-005 AC-330 暗号化・ログ・送信先', () => {
  it('保管ファイルは暗号化され、リポジトリの外にあり、ログ・エラー・接続先以外にキーが出ない', async () => {
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    openSpeechVault(dir).save({ endpoint: ENDPOINT, region: 'x', key: KEY });
    for (const f of fs.readdirSync(dir)) {
      if (f === 'master.key') continue;
      const raw = fs.readFileSync(path.join(dir, f));
      expect(raw.includes(KEY)).toBe(false);
      expect(raw.toString('base64').includes(Buffer.from(KEY).toString('base64'))).toBe(false);
    }
    expect(path.relative(process.cwd(), dir).startsWith('..')).toBe(true);
    // 不正な接続先は拒否され、エラーにキーが出ない
    const bad = await fetch(`${relay.url}/speech/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'http://example.com/x', key: KEY }) });
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain(KEY);
    // 保存した接続先にだけ送る（要求の中身で別の接続先は指定できない）
    await fetch(`${relay.url}/speech/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: ENDPOINT, key: KEY }) });
    await fetch(`${relay.url}/speech/synthesize`, { method: 'POST', body: JSON.stringify({ ssml: '<speak/>', endpoint: 'https://evil.invalid/' }) });
    expect(upstream.map((u) => u.url)).toEqual([ENDPOINT]);
    for (const spy of [log, err, warn]) expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  });
  it('音声合成の接続先が失敗しても、応答にキーが出ない', async () => {
    const r = await startRelay({ sdk: null, speechVault: openSpeechVault(dir), speechFetch: (async () => { throw new Error(`boom ${KEY}`); }) as never });
    try {
      await fetch(`${r.url}/speech/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: ENDPOINT, key: KEY }) });
      const res = await fetch(`${r.url}/speech/synthesize`, { method: 'POST', body: JSON.stringify({ ssml: '<speak/>' }) });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain(KEY);
    } finally {
      await r.close();
    }
  });
});

describe('FR-168 AC-331 キーボード操作とアクセシブルな名前', () => {
  it('入力欄とボタンが名前を持ち、保存・削除の結果とエラーが文字で示される', async () => {
    wrap();
    await waitFor(() => expect(screen.getByTestId('speech-status')).toBeTruthy());
    for (const n of ['接続先の URL', 'リージョン', 'API キー']) expect(screen.getByLabelText(n)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'API キーを保存' }).getAttribute('type')).toBe('submit');
    expect(screen.getByRole('button', { name: 'API キーを削除' }).getAttribute('type')).toBe('button');
    // エラー
    await saveVia(KEY, 'http://example.com/x');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('保存できませんでした');
    expect(alert.textContent).not.toContain(KEY);
    // 成功（フォームの送信＝Enter キーでも保存できる）
    type('接続先の URL', ENDPOINT);
    type('API キー', KEY);
    fireEvent.submit(screen.getByTestId('speech-key-form'));
    await waitFor(() => expect(screen.getByTestId('speech-key-result').textContent).toContain('保存しました'));
    fireEvent.click(screen.getByRole('button', { name: 'API キーを削除' }));
    await waitFor(() => expect(screen.getByTestId('speech-key-result').textContent).toContain('削除しました'));
  });
});
