// FR-219 種別「人」を含む顧客パックの外部送信・エクスポート前の確認の、結合・単体テスト。
// FR-219 AC-511 AC-512: アプリの AI 呼び出し（実接続）の確認と、パイプラインの出力（対話の確認なし）
// FR-219 AC-513: エクスポート（FR-054 の出力）の確認
// AC-514（画面の通し）は System Test E2E-316。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askAiWithPersonConfirm, gatePersonConfirm, resetPersonConfirmMemory, usePersonConfirmUi, countPersons, type PersonConfirmRequest, type PersonDecision, type PersonPackLike } from '../../src/ai/personConfirm';
import { consentKeyOf, type ConsentRecord } from '../../src/ai/consent';
import { useConsentStore } from '../../src/ai/useConsent';
import { BrandProfileSchema, DATA_SCHEMAS, type PackData } from '../../src/schema';
import { usePackStore } from '../../src/store/pack';
import { useExportUi } from '../../src/export/ui';
import { CONSENT_FILE } from '../../scripts/pipeline/consent';
import { runPipeline } from '../../scripts/pipeline/pipeline';
import { sampleResearcher, type Researcher } from '../../scripts/pipeline/research';
import { defaultPaths, type Inputs } from '../../scripts/pipeline/common';

const delivered = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/export/deliver', async (orig) => {
  const m = await orig<typeof import('../../src/export/deliver')>();
  return { ...m, deliver: async (name: string) => { delivered.calls++; return { ok: true as const, name, method: 'download' as const }; } };
});

function readMono(): { data: PackData; brand: unknown } {
  const dir = path.resolve(__dirname, '../../examples', 'mono', 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'data', `${name}.json`), 'utf8')));
  const brand = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'brand', 'brand-profile.json'), 'utf8')));
  return { data: out as PackData, brand };
}
const mono = readMono();
const personCount = countPersons(mono.data as unknown as PersonPackLike);
const key = consentKeyOf(mono.data.customer.name, mono.data.customer.projectName);
const CONSENT: ConsentRecord = { granted: true, confirmedOn: '2026-10-19', note: '顧客側の担当役員（口頭）' };

/** 確認の呼び出しを記録し、決めた答えを返す */
function confirmer(answer: PersonDecision) {
  const seen: PersonConfirmRequest[] = [];
  return { seen, confirm: async (r: PersonConfirmRequest) => { seen.push(r); return answer; } };
}

function withoutPersons(): PersonPackLike {
  const d = JSON.parse(JSON.stringify(mono.data)) as PersonPackLike;
  d.entities.entities = d.entities.entities.filter((e) => e.kind !== 'person');
  return d;
}

