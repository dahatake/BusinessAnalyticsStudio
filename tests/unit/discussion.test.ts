// 議論テーマ・議論メモの単体・結合テスト（ストアと Markdown の往復）
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTheme, defaultMemoFileName, parseDueDate, sanitizeFilePart, STATUS_DISPLAY_LABEL, statusOrigin, type Theme,
} from '../../src/discussion/model';
import { buildDiscussionMemo, parseDiscussionMemo } from '../../src/discussion/memo';
import { buildMemoForPack, registerSnapshotSource, restoreFromMemo } from '../../src/discussion/restore';
import { useDiscussionStore } from '../../src/store/discussion';

const KEY = 'テスト株式会社 / 新基幹 Project';
const TARGET = { customerName: 'テスト株式会社', projectName: '新基幹 Project' };
const st = () => useDiscussionStore.getState();
const themes = () => (st().byPack[KEY]?.themes ?? []) as [Theme, ...Theme[]];
const selectedId = () => st().byPack[KEY]?.selectedId;

beforeEach(() => { st().reset(KEY); });

describe('FR-048 議論テーマの選択と管理', () => {
  // FR-048 AC-060
  it('FR-048 AC-060 課題からテーマを作成し、名前を編集し、削除すると一覧がそのとおりに変わる', () => {
    const t = st().createFromIssue(KEY, { id: 'issue-1', title: '在庫の見える化' });
    expect(themes().map((x) => x.title)).toEqual(['在庫の見える化']);
    expect(selectedId()).toBe(t.id);
    expect(st().rename(KEY, t.id, '在庫の可視化')).toBe(true);
    expect(themes()[0].title).toBe('在庫の可視化');
    st().remove(KEY, t.id);
    expect(themes()).toHaveLength(0);
  });

  // FR-048 AC-060
  it('FR-048 AC-060 同じ課題からは重複してテーマを作らず、既存のテーマを選択する', () => {
    const a = st().createFromIssue(KEY, { id: 'issue-1', title: 'A' });
    st().addTheme(KEY, { title: 'B' });
    const again = st().createFromIssue(KEY, { id: 'issue-1', title: 'A' });
    expect(again.id).toBe(a.id);
    expect(themes()).toHaveLength(2);
    expect(selectedId()).toBe(a.id);
  });

  // FR-048 AC-060
  it('FR-048 AC-060 異常系: 空の名前には変更せず false を返す', () => {
    const t = st().addTheme(KEY, { title: '元の名前' });
    expect(st().rename(KEY, t.id, '   ')).toBe(false);
    expect(themes()[0].title).toBe('元の名前');
  });

  // FR-048 AC-060
  it('FR-048 AC-060 削除は元に戻すで元の位置に復元され、やり直しでもう一度削除される', () => {
    const a = st().addTheme(KEY, { title: 'A' });
    const b = st().addTheme(KEY, { title: 'B' });
    st().addTheme(KEY, { title: 'C' });
    st().remove(KEY, b.id);
    expect(themes().map((x) => x.title)).toEqual(['A', 'C']);
    expect(st().undo(KEY)).toBe(true);
    expect(themes().map((x) => x.title)).toEqual(['A', 'B', 'C']);
    expect(st().redo(KEY)).toBe(true);
    expect(themes().map((x) => x.title)).toEqual(['A', 'C']);
    // 名前の変更も元に戻る
    st().rename(KEY, a.id, 'A2');
    st().undo(KEY);
    expect(themes()[0].title).toBe('A');
    // 履歴が空なら何も起きない
    st().reset(KEY);
    expect(st().undo(KEY)).toBe(false);
  });
});

