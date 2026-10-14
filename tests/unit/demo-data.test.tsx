// @vitest-environment jsdom
// FR-180（AC-364・AC-365・AC-366）と FR-179（AC-362・AC-363 のためのデータ・関数）の単体・結合テスト。
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DATA_SCHEMAS, validatePack, type PackData, type PackFiles } from '../../src/schema';
import { UseCaseScreen, resetPlayback } from '../../src/screens/UseCaseScreen';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { usePackStore } from '../../src/store/pack';
import {
  DEMO_PERSONAS, MIN_USECASES_PER_PERSONA, countByPersona, demoUseCases, kpisForSolution, personasBelowMinimum, useCasesForSolution,
} from '../../src/usecase/demo';

const KINDS = ['mono', 'koto'] as const;
const STORY_TOP = 3; // PARAM-062

function loadFiles(kind: (typeof KINDS)[number]): PackFiles {
  const root = path.resolve(__dirname, '../../examples', kind, 'public');
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(DATA_SCHEMAS)) out[name] = JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
  out.brandProfile = JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand-profile.json'), 'utf8'));
  return out as PackFiles;
}
function loadPack(kind: (typeof KINDS)[number]): PackData {
  const files = loadFiles(kind);
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(files[name as keyof PackFiles]);
  return out as PackData;
}

beforeEach(() => {
  resetProjects(); useUseCases.getState().reset(); resetPlayback();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

describe.each(KINDS)('FR-180 AC-364 デモ（%s）のユースケース（単体）', (kind) => {
  const pack = loadPack(kind);
  const items = demoUseCases(pack.customer, pack.issues.solutions);

  // FR-180 AC-364
  it('FR-180 AC-364 ペルソナごとに 2 件以上（PARAM-060）あり、必須の項目がすべて揃う', () => {
    expect(MIN_USECASES_PER_PERSONA).toBe(2);
    expect(personasBelowMinimum(items)).toEqual([]);
    const c = countByPersona(items);
    for (const p of DEMO_PERSONAS) expect(c[p], p).toBeGreaterThanOrEqual(2);
    for (const u of items) {
      expect(u.name.trim().length, u.id).toBeGreaterThan(0);
      expect(u.summary.trim().length, u.id).toBeGreaterThan(0);
      expect(u.effect.trim().length, u.id).toBeGreaterThan(0);
      expect(u.steps.length, u.id).toBeGreaterThan(0);
      expect(u.solutionTitle, `${u.id} は実在する解決策に結び付く`).toBeTruthy();
      expect(u.kpiNames.length, u.id).toBeGreaterThan(0);
    }
  });

  // FR-180 AC-364
  it('FR-180 AC-364 ユースケースの KPI は okr に実在する KPI で、その KPI は結び付く解決策に効く（FR-179 の材料）', () => {
    const kpis = new Set((pack.customer.okr?.objectives ?? []).flatMap((o) => o.keyResults.map((k) => k.kpi.name)));
    for (const u of items) for (const n of u.kpiNames) expect(kpis.has(n), `${u.id}: ${n}`).toBe(true);
    for (const u of items) {
      const linked = kpisForSolution(pack.customer, u.solutionId).map((k) => k.kpi);
      expect(u.kpiNames.some((n) => linked.includes(n)), `${u.id} の KPI の少なくとも 1 つが解決策 ${u.solutionId} に結び付く`).toBe(true);
    }
  });

  // FR-180 AC-364 / FR-179
  it('FR-180 AC-364 優先順位の上位 3 件（PARAM-062）の解決策のそれぞれに、KPI/OKR とユースケースがあり、ペルソナ（経営層・事業部門・IT・現場）の課題が揃う', () => {
    const sols = pack.issues.solutions;
    expect(sols.length).toBeGreaterThanOrEqual(STORY_TOP);
    for (const s of sols) {
      expect(kpisForSolution(pack.customer, s.id).length, `${s.id} の KPI/OKR`).toBeGreaterThan(0);
      expect(useCasesForSolution(items, s.id).length, `${s.id} のユースケース`).toBeGreaterThan(0);
      const issue = pack.issues.issues.find((i) => i.id === s.issueId);
      const ev = issue?.evaluation;
      for (const k of ['priority', 'cost', 'roi', 'feasibility'] as const) expect(ev?.[k], `${s.id} の ${k}`).toBeTruthy();
    }
    const personas = new Set(pack.issues.issues.flatMap((i) => i.personas ?? []));
    for (const p of DEMO_PERSONAS) expect(personas.has(p), `課題の対象ペルソナに ${p}`).toBe(true);
  });
});

describe.each(KINDS)('FR-180 AC-366 デモ（%s）のスキーマ検証と架空の注記', (kind) => {
  // FR-180 AC-366
  it('FR-180 AC-366 顧客パックのスキーマ検証（verify:pack 相当）にエラー 0 件で通る', () => {
    expect(validatePack(loadFiles(kind)).errors).toEqual([]);
  });
  // FR-180 AC-366
  it('FR-180 AC-366 架空の注記と、企業名が架空を示す表記を持つ', () => {
    const c = loadPack(kind).customer;
    expect(c.fictionalNote).toMatch(/架空/);
    expect(c.name).toMatch(/架空/);
    for (const u of c.useCases ?? []) expect(`${u.name}${u.summary}`).not.toMatch(/株式会社|有限会社/);
  });
  // FR-180 AC-366（異常系: ユースケースが解決策を参照しない／ペルソナ不正はエラー）
  it('FR-180 AC-366 異常系: 存在しない解決策・ペルソナ・空の手順はスキーマ検証がエラーにする', () => {
    const bad = (mut: (u: Record<string, unknown>) => void) => {
      const f = structuredClone(loadFiles(kind)) as unknown as { customer: { useCases: Array<Record<string, unknown>> } };
      mut(f.customer.useCases[0]!);
      return validatePack(f as unknown as PackFiles).errors.length;
    };
    expect(bad((u) => { u.solutionId = 'sol-none'; })).toBeGreaterThan(0);
    expect(bad((u) => { u.persona = '社長'; })).toBeGreaterThan(0);
    expect(bad((u) => { u.steps = []; })).toBeGreaterThan(0);
  });
});

describe('FR-180 AC-365 デモのユースケースは実際の Project に現れない（結合）', () => {
  const ui = () => render(<FluentProvider theme={webLightTheme}><UseCaseScreen /></FluentProvider>);
  const setPack = (kind: (typeof KINDS)[number]) => usePackStore.setState({ state: { status: 'ready', pack: { data: loadPack(kind) } as never, warnings: [] } });

  // FR-180 AC-365
  it('FR-180 AC-365 デモでは一覧に出て、架空の注記が示される', () => {
    setPack('mono'); ui();
    const list = screen.getByTestId('usecase-list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByTestId('demo-fictional-note').textContent).toMatch(/架空/);
  });

  // FR-180 AC-365（異常系）
  it('FR-180 AC-365 異常系: 実際の Project を開くと、デモのユースケース・注記は一覧に現れない。デモ側の保存も作られない', () => {
    setPack('mono');
    const c = useProjects.getState().addCompany('X社'); if (!c.ok) throw new Error();
    const p = useProjects.getState().addProject(c.id, 'P1'); if (!p.ok) throw new Error();
    useProjects.getState().open(p.id);
    ui();
    expect(within(screen.getByTestId('usecase-list')).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByTestId('demo-fictional-note')).toBeNull();
    expect(screen.queryByText(/ミズホ|経営会議で計画外停止/)).toBeNull();
    expect(Object.keys(useUseCases.getState().byProject)).toEqual([]);
  });
});
