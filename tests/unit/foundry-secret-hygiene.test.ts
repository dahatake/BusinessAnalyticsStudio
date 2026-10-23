// NFR-SEC-012 AC-729・AC-730: Foundry の API キー・Entra ID のトークンを、応答・ログ・保管ファイル・リポジトリ・テストデータに出さない（結合検査）。
// ダミーのキーは実行時に組み立てる（リテラルで置かない）。Foundry へは実接続せず、送信口はスタブ。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';

const DUMMY_KEY = ['sk', 'dummy', Math.random().toString(36).slice(2), 'ABCDEFGHIJKLMNOPQRSTUV'].join('-');
const DUMMY_TOKEN = ['eyJ' + 'hbGciOiJSUzI1NiJ9', 'eyJ' + 'zdWIiOiJkdW1teS11c2VyLTEyMzQ1Njc4OTAifQ', 'c2lnbmF0dXJlLWR1bW15LXZhbHVl'].join('.');
const EP = 'https://foundry.example.invalid/openai/v1';
const open: Relay[] = [];
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const KEY_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
];

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-sec-'));
  dirs.push(dir);
  const logs: string[] = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); });
  }
  const upstream: Array<{ auth: string | null; apiKey: string | null }> = [];
  const body = { output_text: JSON.stringify({ summary: '要約', steps: [] }) };
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: (m) => logs.push(m) });
  const relay = await startRelay({
    sdk: null, foundryVault, foundryTimeoutMs: 2000,
    foundryFetch: (async (_u: unknown, i?: RequestInit) => {
      const h = new Headers(i?.headers);
      upstream.push({ auth: h.get('authorization'), apiKey: h.get('api-key') });
      // 上流の失敗の本文にキーが含まれていても、中継は本文を返さない
      return new Response(JSON.stringify({ error: `bad key ${DUMMY_KEY}` }), { status: 401 });
    }) as typeof fetch,
  });
  open.push(relay);
  return { dir, logs, upstream, url: relay.url, body };
}

