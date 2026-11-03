// FR-219 種別「人」を含む顧客パックの外部送信・エクスポート前の確認の、結合・単体テスト。
// FR-219 AC-511 AC-512: アプリの AI 呼び出し（実接続）の確認と、パイプラインの出力（対話の確認なし）
// FR-219 AC-513: エクスポート（FR-054 の出力）の確認
// AC-514（画面の通し）は System Test E2E-316。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askAiWithPersonConfirm, gatePersonConfirm, resetPersonConfirmMemory, usePersonConfirmUi, countPersons, type PersonConfirmRequest, type PersonDecision, type PersonPackLike } from '../../src/ai/personConfirm';
import { BrandProfileSchema, DATA_SCHEMAS, type PackData } from '../../src/schema';
import { usePackStore } from '../../src/store/pack';
import { useExportUi } from '../../src/export/ui';
import { runPipeline } from '../../scripts/pipeline/pipeline';
import { main } from '../../scripts/pipeline/cli';
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

  it('確認に範囲・件数が渡り、中止なら送信は 0 回。確認に個人名・連絡先の値は含まれない（顧客の了承の記録は条件にしない）', async () => {
    const memory = new Set<string>();
    const c = confirmer('cancel');
    await expect(askAiWithPersonConfirm(req, env(), { data, confirm: c.confirm, memory })).rejects.toThrow('中止');
    expect(relayCalls).toBe(0);
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0]).toMatchObject({ destination: 'ai', personCount });
    expect(c.seen[0]).not.toHaveProperty('confirmedOn');
    expect(c.seen[0]!.scopeLabel).toContain('顧客パック');
    const text = JSON.stringify(c.seen[0]);
    for (const e of mono.data.entities.entities.filter((x: any) => x.kind === 'person') as any[]) {
      for (const v of [e.name, e.label, e.title]) if (typeof v === 'string' && v.length >= 2) expect(text).not.toContain(v);
    }
    // 中止は引き継がず、同じ操作を続けると毎回確認が出る
    await expect(askAiWithPersonConfirm(req, env(), { data, confirm: c.confirm, memory })).rejects.toThrow();
    expect(c.seen).toHaveLength(2);
    expect(relayCalls).toBe(0);
  });

  it('中止なら SDK（中継）の呼び出しが 0 回、続行なら行われる', async () => {
    const cancel = confirmer('cancel');
    await expect(askAiWithPersonConfirm(req, env(), { data, confirm: cancel.confirm, memory: new Set() })).rejects.toThrow('中止');
    expect(relayCalls).toBe(0);
    expect(cancel.seen[0]).toMatchObject({ personCount });
    const go = confirmer('proceed');
    const r = await askAiWithPersonConfirm(req, env(), { data, confirm: go.confirm, memory: new Set() });
    expect(r.transmitted).toBe(true);
    expect(relayCalls).toBe(1);
  });

  it('頻度: 中止は引き継がない。続行は、内容が変わらない間は確認を繰り返さず、変わると再び出る', async () => {
    const memory = new Set<string>();
    const cancel = confirmer('cancel');
    await expect(askAiWithPersonConfirm(req, env(), { data, confirm: cancel.confirm, memory })).rejects.toThrow();
    const go = confirmer('proceed');
    await askAiWithPersonConfirm(req, env(), { data, confirm: go.confirm, memory });
    await askAiWithPersonConfirm(req, env(), { data, confirm: go.confirm, memory });
    expect(go.seen).toHaveLength(1); // 2 回目は確認なし
    expect(relayCalls).toBe(2);
    // 顧客パックの内容が変わると再び出る
    const changed = JSON.parse(JSON.stringify(data)) as PersonPackLike;
    (changed.entities.entities[0] as { label?: string }).label = '変更後の名前';
    await askAiWithPersonConfirm(req, env(), { data: changed, confirm: go.confirm, memory });
    expect(go.seen).toHaveLength(2);
  });

  it('種別「人」がない顧客パックでは確認が出ない。モックのままなら確認は出ず、送信もない', async () => {
    const c = confirmer('cancel');
    const r = await askAiWithPersonConfirm(req, env(), { data: withoutPersons(), confirm: c.confirm, memory: new Set() });
    expect(r.transmitted).toBe(true);
    expect(c.seen).toHaveLength(0);
    const m = await askAiWithPersonConfirm(req, env(false), { data, confirm: c.confirm, memory: new Set() });
    expect(m.mode).toBe('mock');
    expect(c.seen).toHaveLength(0);
    expect(relayCalls).toBe(1);
  });

  // FR-219 AC-511（A-59: 確認は利用者の送信の操作のたび）。要約の自動更新は確認の画面を出さず、未確認なら送らない
  it('自動の呼び出し（exec-summary）は確認の画面を出さず、未確認の内容は送信 0 回で失敗する', async () => {
    usePersonConfirmUi.setState({ request: null });
    await expect(askAiWithPersonConfirm({ ...req, kind: 'exec-summary' }, env(), { data, memory: new Set() })).rejects.toThrow();
    expect(usePersonConfirmUi.getState().request).toBeNull();
    expect(relayCalls).toBe(0);
  });
});