describe('FR-049 テーマごとの議論の記録', () => {
  // FR-049 AC-061
  it('FR-049 AC-061 7 種類の項目を入力すると保存され、永続化される形（JSON）で残る', () => {
    const t = st().addTheme(KEY, { title: 'T' });
    st().update(KEY, t.id, {
      options: '選択肢の入力', recommendation: '提言の入力', rationale: '根拠の入力',
      costBenefit: 'コスト/効果の入力', decisions: '決定事項の入力', openIssues: '未決事項の入力',
    });
    const a = st().addAction(KEY, t.id);
    st().patchAction(KEY, t.id, a.id, { text: '次のアクション', owner: '担当者', due: '2026-11-30' });
    const saved = JSON.parse(JSON.stringify(themes()[0]));
    expect(saved).toMatchObject({
      options: '選択肢の入力', recommendation: '提言の入力', rationale: '根拠の入力',
      costBenefit: 'コスト/効果の入力', decisions: '決定事項の入力', openIssues: '未決事項の入力',
      actions: [{ text: '次のアクション', owner: '担当者', due: '2026-11-30' }],
    });
  });

  // FR-049 AC-061
  it('FR-049 AC-061 期限は実在する日付だけ受け付け、日付でない値は原因つきで拒否する', () => {
    expect(parseDueDate('')).toEqual({ ok: true, value: '' });
    expect(parseDueDate('2026-11-30')).toEqual({ ok: true, value: '2026-11-30' });
    expect(parseDueDate('2026/1/5')).toEqual({ ok: true, value: '2026-01-05' });
    const bad = parseDueDate('来週あたり');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('日付');
    expect(parseDueDate('2026-02-30').ok).toBe(false);
    expect(parseDueDate('2026-13-01').ok).toBe(false);
  });

  // FR-049 AC-061
  it('FR-049 AC-061 次のアクションの追加・削除', () => {
    const t = st().addTheme(KEY, { title: 'T' });
    const a = st().addAction(KEY, t.id);
    st().addAction(KEY, t.id);
    expect(themes()[0].actions).toHaveLength(2);
    st().removeAction(KEY, t.id, a.id);
    expect(themes()[0].actions).toHaveLength(1);
  });
});

describe('FR-050 顧客の決定と AI の提案の区別', () => {
  // FR-050 AC-062
  it('FR-050 AC-062 AI 提案のテーマを「決定」にすると表示が「顧客決定」になり、AI の提案の内容は残る', () => {
    const t = st().addTheme(KEY, { title: 'AI 案', createdBy: 'ai', aiProposal: 'まず段階導入を提案します' });
    expect(t.status).toBe('ai-proposed');
    expect(statusOrigin(t.status)).toBe('ai');
    expect(STATUS_DISPLAY_LABEL[t.status]).toBe('AI 提案');
    st().setStatus(KEY, t.id, 'decided');
    const after = themes()[0];
    expect(STATUS_DISPLAY_LABEL[after.status]).toBe('顧客決定');
    expect(statusOrigin(after.status)).toBe('customer');
    expect(after.aiProposal).toBe('まず段階導入を提案します');
    st().undo(KEY);
    expect(themes()[0].status).toBe('ai-proposed');
  });

  // FR-050 AC-062
  it('FR-050 AC-062 利用者が作ったテーマは AI 提案ではない（検討中）', () => {
    expect(st().addTheme(KEY, { title: 'x' }).status).toBe('considering');
  });
});

describe('FR-051 既定のファイル名での保存', () => {
  // FR-051 AC-063
  it('FR-051 AC-063 既定のファイル名は当日の日付・顧客名・Project 名で組み立てられる', () => {
    expect(defaultMemoFileName('モノ製造', '新基幹', new Date(2026, 9, 9))).toBe('20261009-モノ製造-新基幹-discussion-memo.md');
    expect(defaultMemoFileName('A/B', 'C:D', new Date(2026, 0, 5))).toBe('20260105-A_B-C_D-discussion-memo.md');
    expect(sanitizeFilePart(' a*b ')).toBe('a_b');
  });

  // FR-051 AC-063
  it('FR-051 AC-063 保存した Markdown を空の状態で読み込むと議論データが元どおりになる', () => {
    const t = st().addTheme(KEY, { title: '段階導入' });
    st().update(KEY, t.id, { decisions: '決定ST: 段階導入で進める', openIssues: '未決ST: 予算の上限', options: '選択肢ST: A/B' });
    const md = buildMemoForPack(TARGET, new Date(2026, 9, 9));
    st().reset(KEY);
    expect(themes()).toHaveLength(0);
    const r = restoreFromMemo(md, TARGET);
    expect(r).toMatchObject({ ok: true, themeCount: 1, warnings: [] });
    expect(themes()[0]).toMatchObject({ title: '段階導入', decisions: '決定ST: 段階導入で進める', openIssues: '未決ST: 予算の上限', options: '選択肢ST: A/B' });
  });
});

