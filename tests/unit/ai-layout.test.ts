import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAnalyses, useAnalyses } from '../../src/store/analyses';
import { resetProjects, useProjects } from '../../src/store/projects';
import { restore, startPersistence } from '../../src/store/persist';
import { requestDraft, NOT_ALLOWED_MESSAGE, AI_UNAVAILABLE_MESSAGE } from '../../src/projects/aiDraft';
import { askAi, type AiResult } from '../../src/ai/client';
import {
  ANALYSIS_SCREEN, DEFAULT_LAYOUT, LAYOUT_KEY, MOVE_STEP, parseLayouts, resetAnalysisLayout, startLayoutPersistence, useAnalysisLayout,
} from '../../src/store/analysisLayout';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

beforeEach(() => { resetProjects(); resetAnalyses(); resetAnalysisLayout(); });

function setup() {
  const p = useProjects.getState();
  const c = p.addCompany('A社'); if (!c.ok) throw new Error();
  const pr = p.addProject(c.id, '案件A'); if (!pr.ok) throw new Error();
  useAnalyses.getState().start(pr.id, 'swot');
  return { company: c.id, project: pr.id, analysis: useAnalyses.getState().byProject[pr.id]! };
}
const okAsk = vi.fn(async (): Promise<AiResult> => ({ answer: '下書きの本文', sourceIds: [], mode: 'mock', sent: '', transmitted: false }));

