// @vitest-environment jsdom
// FR-278 Copilot で分析実行・FR-279 Copilot の案（AC-716 AC-717 AC-718 AC-719 AC-720 の単体・結合。AC-715・717・718・719 は System Test E2E-409〜412）。
// Foundry へは実接続しない（中継は foundryFetch のスタブ）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { buildReviewPrompt, parseReviewComponents, parseReviewReply } from '../../scripts/relay/foundry-review';
import { putFoundryConfig, setFoundryConnection, type FoundryView } from '../../src/ai/foundryClient';
import { addUsage, checkUsage, DEFAULT_LIMITS, emptyRecord } from '../../src/ai/foundryUsage';
import { fitTargets, runReview, type ReviewDeps, type ReviewTarget } from '../../src/review/reviewFlow';
import { answerSend, askSend, registerReflector, useReviewStore } from '../../src/review/reviewStore';
import { CopilotProposal } from '../../src/review/CopilotProposal';
import { collectDomTargets, collectTargetsFor } from '../../src/review/reviewTargets';

const view = (o: Partial<FoundryView> = {}): FoundryView => ({ configured: true, endpoint: 'e', host: 'h', deployment: 'd', keyMask: '', enabled: true, ...o });
const T: ReviewTarget[] = [
  { id: 'table', label: '表', data: 'A 100 B 200' },
  { id: 'issue-solution', label: '課題と解決策', data: '課題: 停止' },
  { id: 'empty', label: '空', data: '   ' },
];
const NOW = new Date(2026, 9, 23, 12, 0, 0);

function deps(over: Partial<ReviewDeps> = {}) {
  const calls = { request: 0, confirm: 0, person: 0 };
  let rec = emptyRecord(NOW);
  const d: ReviewDeps = {
    relayUrl: 'http://127.0.0.1:1', packId: 'P', consent: true, includesPerson: false,
    view: async () => view(),
    usage: { check: () => checkUsage(rec, DEFAULT_LIMITS, NOW), count: (n) => { rec = addUsage(rec, DEFAULT_LIMITS, NOW, n); } },
    confirmSend: async () => { calls.confirm++; return true; },
    confirmPerson: async () => { calls.person++; return { allowed: true }; },
    request: async (_u, req) => { calls.request++; return { ok: true, reviews: req.components.map((c) => ({ id: c.id, proposal: `案-${c.id}` })) }; },
    ...over,
  };
  return { d, calls, get rec() { return rec; } };
}

describe('FR-278 AC-716 送信前の確認・了承のゲート（結合）', () => {
  it('確認を取り消すと Foundry への呼び出しは 0 回で、利用量も数えない', async () => {
    const x = deps({ confirmSend: async () => false });
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('cancelled');
    expect(x.calls.request).toBe(0);
    expect(x.rec.dayCount).toBe(0);
  });
  it('確認には、データを持たないコンポーネントを除いた対象の一覧が渡る', async () => {
    let seen: string[] = [];
    const x = deps({ confirmSend: async (t) => { seen = t.map((a) => a.id); return true; } });
    await runReview(x.d, T);
    expect(seen).toEqual(['table', 'issue-solution']);
  });
  it('了承の記録がない案件は、理由が示され、確認も呼び出しも 0 回', async () => {
    const x = deps({ consent: false });
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.text).toContain('了承');
    expect(x.calls.request + x.calls.confirm).toBe(0);
  });
  it('未設定・実接続が無効・中継に届かないときは、理由を示して 0 回', async () => {
    for (const v of [view({ configured: false }), view({ enabled: false }), null]) {
      const x = deps({ view: async () => v });
      const out = await runReview(x.d, T);
      expect(out.kind).toBe('blocked');
      expect(x.calls.request + x.calls.confirm).toBe(0);
    }
    const out = await runReview(deps({ view: async () => view({ configured: false }) }).d, T);
    if (out.kind === 'blocked') { expect(out.text).toContain('未設定'); expect(out.text).toContain('設定画面'); }
  });
  it('1 日の回数の上限に達していれば 0 回', async () => {
    const x = deps({ usage: { check: () => checkUsage({ ...emptyRecord(NOW), dayCount: DEFAULT_LIMITS.dailyLimit }, DEFAULT_LIMITS, NOW), count: () => {} } });
    expect((await runReview(x.d, T)).kind).toBe('blocked');
    expect(x.calls.request).toBe(0);
  });
  it('種別「人」を含むときは確認を通し、中止なら 0 回', async () => {
    const x = deps({ includesPerson: true, confirmPerson: async () => ({ allowed: false, reason: '中止' }) });
    const out = await runReview(x.d, T);
    expect(out).toEqual({ kind: 'blocked', text: '中止' });
    expect(x.calls.request).toBe(0);
  });
  it('正常: 呼び出しは 1 回で、利用量に数える', async () => {
    const x = deps();
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('done');
    expect(x.calls.request).toBe(1);
    expect(x.rec.dayCount).toBe(1);
  });
  it('送るデータは上限に収まるよう切る', () => {
    const big = fitTargets([{ id: 'a', label: 'a', data: 'あ'.repeat(40000) }, { id: 'b', label: 'b', data: 'い'.repeat(40000) }]);
    expect(big.reduce((n, t) => n + t.data.length, 0)).toBeLessThanOrEqual(8000 * 4);
  });
});