describe('FR-056 エクスポートした Markdown からの復元', () => {
  const sample = () => {
    const t = createTheme({ title: 'テーマ1', decisions: '```json\n{"x":1}\n```を含む決定', actions: [{ id: 'act-1', text: '手配', owner: '田中', due: '2026-12-01' }] });
    const ai = createTheme({ title: 'AI 案', createdBy: 'ai', status: 'ai-proposed', aiProposal: '提案本文', aiMode: 'mock' });
    return [t, ai];
  };

  // FR-056 AC-069
  it('FR-056 AC-069 front matter と JSON ブロックを持ち、本文中のフェンスや改行を含んでも往復で同じになる', () => {
    const s = sample();
    const md = buildDiscussionMemo({ customerName: 'C', projectName: 'P', themes: s, now: new Date(Date.UTC(2026, 9, 9)) });
    expect(md.startsWith('---')).toBe(true);
    expect(md).toMatch(/```json/);
    expect(md).toContain('顧客の選択');
    const r = parseDiscussionMemo(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.discussion.themes).toEqual(s);
  });

  // FR-056 AC-069
  it('FR-056 AC-069 登録された全量データ（data）もエクスポートされ、復元で適用される', () => {
    let store = { v: 1 };
    const off = registerSnapshotSource({
      key: 'sample-data',
      capture: () => store,
      validate: (v) => (typeof (v as { v?: unknown })?.v === 'number' ? [] : ['v が数値ではありません']),
      apply: (v) => { store = v as { v: number }; },
    });
    st().addTheme(KEY, { title: 'T' });
    store = { v: 42 };
    const md = buildMemoForPack(TARGET);
    store = { v: 0 };
    st().reset(KEY);
    expect(restoreFromMemo(md, TARGET)).toMatchObject({ ok: true });
    expect(store).toEqual({ v: 42 });
    expect(themes()).toHaveLength(1);
    off();
  });

  // FR-056 AC-069
  it('FR-056 AC-069 異常系: 壊れた JSON ブロックは読み込まれず、原因が返り、現在のデータは変わらない', () => {
    st().addTheme(KEY, { title: '現在のテーマ' });
    const md = buildMemoForPack(TARGET);
    const broken = md.replace(/```json\s*\{/, '```json\n{ "broken": [ ,,, ');
    expect(broken).not.toBe(md);
    const r = restoreFromMemo(broken, TARGET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('JSON');
    expect(themes().map((t) => t.title)).toEqual(['現在のテーマ']);
  });

  // FR-056 AC-069
  it('FR-056 AC-069 異常系: front matter・JSON ブロックがない、形式や版が違う、項目が不正なファイルは読み込まない', () => {
    st().addTheme(KEY, { title: '現在のテーマ' });
    expect(restoreFromMemo('# ただの Markdown', TARGET)).toMatchObject({ ok: false });
    expect(restoreFromMemo('---\na: 1\n---\n\n本文だけ', TARGET)).toMatchObject({ ok: false });
    const wrap = (o: unknown) => `---\nformat: x\n---\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\`\n`;
    expect(restoreFromMemo(wrap({ format: 'other' }), TARGET)).toMatchObject({ ok: false });
    const base = { format: 'edb-discussion-memo', version: 1, customer: { name: 'C', projectName: 'P' } };
    expect(restoreFromMemo(wrap({ ...base, version: 99, discussion: { themes: [] } }), TARGET)).toMatchObject({ ok: false });
    expect(restoreFromMemo(wrap({ ...base, discussion: { themes: [{ id: 'A B', title: '' }] } }), TARGET)).toMatchObject({ ok: false });
    expect(restoreFromMemo(wrap({ ...base, discussion: { themes: [createTheme({ title: 't', actions: [{ id: 'a', text: '', owner: '', due: '来週' }] })] } }), TARGET)).toMatchObject({ ok: false });
    expect(themes().map((t) => t.title)).toEqual(['現在のテーマ']);
  });

  // FR-056 AC-069
  it('FR-056 AC-069 データの検証に失敗する復元は、議論テーマも含めて何も適用しない', () => {
    let applied = false;
    const off = registerSnapshotSource({ key: 'strict', capture: () => ({ ok: true }), validate: (v) => ((v as { ok?: boolean }).ok ? [] : ['不正']), apply: () => { applied = true; } });
    st().addTheme(KEY, { title: '現在のテーマ' });
    const md = buildMemoForPack(TARGET).replace('"ok": true', '"ok": false');
    expect(restoreFromMemo(md, TARGET)).toMatchObject({ ok: false });
    expect(applied).toBe(false);
    expect(themes().map((t) => t.title)).toEqual(['現在のテーマ']);
    off();
  });

  // FR-056 AC-069
  it('FR-056 AC-069 別の顧客パックのファイルは適用したうえで警告する', () => {
    st().addTheme(KEY, { title: 'T' });
    const md = buildMemoForPack(TARGET);
    const other = { customerName: '別の顧客', projectName: '別 Project' };
    const r = restoreFromMemo(md, other);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.warnings[0]).toContain(TARGET.customerName);
    st().reset('別の顧客 / 別 Project');
  });
});