const put = (url: string, b: unknown) => fetch(`${url}/foundry/config?packId=P`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const post = (url: string, p: string, b: unknown) => fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

/** 保存・接続の有効化・分析実行（ask・review・analyze）を行い、すべての応答の本文を集める */
async function runAll(url: string): Promise<string[]> {
  const out: string[] = [];
  const keep = async (r: Response) => { out.push(`${r.status} ${await r.text()}`); };
  await keep(await post(url, '/foundry/connection', { packId: 'P', enable: true, consent: true, confirmed: true }));
  await keep(await post(url, '/foundry/ask', { packId: 'P', prompt: '課題の説明', consent: true }));
  await keep(await post(url, '/foundry/review', { packId: 'P', consent: true, components: [{ id: 'c1', title: 't', text: 'x' }] }));
  await keep(await post(url, '/foundry/analyze', { packId: 'P', solution: '解決策' }));
  await keep(await fetch(`${url}/foundry/config?packId=P`));
  await keep(await fetch(`${url}/health`));
  return out;
}

const filesText = (dir: string): Array<{ name: string; raw: Buffer }> => fs.readdirSync(dir).map((n) => ({ name: n, raw: fs.readFileSync(path.join(dir, n)) }));

describe('NFR-SEC-012 AC-729 API キーの平文が応答・ログ・保管ファイルに出ない', () => {
  it('NFR-SEC-012 AC-729 保存と分析実行の後、応答・ログに平文のキーがなく、保管ファイルは暗号化されている', async () => {
    const { dir, logs, url } = await setup();
    const saved = await put(url, { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY, authMethod: 'api-key' });
    expect(saved.status).toBe(200);
    const responses = [`${saved.status} ${await saved.text()}`, ...(await runAll(url))];
    for (const r of responses) expect(r).not.toContain(DUMMY_KEY);
    for (const l of logs) expect(l).not.toContain(DUMMY_KEY);
    const files = filesText(dir);
    expect(files.map((f) => f.name)).toContain('foundry.enc');
    for (const f of files) {
      expect(f.raw.toString('utf8')).not.toContain(DUMMY_KEY);
      expect(f.raw.toString('latin1')).not.toContain(DUMMY_KEY);
      expect(f.raw.toString('base64')).not.toContain(Buffer.from(DUMMY_KEY).toString('base64').slice(0, 24));
    }
    // 保管ファイルから復号できるのは同じ保管庫（マスター鍵）だけ。別のフォルダーの保管庫は読めない
    expect(openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} }).secret()?.key).toBe(DUMMY_KEY);
  });

  it('NFR-SEC-012 AC-729 上流のエラー本文にキーが入っていても、中継の応答・ログに出ない', async () => {
    const { logs, url } = await setup();
    await put(url, { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY });
    const rs = await runAll(url);
    expect(rs.some((r) => r.startsWith('200') || r.startsWith('4') || r.startsWith('5'))).toBe(true);
    expect(rs.join('\n')).not.toContain(DUMMY_KEY);
    expect(logs.join('\n')).not.toContain(DUMMY_KEY);
  });

  it('NFR-SEC-012 AC-729 保管ファイルの置き場は git の管理対象外（リポジトリの外のデータフォルダー）', () => {
    const dataDir = path.resolve(os.tmpdir(), 'x');
    expect(path.relative(REPO_ROOT, dataDir).startsWith('..')).toBe(true);
    const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/);
    expect(tracked.filter((f) => /(^|\/)(foundry\.enc|master\.key)$/.test(f))).toEqual([]);
  });

  it('NFR-SEC-012 AC-729 リポジトリの Foundry 関連のコード・テストデータに API キーの形の文字列がない', () => {
    const files = [
      'scripts/relay', 'src/ai', 'src/genai', 'tests/unit/foundry-chat.test.ts', 'tests/unit/foundry-connection.test.ts', 'tests/unit/foundry.test.ts',
      'tests/unit/foundry-secret-hygiene.test.ts', 'tests/unit/relay.test.ts', 'tests/system/support',
    ].flatMap((p) => {
      const abs = path.join(REPO_ROOT, p);
      if (!fs.existsSync(abs)) return [];
      return fs.statSync(abs).isDirectory() ? fs.readdirSync(abs).filter((n) => /\.(tsx?|mjs|json)$/.test(n)).map((n) => path.join(abs, n)) : [abs];
    });
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      for (const re of KEY_PATTERNS) if (re.test(t)) hits.push(`${path.relative(REPO_ROOT, f)} : ${re}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('NFR-SEC-012 AC-730 Entra ID ではキーを保存せず、トークンを出さない', () => {
  it('NFR-SEC-012 AC-730 Entra ID を選ぶとキーは保存されず、応答・ログ・保管ファイルにキーもトークンもない', async () => {
    const { dir, logs, upstream, url } = await setup();
    // キーを同時に送っても、Entra ID では保存しない
    const saved = await put(url, { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY, authMethod: 'entra' });
    expect(saved.status).toBe(200);
    const savedBody = await saved.text();
    expect(JSON.parse(savedBody)).toMatchObject({ configured: true, authMethod: 'entra', keyMask: '' });
    const responses = [savedBody, ...(await runAll(url))];
    const vault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
    expect(vault.secret()).toBeNull();
    expect(vault.entraReady()).toBe(true);
    for (const needle of [DUMMY_KEY, DUMMY_TOKEN]) {
      for (const r of responses) expect(r).not.toContain(needle);
      for (const l of logs) expect(l).not.toContain(needle);
      for (const f of filesText(dir)) {
        expect(f.raw.toString('utf8')).not.toContain(needle);
        expect(f.raw.toString('latin1')).not.toContain(needle);
      }
    }
    // 保存データを復号してもキーの欄が空である
    for (const u of upstream) { expect(u.apiKey ?? '').not.toContain(DUMMY_KEY); expect(u.auth ?? '').not.toContain(DUMMY_KEY); }
  });

  it('NFR-SEC-012 AC-730 API キー方式から Entra ID に切り替えると、保存済みのキーが破棄される', async () => {
    const { dir, url } = await setup();
    await put(url, { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY });
    expect(openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} }).secret()?.key).toBe(DUMMY_KEY);
    await put(url, { endpoint: EP, deployment: 'dep1', authMethod: 'entra' });
    const v = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
    expect(v.secret()).toBeNull();
    expect(v.view().keyMask).toBe('');
  });
});