describe('FR-219 AC-512 パイプラインの実調査（差し替え部品）: `--live` で種別「人」を含む案件は件数を示す確認が出る', () => {
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
  const spy = () => {
    const sent = { n: 0 };
    const researcher: Researcher = {
      researchCustomer: async (i) => { sent.n++; return sampleResearcher.researchCustomer(i); },
      researchBrand: async (i) => { sent.n++; return sampleResearcher.researchBrand(i); },
    };
    return { sent, researcher };
  };

  it('AC-512 種別「人」を含む案件: 件数を示す確認が出て（人名の値は出さない）、続行で送信される', async () => {
    seedPack('甲社', 3);
    const { sent, researcher } = spy();
    const logs: string[] = [];
    const asked: number[] = [];
    await runPipeline('research', input('甲社'), {
      paths: paths(), researcher, live: true, log: (l) => logs.push(l),
      confirmPerson: async (i) => { asked.push(i.personCount); return true; },
    });
    const out = logs.join('\n');
    expect(asked).toEqual([3]);
    expect(out).toMatch(/種別「人」のエンティティ: 3 件/);
    expect(out).not.toContain('秘密の人名');
    expect(sent.n).toBe(2);
  });

  it('AC-512 中止なら送信 0 回。未回答（確認の差し替えなし）でも送信 0 回', async () => {
    seedPack('乙社', 2);
    const a = spy();
    await runPipeline('research', input('乙社'), { paths: paths(), researcher: a.researcher, live: true, confirmPerson: async () => false, log: () => {} });
    expect(a.sent.n).toBe(0);
    const b = spy();
    const logs: string[] = [];
    await runPipeline('research', input('乙社'), { paths: paths(), researcher: b.researcher, live: true, log: (l) => logs.push(l) });
    expect(b.sent.n).toBe(0);
    expect(logs.join('\n')).toContain('中止または未回答');
  });

  it('AC-512 種別「人」を含まない案件では確認が出ず、送信される', async () => {
    seedPack('丙社', 0);
    const { sent, researcher } = spy();
    let asked = 0;
    await runPipeline('research', input('丙社'), { paths: paths(), researcher, live: true, confirmPerson: async () => { asked++; return false; }, log: () => {} });
    expect(asked).toBe(0);
    expect(sent.n).toBe(2);
  });

  it('AC-512 コマンド（--live）: 対話の y/N の確認で、既定（空の答え）は中止、y で続行', async () => {
    const workspace = path.join(root, 'cli-ws');
    const template = path.join(root, 'template');
    fs.mkdirSync(template, { recursive: true });
    const run = async (answer: string, customer: string) => {
      const { sent, researcher } = spy();
      const logs: string[] = [];
      const questions: string[] = [];
      const p = defaultPaths({ workspace, repoRoot: root });
      const dir = path.join(p.workspace, customer, 'public', 'data');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'entities.json'), JSON.stringify({ entities: [{ id: 'p1', kind: 'person', name: '秘密' }] }));
      const code = await main(['research', '--customer', customer, '--project', 'P', '--live', '--workspace', workspace, '--template', template], {
        paths: { repoRoot: root }, researcher, log: (l) => logs.push(l), ask: async (q) => { questions.push(q); return answer; },
      });
      return { code, sent, logs, questions };
    };
    const no = await run('', '丁社');
    expect(no.code).toBe(0);
    expect(no.sent.n).toBe(0);
    expect(no.questions.some((q) => q.includes('種別「人」のエンティティ: 1 件'))).toBe(true);
    const yes = await run('y', '戊社');
    expect(yes.sent.n).toBe(2);
  });
});

describe('FR-121 AC-823 `--live` がなければ外部への送信は 0 回（顧客の了承の記録は結果に影響しない）', () => {
  let root: string;
  const input: Inputs = { customer: '己社', projectName: 'P', intensity: 'Showcase', materials: [] };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const paths = () => defaultPaths({ workspace: path.join(root, 'ws'), repoRoot: root });
  const spies = () => {
    const sent = { n: 0 };
    const researcher: Researcher = {
      researchCustomer: async (i) => { sent.n++; return sampleResearcher.researchCustomer(i); },
      researchBrand: async (i) => { sent.n++; return sampleResearcher.researchBrand(i); },
    };
    return { sent, researcher };
  };

  it('--live なし: 送信 0 回で、実調査をしていない旨（--live で有効化できる旨）を出力し、サンプルで成功する', async () => {
    const { sent, researcher } = spies();
    const logs: string[] = [];
    const r = await runPipeline('research', input, { paths: paths(), researcher, log: (l) => logs.push(l) });
    expect(r.stages).toEqual(['research-customer', 'research-brand']);
    expect(sent.n).toBe(0);
    expect(logs.join('\n')).toContain('実調査をしていません');
    expect(logs.join('\n')).toContain('--live');
    expect(logs.join('\n')).toContain('情報源=推定（サンプル）');
  });

  it('--live あり: 差し替え部品が呼ばれる（了承の記録の有無は関係しない）', async () => {
    const { sent, researcher } = spies();
    await runPipeline('research', input, { paths: paths(), researcher, live: true, log: () => {} });
    expect(sent.n).toBe(2);
  });
});

describe('FR-219 AC-513 エクスポート（FR-054 の出力）の確認', () => {
  beforeEach(() => {
    delivered.calls = 0;
    resetPersonConfirmMemory();
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

  it('確認が出て（範囲・件数）、中止でファイルなし、続行で生成される。続けて出力しても確認は繰り返さない', async () => {
    const { quickSaveAll } = await import('../../src/export/ExportDialog');
    const cancel = answerWith('cancel');
    await quickSaveAll();
    cancel.stop();
    expect(cancel.seen[0]).toMatchObject({ destination: 'export', personCount });
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
    const r = await gatePersonConfirm({ destination: 'export', scopeLabel: '全体', data: withoutPersons(), confirm: c.confirm, memory: new Set() });
    expect(r).toEqual({ allowed: true, asked: false });
    expect(c.seen).toHaveLength(0);
  });
});
