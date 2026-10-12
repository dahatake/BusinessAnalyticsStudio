import { beforeEach, describe, expect, it } from 'vitest';
import { resetAnalyses, useAnalyses } from '../../src/store/analyses';
import { resetProjects, useProjects } from '../../src/store/projects';
import { restore, startPersistence, STORAGE_KEY } from '../../src/store/persist';
import { useStepper } from '../../src/store/stepper';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const reset = () => { resetProjects(); resetAnalyses(); };
beforeEach(reset);

function build() {
  const p = useProjects.getState();
  const c = p.addCompany('A社'); if (!c.ok) throw new Error();
  const a = p.addProject(c.id, '案件A'); const b = p.addProject(c.id, '案件B');
  if (!a.ok || !b.ok) throw new Error();
  return { c: c.id, a: a.id, b: b.id };
}

describe('FR-137 端末内保存', () => {
  // FR-137 AC-207
  it('AC-207 保存した企業・Project・ステッパーの位置・分析の入力値が、開き直し（状態の初期化）後に復元される', () => {
    const storage = new MemoryStorage();
    const stop = startPersistence(storage);
    const { a } = build();
    useProjects.getState().open(a);
    useStepper.getState().setCurrent(2);
    useAnalyses.getState().start(a, 'swot' as never);
    const factor = Object.keys(useAnalyses.getState().byProject[a]!.params)[0]!;
    expect(useAnalyses.getState().setParam(a, factor, 'score', '7').ok).toBe(true);
    stop();
    reset();
    expect(useProjects.getState().companies).toEqual([]);
    expect(restore(storage)).toBe(true);
    expect(useProjects.getState().companies.map((c) => c.name)).toEqual(['A社']);
    expect(useProjects.getState().projects.map((p) => p.name)).toEqual(['案件A', '案件B']);
    expect(useStepper.getState().current).toBe(2);
    expect(useAnalyses.getState().byProject[a]!.params[factor]!.score).toBe(7);
  });

  // FR-137 AC-207（壊れた保存内容は無視して空で始まる）
  it('AC-207 保存内容が壊れていても空の状態で始まる', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{broken');
    expect(restore(storage)).toBe(false);
    expect(useProjects.getState().companies).toEqual([]);
  });
});

describe('FR-138 Project の切替とデータの分離', () => {
  // FR-138 AC-209
  it('AC-209 Project ごとにステッパーの位置と分析が分かれ、切り替えても混ざらない', () => {
    const { a, b } = build();
    const p = useProjects.getState();
    p.open(a); useStepper.getState().setCurrent(1); useAnalyses.getState().start(a, 'swot' as never);
    p.open(b);
    expect(useStepper.getState().current).toBe(0);
    expect(useAnalyses.getState().byProject[b]).toBeUndefined();
    useStepper.getState().setCurrent(4);
    p.open(a);
    expect(useStepper.getState().current).toBe(1);
    p.open(b);
    expect(useStepper.getState().current).toBe(4);
  });

  // FR-138 AC-210
  it('AC-210 未保存（無効）の入力は Project を切り替えても失われない', () => {
    const { a, b } = build();
    const p = useProjects.getState();
    p.open(a); useAnalyses.getState().start(a, 'swot' as never);
    useAnalyses.getState().setDraft(a, 'x:score', '99');
    p.open(b);
    p.open(a);
    expect(useAnalyses.getState().drafts[a]).toEqual({ 'x:score': '99' });
    useAnalyses.getState().setDraft(a, 'x:score', null);
    expect(useAnalyses.getState().drafts[a]).toEqual({});
  });
});

describe('FR-139 企業・Project の識別子', () => {
  // FR-139 AC-211
  it('AC-211 自システム採番の識別子が重複せず、復元後に採番しても衝突しない。外部の識別子の欄はない', () => {
    const storage = new MemoryStorage();
    const stop = startPersistence(storage);
    build();
    stop(); reset();
    restore(storage);
    const p = useProjects.getState();
    const c2 = p.addCompany('B社'); if (!c2.ok) throw new Error();
    p.addProject(c2.id, '案件X');
    const ids = [...useProjects.getState().companies, ...useProjects.getState().projects].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of useProjects.getState().projects) expect(Object.keys(x).sort()).toEqual(['archived', 'companyId', 'id', 'name']);
  });
});

describe('NFR-SEC-004 端末外に出さない', () => {
  // NFR-SEC-004 AC-218
  it('AC-218 保存先は引数の storage だけで、保存・復元で fetch などの通信を使わない', async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error('通信禁止')); }) as typeof fetch;
    try {
      const storage = new MemoryStorage();
      const stop = startPersistence(storage);
      build(); stop(); reset(); restore(storage);
      expect(calls).toBe(0);
      expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
    } finally { globalThis.fetch = orig; }
  });
});
