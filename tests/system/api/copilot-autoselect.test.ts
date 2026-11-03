// System Test（integration 相当）: SDK が認証済みのときの接続先の自動選択と、保存済みの接続先の保持（FR-011 AC-817・AC-818）
// 期待値は受入基準だけから決める。中継プロセスを実際に起動し、Copilot SDK は差し替え部品（認証済み／未認証）を渡す。
// データフォルダーは環境変数 EDB_RELAY_DATA の一時フォルダー。実 GitHub・実 gh・実 Foundry には接続しない。
// 実行: npx tsx --test tests/system/api/copilot-autoselect.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startRelay, type Relay } from '../../../scripts/relay/relay';

const SDK_TOKEN = 'SDK-CRED-DUMMY-4d8e1f3a9b7c2e50';

/** 差し替えの Copilot SDK 部品。認証情報（SDK_TOKEN）を内部に持つが、中継は保存も応答もしてはならない。 */
function sdkStub(mode: 'authenticated' | 'unauthenticated' | 'unavailable') {
  return {
    async status() {
      if (mode === 'unavailable') throw new Error('stub sdk: not available');
      return { signedIn: mode === 'authenticated', isAuthenticated: mode === 'authenticated', token: SDK_TOKEN } as { signedIn: boolean };
    },
    async complete() { return 'stub'; },
  };
}

interface Env { dir: string; relay: Relay | null; seen: string[]; start(mode: 'authenticated' | 'unauthenticated' | 'unavailable' | 'none'): Promise<void>; stop(): Promise<void>; call(method: string, p: string, body?: unknown): Promise<{ status: number; text: string }>; cleanup(): Promise<void> }

function setup(): Env {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-autoselect-'));
  const prev = process.env.EDB_RELAY_DATA;
  process.env.EDB_RELAY_DATA = dir;
  const e: Env = {
    dir, relay: null, seen: [],
    async start(mode) { e.relay = await startRelay({ sdk: mode === 'none' ? null : sdkStub(mode), port: 0 } as never); },
    async stop() { await e.relay?.close(); e.relay = null; },
    async call(method, p, body) {
      const r = await fetch(e.relay!.url + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text();
      e.seen.push(text);
      return { status: r.status, text };
    },
    async cleanup() {
      await e.stop();
      if (prev === undefined) delete process.env.EDB_RELAY_DATA; else process.env.EDB_RELAY_DATA = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return e;
}

const provider = async (e: Env, packId = 'pack-1') => JSON.parse((await e.call('GET', `/ai/provider?packId=${packId}`)).text) as { provider: string; enabled?: boolean };
function allFiles(dir: string): string[] { return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name)); }

// FR-011 AC-817
test('FR-011 AC-817 SDK が認証済みで接続先が未保存なら、起動だけで接続先が GitHub Copilot SDK になる（認証情報は保存・応答に出ず、送信の確認は有効にならない）', async () => {
  const e = setup();
  try {
    assert.equal(fs.existsSync(path.join(e.dir, 'ai-provider.json')), false, '前提: 接続先が未保存');
    await e.start('authenticated');
    const p = await provider(e);
    assert.equal(p.provider, 'copilot', '認証済みなら利用者の操作なしで copilot になる');
    // 画面の AI の状態表示に使う応答（共通接続の設定）にも接続先が示される
    const cfg = JSON.parse((await e.call('GET', '/foundry/config?packId=pack-1')).text) as { provider: string; enabled: boolean };
    assert.equal(cfg.provider, 'copilot');
    // 顧客パックごとの送信の確認は自動では有効にならない
    assert.notEqual(p.enabled, true, 'foundryEnabled が自動で有効になった');
    assert.notEqual(cfg.enabled, true, 'foundryEnabled が自動で有効になった');
    // 有効化していないので外部への送信（ask）は拒否され、SDK の complete も呼ばれない
    const ask = await e.call('POST', '/foundry/ask', { packId: 'pack-1', prompt: 'x', consent: true });
    assert.ok(ask.status >= 400 && ask.status < 500, `有効化前の送信が拒否されない（${ask.status}）`);
    // 認証情報の非保存・非表示
    await e.call('GET', '/copilot/config');
    await e.call('GET', '/health');
    for (const [i, s] of e.seen.entries()) assert.ok(!s.includes(SDK_TOKEN), `応答 ${i} に認証情報が含まれる`);
    for (const f of allFiles(e.dir)) {
      const b = fs.readFileSync(f);
      assert.ok(!b.toString('utf8').includes(SDK_TOKEN) && !b.toString('base64').includes(SDK_TOKEN), `保管ファイル ${path.basename(f)} に認証情報が含まれる`);
    }
  } finally { await e.cleanup(); }
});

// FR-011 AC-818（保存済みの接続先は、認証済みでの再起動後も変わらない）
test('FR-011 AC-818 明示保存した接続先（Foundry を含む）は、SDK が認証済みでの再起動後も変わらない', async () => {
  const e = setup();
  try {
    await e.start('unauthenticated');
    assert.equal((await e.call('PUT', '/ai/provider', { provider: 'foundry' })).status, 200);
    await e.stop();
    await e.start('authenticated');
    assert.equal((await provider(e)).provider, 'foundry', 'Foundry を明示保存したのに再起動で変わった');
    // copilot を明示保存し、その後 foundry へ戻した場合も、再起動で保持される
    assert.equal((await e.call('PUT', '/ai/provider', { provider: 'copilot' })).status, 200);
    assert.equal((await e.call('PUT', '/ai/provider', { provider: 'foundry' })).status, 200);
    await e.stop();
    await e.start('authenticated');
    assert.equal((await provider(e)).provider, 'foundry');
  } finally { await e.cleanup(); }
});

// FR-011 AC-818（異常系: 未認証・利用不可・SDK なし）
test('FR-011 AC-818 異常系: SDK が未認証・利用不可・なしのとき、未保存の接続先は従来どおり（既定の Foundry）で、状態が未サインインと示される', async () => {
  for (const mode of ['unauthenticated', 'unavailable', 'none'] as const) {
    const e = setup();
    try {
      await e.start(mode);
      assert.equal((await provider(e)).provider, 'foundry', `${mode}: 自動選択されてはならない`);
      const health = JSON.parse((await e.call('GET', '/health')).text) as { copilot: string };
      assert.equal(health.copilot, 'signed-out', `${mode}: 未サインインが明示されない`);
      assert.notEqual(((await provider(e)) as { enabled?: boolean }).enabled, true);
      // 明示保存した copilot は、未認証での再起動でも保たれる（接続先は変えず、未サインインを明示する）
      assert.equal((await e.call('PUT', '/ai/provider', { provider: 'copilot' })).status, 200);
      await e.stop();
      await e.start(mode);
      assert.equal((await provider(e)).provider, 'copilot', `${mode}: 保存済みの接続先が変わった`);
      assert.equal(JSON.parse((await e.call('GET', '/health')).text).copilot, 'signed-out');
    } finally { await e.cleanup(); }
  }
});