describe('FR-278 AC-717 結果はそのコンポーネントの案としてだけ（結合）', () => {
  it('返らなかった id は案なし。依頼にない id・文字でない案は捨てる', async () => {
    const x = deps({ request: async () => ({ ok: true, reviews: [{ id: 'issue-solution', proposal: '案B' }, { id: 'other', proposal: 'x' }, { id: 'table', proposal: '  ' }] }) });
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('done');
    if (out.kind === 'done') {
      expect(out.proposals).toEqual({ 'issue-solution': '案B' });
      useReviewStore.getState().finish(out.targets, out.proposals);
      const st = useReviewStore.getState();
      expect(st.none.table).toBe(true);
      expect(st.none.empty).toBe(true);
      expect(st.none['issue-solution']).toBeUndefined();
    }
  });
  it('失敗は理由つきで、別の送信先へは切り替えない', async () => {
    const x = deps({ request: async () => ({ ok: false, reason: 'timeout' }) });
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('failed');
    expect(x.rec.dayCount).toBe(1); // 呼んだ分は失敗も数える
  });
});

describe('中継 POST /foundry/review（Foundry の送信口はスタブ）', () => {
  const open: Relay[] = [];
  const dirs: string[] = [];
  afterEach(async () => { while (open.length) await open.pop()!.close(); while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
  async function setup(text: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
    dirs.push(dir);
    let calls = 0;
    const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
    const relay = await startRelay({
      sdk: null, foundryVault, foundryTimeoutMs: 500,
      foundryFetch: (async () => { calls++; return new Response(JSON.stringify({ output_text: text }), { status: 200 }); }) as typeof fetch,
    });
    open.push(relay);
    await putFoundryConfig(relay.url, 'P', { endpoint: 'https://foundry.example.invalid/openai/v1', deployment: 'd', key: 'dummy-foundry-key-0123456789' });
    return { relay, calls: () => calls };
  }
  const post = (url: string, body: unknown) => fetch(`${url}/foundry/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Record<string, unknown>>);
  const comps = [{ id: 'table', data: 'A 1' }, { id: 'memo', data: 'メモ' }];

  it('実接続が有効でなければ Foundry を呼ばない。有効なら案を id ごとに返し、依頼にない id は捨てる', async () => {
    const s = await setup('```json\n{"reviews":[{"id":"table","proposal":"表の案"},{"id":"zzz","proposal":"x"}]}\n```');
    expect((await post(s.relay.url, { packId: 'P', consent: true, components: comps })).reason).toBe('disabled');
    await setFoundryConnection(s.relay.url, 'P', true, { consent: true, confirmed: true });
    expect((await post(s.relay.url, { packId: 'P', consent: false, components: comps })).reason).toBe('consent');
    expect((await post(s.relay.url, { packId: 'P', consent: true, includesPerson: true, components: comps })).reason).toBe('person-unconfirmed');
    expect(s.calls()).toBe(0);
    const ok = await post(s.relay.url, { packId: 'P', consent: true, components: comps });
    expect(ok.reviews).toEqual([{ id: 'table', proposal: '表の案' }]);
    expect(s.calls()).toBe(1);
  });
  it('異常系: 読めない応答は unavailable（error）で、キーを含まない', async () => {
    const s = await setup('これは JSON ではありません');
    await setFoundryConnection(s.relay.url, 'P', true, { consent: true, confirmed: true });
    const r = await post(s.relay.url, { packId: 'P', consent: true, components: comps });
    expect(r.reason).toBe('error');
    expect(JSON.stringify(r)).not.toContain('dummy-foundry-key');
  });
  it('components がなければ 400', async () => {
    const s = await setup('{}');
    expect((await fetch(`${s.relay.url}/foundry/review`, { method: 'POST', body: JSON.stringify({ packId: 'P', consent: true }) })).status).toBe(400);
  });
  it('依頼の組み立てと応答の解釈（純粋）', () => {
    expect(parseReviewComponents([{ id: 'a', data: 'x' }, { id: 'a', data: 'y' }, { id: 3 }, null])).toEqual([{ id: 'a', data: 'x' }]);
    expect(buildReviewPrompt([{ id: 'a', data: 'データ' }])).toContain('id: a');
    expect(parseReviewReply('{"reviews":[{"id":"a","proposal":"p"}]}', ['a'])).toEqual([{ id: 'a', proposal: 'p' }]);
    expect(parseReviewReply('x', ['a'])).toBeNull();
  });
});

const wrap = (ui: React.ReactElement) => render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
beforeEach(() => useReviewStore.setState({ run: 'idle', message: '', notice: null, proposals: {}, none: {}, confirm: null }));
afterEach(() => cleanup());

describe('FR-279 AC-718・AC-719 案の表示・編集・破棄、AC-720 キーボードと状態のメッセージ（結合）', () => {
  it('案は AI 生成のラベル付きで、現在のデータとは別の欄に出る。データの欄は変わらない', () => {
    useReviewStore.getState().finish(['table'], { table: 'テーブルの案' });
    wrap(<section data-testid="component-table" aria-label="表"><div data-testid="component-data">A 100</div><CopilotProposal componentKey="table" title="表" /></section>);
    const p = screen.getByTestId('copilot-proposal');
    expect(p.textContent).toContain('Copilot の案（AI 生成）');
    expect(screen.getByTestId('component-data').contains(p)).toBe(false);
    expect(screen.getByTestId('component-data').textContent).toBe('A 100');
    expect(collectDomTargets()).toEqual([{ id: 'table', label: '表', data: 'A 100' }]);
  });
  it('画面にまだ出ていないコンポーネントは、画面の宣言の種類に当たる項目を対象にし、当たらなければデータなし（A-70）', () => {
    const graph = { nodes: [{ id: 'i1', kind: 'issue', label: '設備停止' }, { id: 's1', kind: 'solution', label: '予知保全' }, { id: 'p', kind: 'product', label: 'X' }] } as unknown as Parameters<typeof collectTargetsFor>[1];
    const out = collectTargetsFor([{ key: 'issue-solution', label: '課題-解決策分析', view: { kinds: ['issue', 'solution'] } }, { key: 'memo', label: 'メモ' }, { key: 'settings', label: '設定' }, { key: 'table', label: '表', view: { kinds: ['issue'] } }], graph, document.createElement('div'));
    expect(out).toEqual([
      { id: 'issue-solution', label: '課題-解決策分析', data: '課題: 設備停止 / 解決策: 予知保全' },
      { id: 'memo', label: 'メモ', data: '' },
      { id: 'table', label: '表', data: '課題: 設備停止' },
    ]);
  });
  it('編集は store に残り（再描画・レイアウト変更後も失われない）、破棄で案が消える', () => {
    useReviewStore.getState().finish(['table'], { table: '元の案' });
    const { unmount } = wrap(<CopilotProposal componentKey="table" title="表" />);
    fireEvent.change(screen.getByRole('textbox', { name: '表の Copilot の案を編集' }), { target: { value: '編集後' } });
    unmount();
    wrap(<CopilotProposal componentKey="table" title="表" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('編集後');
    fireEvent.click(screen.getByRole('button', { name: '破棄' }));
    expect(screen.queryByTestId('copilot-proposal')).toBeNull();
  });
  it('案なしは文字で示される', () => {
    useReviewStore.getState().finish(['table'], {});
    wrap(<CopilotProposal componentKey="table" title="表" />);
    expect(screen.getByText('案なし')).toBeTruthy();
  });
  it('「反映」「破棄」は名前を持つボタンで、反映の部品があれば反映を呼ぶ（キーボードの Enter・Space はボタンの標準の動作）', async () => {
    useReviewStore.getState().finish(['memo'], { memo: '案' });
    let got = '';
    const off = registerReflector('memo', (t) => { got = t; });
    wrap(<CopilotProposal componentKey="memo" title="メモ" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(got).toBe('案');
    expect(screen.getByRole('button', { name: '破棄' }).tagName).toBe('BUTTON');
    off();
  });
  it('実行の開始・完了・失敗は状態のメッセージとして store に出る', () => {
    const st = useReviewStore.getState();
    st.start();
    expect(useReviewStore.getState().message).toContain('実行');
    st.finish(['a'], { a: 'x' });
    expect(useReviewStore.getState().message).toContain('完了');
    st.fail('理由');
    expect(useReviewStore.getState().message).toContain('失敗');
  });
  it('送信前の確認は、答えるまで待ち、取り消しは false', async () => {
    const p = askSend([{ id: 'a', label: 'A', data: 'x' }]);
    expect(useReviewStore.getState().confirm?.targets.length).toBe(1);
    answerSend(false);
    expect(await p).toBe(false);
    expect(useReviewStore.getState().confirm).toBeNull();
  });
});