describe('FR-140 AI 下書き', () => {
  beforeEach(() => okAsk.mockClear());

  // FR-140 AC-219: 企業の既定は許可なし。許可がなければ送信しない
  it('FR-140 AC-219 既定の企業では AI に送信せず、許可の案内を返す', async () => {
    const { company, analysis } = setup();
    expect(useProjects.getState().companies.find((c) => c.id === company)?.aiAllowed).toBeFalsy();
    const r = await requestDraft(undefined, analysis, okAsk);
    expect(r).toEqual({ status: 'not-allowed', message: NOT_ALLOWED_MESSAGE });
    expect(okAsk).not.toHaveBeenCalled();
  });

  // FR-140 AC-219: 許可した企業だけ依頼できる。他の企業には波及しない
  it('FR-140 AC-219 許可した企業の Project だけで依頼できる', async () => {
    const { company, analysis } = setup();
    const other = useProjects.getState().addCompany('B社'); if (!other.ok) throw new Error();
    useProjects.getState().setAiAllowed(company, true);
    const cs = useProjects.getState().companies;
    expect(cs.find((c) => c.id === company)?.aiAllowed).toBe(true);
    expect(cs.find((c) => c.id === other.id)?.aiAllowed).toBeFalsy();
    const r = await requestDraft(cs.find((c) => c.id === company)?.aiAllowed, analysis, okAsk);
    expect(r).toMatchObject({ status: 'draft', text: '下書きの本文' });
    expect(okAsk).toHaveBeenCalledTimes(1);
  });

  // FR-140 AC-212: 採用するまで分析に反映されない。採用で反映、却下は何も変えない
  it('FR-140 AC-212 下書きは採用するまで分析に反映されない', async () => {
    const { project, analysis } = setup();
    const r = await requestDraft(true, analysis, okAsk);
    expect(r.status).toBe('draft');
    expect(useAnalyses.getState().byProject[project]?.aiNote).toBeUndefined();
    useAnalyses.getState().setAiNote(project, r.status === 'draft' ? r.text : undefined);
    expect(useAnalyses.getState().byProject[project]?.aiNote).toBe('下書きの本文');
  });

  // FR-140 AC-213: AI が使えないときはエラーを返し、手動入力は引き続きできる
  it('FR-140 AC-213 AI が失敗してもエラーを返し、手動入力は続けられる', async () => {
    const { project, analysis } = setup();
    const r = await requestDraft(true, analysis, async () => { throw new Error('down'); });
    expect(r).toEqual({ status: 'error', message: AI_UNAVAILABLE_MESSAGE });
    expect(useAnalyses.getState().setParam(project, Object.keys(analysis.params)[0]!, 'score', '7')).toEqual({ ok: true });
  });

  // FR-140 AC-219: 実接続を有効にしていないときは src/ai がモックで、何も送信しない
  it('FR-140 AC-219 既存の AI クライアントは実接続の有効化がなければ送信しない', async () => {
    const fetchFn = vi.fn();
    const { analysis } = setup();
    const r = await requestDraft(true, analysis, (prompt) => askAi({ kind: 'recommend', packId: 'x', prompt }, { realEnabled: false, relayUrl: 'http://localhost:1', fetchFn }));
    expect(r).toMatchObject({ status: 'draft', mock: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // FR-140 AC-219: 許可は企業ごとに端末内へ保存・復元される
  it('FR-140 AC-219 企業の許可と採用した下書きが保存・復元される', () => {
    const { company, project } = setup();
    useProjects.getState().setAiAllowed(company, true);
    useAnalyses.getState().setAiNote(project, '採用');
    const st = new MemoryStorage();
    const off = startPersistence(st); useAnalyses.getState().setAiNote(project, '採用'); off();
    resetProjects(); resetAnalyses();
    expect(restore(st)).toBe(true);
    expect(useProjects.getState().companies[0]?.aiAllowed).toBe(true);
    expect(useAnalyses.getState().byProject[project]?.aiNote).toBe('採用');
  });
});

describe('NFR-UX-006 分析画面のレイアウト', () => {
  // NFR-UX-006 AC-214: 画面ごとに保存・復元し、既定に戻せる
  it('NFR-UX-006 AC-214 変更を端末内に保存して復元し、既定に戻せる', () => {
    const st = new MemoryStorage();
    const off = startLayoutPersistence(st);
    useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, -250, 150);
    off();
    const restored = parseLayouts(st.getItem(LAYOUT_KEY));
    expect(restored[ANALYSIS_SCREEN]).toEqual({ dx: -250, dy: 150, dw: 0 });
    useAnalysisLayout.getState().reset(ANALYSIS_SCREEN);
    expect(useAnalysisLayout.getState().get(ANALYSIS_SCREEN)).toEqual(DEFAULT_LAYOUT);
  });

  // NFR-UX-006 AC-214: 壊れた保存値は既定として扱い、範囲に収める
  it('NFR-UX-006 AC-214 壊れた保存値は無視し、範囲外は範囲に収める', () => {
    expect(parseLayouts('{oops')).toEqual({});
    expect(parseLayouts(JSON.stringify({ analysis: { dx: 'a', dy: 0, dw: 0 } }))).toEqual({});
    expect(parseLayouts(JSON.stringify({ analysis: { dx: 99999, dy: 0, dw: 0 } })).analysis?.dx).toBe(2000);
  });

  // NFR-UX-006 AC-214: レイアウト変更は入力値を変えない
  it('NFR-UX-006 AC-214 レイアウトを変えても分析の入力値・選択・絞り込みは変わらない', () => {
    const { project } = setup();
    useAnalyses.getState().setFilter(project, 'a');
    const before = JSON.stringify(useAnalyses.getState().byProject[project]);
    useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, 10, 10);
    useAnalysisLayout.getState().reset(ANALYSIS_SCREEN);
    expect(JSON.stringify(useAnalyses.getState().byProject[project])).toBe(before);
  });

  // NFR-UX-006 AC-215: ドラッグなしの移動・大きさの変更（メニュー・キーボード・パレットが呼ぶ操作）
  it('NFR-UX-006 AC-215 ステップ移動と大きさの変更ができる', () => {
    const L = useAnalysisLayout.getState();
    L.moveBy(ANALYSIS_SCREEN, MOVE_STEP, -MOVE_STEP);
    L.resizeBy(ANALYSIS_SCREEN, MOVE_STEP);
    expect(useAnalysisLayout.getState().get(ANALYSIS_SCREEN)).toEqual({ dx: MOVE_STEP, dy: -MOVE_STEP, dw: MOVE_STEP });
  });
});