describe('FR-219 AC-511 AC-512 アプリの AI 呼び出し（実接続）の確認', () => {
  const data = mono.data as unknown as PersonPackLike;
  let relayCalls = 0;
  const env = (realEnabled = true) => ({
    relayUrl: 'http://localhost:5000', realEnabled,
    fetchFn: async () => { relayCalls++; return { ok: true, status: 200, json: async () => ({ answer: 'ok', sourceIds: [] }) }; },
  });
  const req = { kind: 'chat' as const, packId: 'x', prompt: '質問' };
  beforeEach(() => { relayCalls = 0; });

  it('前提: お手本パック mono は種別「人」を含む', () => { expect(personCount).toBeGreaterThan(0); });

  it('了承の記録がない: 確認に範囲・件数・了承の記録なしが渡り、続行できず、送信は 0 回。確認に個人名・連絡先の値は含まれない', async () => {
    const memory = new Set<string>();
    const c = confirmer('proceed'); // 続行を選んでも、了承がなければ送れない
    await expect(askAiWithPersonConfirm(req, env(), { data, consent: undefined, confirm: c.confirm, memory })).rejects.toThrow('了承の記録がない');
    expect(relayCalls).toBe(0);
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0]).toMatchObject({ destination: 'ai', personCount, confirmedOn: undefined });
    expect(c.seen[0]!.scopeLabel).toContain('顧客パック');
    const text = JSON.stringify(c.seen[0]);
    for (const e of mono.data.entities.entities.filter((x: any) => x.kind === 'person') as any[]) {
      for (const v of [e.name, e.label, e.title]) if (typeof v === 'string' && v.length >= 2) expect(text).not.toContain(v);
    }
    // 同じ操作を続けても、了承がないあいだは毎回確認が出て、続行されない
    await expect(askAiWithPersonConfirm(req, env(), { data, consent: undefined, confirm: c.confirm, memory })).rejects.toThrow();
    expect(c.seen).toHaveLength(2);
    expect(relayCalls).toBe(0);
  });

  it('了承の記録がある: 確認に確認日が渡り、中止なら SDK（中継）の呼び出しが 0 回、続行なら行われる', async () => {
    const cancel = confirmer('cancel');
    await expect(askAiWithPersonConfirm(req, env(), { data, consent: CONSENT, confirm: cancel.confirm, memory: new Set() })).rejects.toThrow('中止');
    expect(relayCalls).toBe(0);
    expect(cancel.seen[0]).toMatchObject({ personCount, confirmedOn: '2026-10-19' });
    const go = confirmer('proceed');
    const r = await askAiWithPersonConfirm(req, env(), { data, consent: CONSENT, confirm: go.confirm, memory: new Set() });
    expect(r.transmitted).toBe(true);
    expect(relayCalls).toBe(1);
  });

  it('頻度: 中止は引き継がない。続行は、内容・了承の記録が変わらない間は確認を繰り返さず、変わると再び出る', async () => {
    const memory = new Set<string>();
    const cancel = confirmer('cancel');
    await expect(askAiWithPersonConfirm(req, env(), { data, consent: CONSENT, confirm: cancel.confirm, memory })).rejects.toThrow();
    const go = confirmer('proceed');
    await askAiWithPersonConfirm(req, env(), { data, consent: CONSENT, confirm: go.confirm, memory });
    await askAiWithPersonConfirm(req, env(), { data, consent: CONSENT, confirm: go.confirm, memory });
    expect(go.seen).toHaveLength(1); // 2 回目は確認なし
    expect(relayCalls).toBe(2);
    // 了承の記録が変わる（確認日・メモ）と再び出る
    await askAiWithPersonConfirm(req, env(), { data, consent: { ...CONSENT, confirmedOn: '2026-10-20' }, confirm: go.confirm, memory });
    expect(go.seen).toHaveLength(2);
    // 顧客パックの内容が変わると再び出る
    const changed = JSON.parse(JSON.stringify(data)) as PersonPackLike;
    (changed.entities.entities[0] as { label?: string }).label = '変更後の名前';
    await askAiWithPersonConfirm(req, env(), { data: changed, consent: CONSENT, confirm: go.confirm, memory });
    expect(go.seen).toHaveLength(3);
  });

  it('種別「人」がない顧客パックでは確認が出ない（FR-181 のゲートだけ）。モックのままなら確認は出ず、送信もない', async () => {
    const c = confirmer('cancel');
    const r = await askAiWithPersonConfirm(req, env(), { data: withoutPersons(), consent: CONSENT, confirm: c.confirm, memory: new Set() });
    expect(r.transmitted).toBe(true);
    expect(c.seen).toHaveLength(0);
    const m = await askAiWithPersonConfirm(req, env(false), { data, consent: undefined, confirm: c.confirm, memory: new Set() });
    expect(m.mode).toBe('mock');
    expect(c.seen).toHaveLength(0);
    expect(relayCalls).toBe(1);
  });
});

describe('FR-219 AC-512 パイプラインの実調査（差し替え部品）: 対話の確認は出ず、件数と確認日を出力して続行', () => {
  let root: string;
  const input = (customer: string): Inputs => ({ customer, projectName: 'P', intensity: 'Showcase', materials: [] });
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'person-confirm-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const paths = () => defaultPaths({ workspace: path.join(root, 'ws'), repoRoot: root });
  const seedPack = (customer: string, people: number) => {
    const dir = path.join(paths().workspace, customer, 'public', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'entities.json'), JSON.stringify({ entities: Array.from({ length: people }, (_, i) => ({ id: `p${i}`, kind: 'person', name: `秘密の人名${i}` })) }));
  };
  const writeConsent = (customer: string) => {
    fs.mkdirSync(paths().workspace, { recursive: true });
    fs.writeFileSync(path.join(paths().workspace, CONSENT_FILE), JSON.stringify({ records: { [consentKeyOf(customer, 'P')]: { granted: true, confirmedOn: '2026-10-15', note: '顧客側の担当役員（口頭）' } } }));
  };
  const spy = () => {
    const sent = { n: 0 };
    const researcher: Researcher = {
      researchCustomer: async (i) => { sent.n++; return sampleResearcher.researchCustomer(i); },
      researchBrand: async (i) => { sent.n++; return sampleResearcher.researchBrand(i); },
    };
    return { sent, researcher };
  };

  it('種別「人」を含み了承の記録がある案件: 出力に件数と確認日が示され、続行する（人名の値は出さない）', async () => {
    writeConsent('甲社'); seedPack('甲社', 3);
    const { sent, researcher } = spy();
    const logs: string[] = [];
    await runPipeline('research', input('甲社'), { paths: paths(), researcher, log: (l) => logs.push(l) });
    const out = logs.join('\n');
    expect(out).toMatch(/種別「人」のエンティティ: 3 件/);
    expect(out).toContain('2026-10-15');
    expect(out).not.toContain('秘密の人名');
    expect(sent.n).toBe(2);
  });

  it('了承の記録がなければ送信 0 回（件数の行は出さず、FR-181 のゲートだけ）。種別「人」がなければ行は出ない', async () => {
    seedPack('乙社', 2);
    const a = spy();
    const logsA: string[] = [];
    await runPipeline('research', input('乙社'), { paths: paths(), researcher: a.researcher, log: (l) => logsA.push(l) });
    expect(a.sent.n).toBe(0);
    expect(logsA.join('\n')).not.toContain('種別「人」のエンティティ');
    writeConsent('丙社'); seedPack('丙社', 0);
    const b = spy();
    const logsB: string[] = [];
    await runPipeline('research', input('丙社'), { paths: paths(), researcher: b.researcher, log: (l) => logsB.push(l) });
    expect(b.sent.n).toBe(2);
    expect(logsB.join('\n')).not.toContain('種別「人」のエンティティ');
  });
});

describe('FR-219 AC-513 エクスポート（FR-054 の出力）の確認', () => {
  beforeEach(() => {
    delivered.calls = 0;
    resetPersonConfirmMemory();
    useConsentStore.setState({ records: {} });
    useExportUi.setState({ notice: null });
    usePackStore.setState({
      original: mono.data,
      state: { status: 'ready', warnings: [], pack: { data: mono.data, brand: mono.brand, issues: [], disabledIds: [], isExample: true } as never },
    });
  });

  /** 確認の画面（usePersonConfirmUi）に出た内容を記録し、決めた答えを返す */
  function answerWith(d: PersonDecision) {
    const seen: PersonConfirmRequest[] = [];
    const un = usePersonConfirmUi.subscribe((s) => { if (s.request) { seen.push(s.request); queueMicrotask(() => usePersonConfirmUi.getState().answer(d)); } });
    return { seen, stop: un };
  }

  it('了承の記録がない: 確認が出て（範囲・件数・記録なし）、続行を選んでも出力されない（ファイル 0 件）。理由が示される', async () => {
    const { quickSaveAll } = await import('../../src/export/ExportDialog');
    const a = answerWith('proceed');
    await quickSaveAll();
    a.stop();
    expect(a.seen).toHaveLength(1);
    expect(a.seen[0]).toMatchObject({ destination: 'export', personCount, confirmedOn: undefined });
    expect(delivered.calls).toBe(0);
    expect(useExportUi.getState().notice?.lines.join('')).toContain('了承の記録がない');
  });

  it('了承の記録がある: 中止でファイルなし、続行で生成される。続けて出力しても確認は繰り返さない', async () => {
    const { quickSaveAll } = await import('../../src/export/ExportDialog');
    useConsentStore.setState({ records: { [key]: CONSENT } });
    const cancel = answerWith('cancel');
    await quickSaveAll();
    cancel.stop();
    expect(cancel.seen[0]).toMatchObject({ confirmedOn: '2026-10-19', personCount });
    expect(delivered.calls).toBe(0);
    const go = answerWith('proceed');
    await quickSaveAll();
    await quickSaveAll();
    go.stop();
    expect(go.seen).toHaveLength(1);
    expect(delivered.calls).toBe(2);
  });

  it('種別「人」を含まないパックでは確認が出ず、これまでどおり出力される', async () => {
    const { quickSaveAll } = await import('../../src/export/ExportDialog');
    const d = withoutPersons() as unknown as PackData;
    usePackStore.setState({ state: { status: 'ready', warnings: [], pack: { data: d, brand: mono.brand, issues: [], disabledIds: [], isExample: true } as never } });
    const a = answerWith('cancel');
    await quickSaveAll();
    a.stop();
    expect(a.seen).toHaveLength(0);
    expect(delivered.calls).toBe(1);
  });
});

describe('FR-219 gatePersonConfirm の単体', () => {
  it('種別「人」が 0 件なら何も聞かない', async () => {
    const c = confirmer('cancel');
    const r = await gatePersonConfirm({ destination: 'export', scopeLabel: '全体', data: withoutPersons(), consent: undefined, confirm: c.confirm, memory: new Set() });
    expect(r).toEqual({ allowed: true, asked: false });
    expect(c.seen).toHaveLength(0);
  });
});
