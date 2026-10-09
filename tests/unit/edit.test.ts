// その場のデータ編集（FR-044）・全ビューへの即時反映（FR-045）・入力検証/元に戻す/履歴/インポート・エクスポート（FR-046）・編集モード（FR-047）、
// ミニ・モックアプリのデータ（FR-043）の単体・結合テスト。
// FR-043 AC-054 / FR-044 AC-055 / FR-045 AC-056 / FR-046 AC-057, AC-058 / FR-047 AC-059
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRecord, allIds, deleteRecord, duplicateRecord, exportCsv, exportJson, importCsv, importJson, parseCsv, parseNumberInput, updateField,
  type EditResult,
} from '../../src/edit/model';
import { editKeyAction } from '../../src/edit/useEditKeys';
import { BrandProfileSchema, DATA_SCHEMAS, MOCK_SCREENS_MAX, validatePack, type BrandProfile, type PackData } from '../../src/schema';
import { buildEntityGraph } from '../../src/selection/graph';
import { getEntityGraph } from '../../src/selection/hooks';
import { UNDO_LIMIT, resetEditForTest, subscribeEdits, useEditStore } from '../../src/store/edit';
import { usePackStore } from '../../src/store/pack';
import { resetSelectionForTest, useSelectionStore } from '../../src/store/selection';

type Kind = 'mono' | 'koto';

function readPack(kind: Kind): { data: PackData; brand: BrandProfile } {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) {
    out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'data', `${name}.json`), 'utf8')));
  }
  const brand = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'brand', 'brand-profile.json'), 'utf8')));
  return { data: out as PackData, brand };
}

function ok(r: EditResult): Extract<EditResult, { ok: true }> {
  if (!r.ok) throw new Error(`失敗: ${r.message} ${(r.details ?? []).join(' / ')}`);
  return r;
}

const mono = readPack('mono');
const ISSUE = 'issue-mono-001';

/** 顧客パックを読み込み済みの状態にする */
function loadStore(): void {
  resetSelectionForTest();
  resetEditForTest();
  usePackStore.setState({
    original: mono.data,
    state: { status: 'ready', warnings: [], pack: { data: mono.data, brand: mono.brand, issues: [], disabledIds: [], isExample: true } },
  });
}
const data = (): PackData => {
  const st = usePackStore.getState().state;
  if (st.status !== 'ready') throw new Error('not ready');
  return st.pack.data;
};
const edit = () => useEditStore.getState();
const titleOf = (id: string) => data().issues.issues.find((i) => i.id === id)?.title;

describe('FR-046 AC-057 入力検証', () => {
  it('数値の項目に文字を入れると保存されず、原因（数値）が返る。全角の数字・桁区切りは数値として受け付ける', () => {
    const r = updateField(mono.data, ISSUE, ['evaluation', 'cost', 'value'], 'abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/数値/);
    expect(parseNumberInput('１，２００')).toBe(1200);
    expect(parseNumberInput(' -3.5 ')).toBe(-3.5);
    for (const bad of ['', 'abc', '12a', '1e3', '--1', '１２ 円']) expect(parseNumberInput(bad), bad).toBeUndefined();
    const good = ok(updateField(mono.data, ISSUE, ['evaluation', 'cost', 'value'], '１，３００'));
    expect(good.data.issues.issues[0]!.evaluation?.cost?.value).toBe(1300);
    expect(good.data.issues.issues[0]!.evaluation?.cost?.sourceIds).toEqual(mono.data.issues.issues[0]!.evaluation?.cost?.sourceIds);
  });

  it('文字の項目は空にできない。存在しない項目・編集できない項目はエラーになり、元のデータは変わらない', () => {
    expect(updateField(mono.data, ISSUE, ['title'], '   ').ok).toBe(false);
    expect(updateField(mono.data, 'no-such-id', ['title'], 'x').ok).toBe(false);
    expect(updateField(mono.data, ISSUE, ['evaluation'], 'x').ok).toBe(false);
    expect(mono.data.issues.issues[0]!.title).toBe('設備の計画外停止が多い');
  });

  it('値を編集すると作成者の種別が human になる（FR-116）。同じ値なら変更履歴に残らない', () => {
    expect(mono.data.issues.issues[0]!.createdBy).toBe('sample');
    const r = ok(updateField(mono.data, ISSUE, ['title'], '新しい名前'));
    expect(r.data.issues.issues[0]!.createdBy).toBe('human');
    expect(r.changes).toHaveLength(1);
    expect(ok(updateField(mono.data, ISSUE, ['title'], mono.data.issues.issues[0]!.title)).changes).toHaveLength(0);
  });
});

describe('FR-044 AC-055 追加・複製・削除', () => {
  it('追加: 選んだ項目と同じ種類の項目を、すぐ後ろに作る（人が作成・ID は一意）', () => {
    const r = ok(addRecord(mono.data, ISSUE));
    const id = r.select![0]!;
    const list = r.data.issues.issues;
    expect(list[1]!.id).toBe(id);
    expect(list[1]!.createdBy).toBe('human');
    expect(allIds(r.data).size).toBe(allIds(mono.data).size + 1);
    expect(r.data.issues.issues).toHaveLength(mono.data.issues.issues.length + 1);
  });

  it('追加: 何も選んでいなければ課題を末尾に足す。種類ごとに必須の項目を満たす（スキーマで検証済み）', () => {
    expect(ok(addRecord(mono.data)).data.issues.issues.at(-1)!.title).toContain('新しい課題');
    for (const ref of ['sol-mono-001', 'ent-mono-leader', 'feat-mono-001', 'topic-mono-001', 'src-mono-001', 'mock-mono-001']) {
      const r = ok(addRecord(mono.data, ref));
      expect(validatePack({ ...r.data, brandProfile: mono.brand }).errors, ref).toEqual([]);
    }
  });

  it('複製: 元の後ろに、新しい ID・（複製）つきの名前で作り、入れ子の ID（原因・効果）も新しくする', () => {
    const r = ok(duplicateRecord(mono.data, ISSUE));
    const [orig, copy] = r.data.issues.issues;
    expect(orig!.id).toBe(ISSUE);
    expect(copy!.id).not.toBe(ISSUE);
    expect(copy!.title).toBe(`${orig!.title}（複製）`);
    expect(r.select).toEqual([ISSUE, copy!.id]);
    expect(validatePack({ ...r.data, brandProfile: mono.brand }).errors).toEqual([]);
    const causeIds = r.data.issues.issues.flatMap((i) => (i.causes ?? []).map((c) => c.id));
    expect(new Set(causeIds).size).toBe(causeIds.length);
  });

  it('削除: 項目を消し、ほかの項目の参照を外す。ほかの項目そのものは消さず、子の課題は親につなぐ', () => {
    const before = mono.data;
    const refused = deleteRecord(before, 'src-mono-001');
    expect(refused.ok).toBe(false); // 数値の唯一の出典を消すと、出典の規則（FR-115）を満たせない
    if (!refused.ok) expect(refused.details!.join('\n')).toMatch(/sourceIds/);
    const r = ok(deleteRecord(before, 'feat-mono-002'));
    expect(r.data.plan.features.some((s) => s.id === 'feat-mono-002')).toBe(false);
    expect(JSON.stringify(r.data)).not.toContain('"feat-mono-002"');
    // 課題を消しても、その解決策は残る
    const r2 = ok(deleteRecord(before, ISSUE));
    expect(r2.data.issues.issues.some((i) => i.id === ISSUE)).toBe(false);
    expect(r2.data.issues.solutions).toHaveLength(before.issues.solutions.length);
    // 親を消すと、子の課題は親の親（なければ null）につながる
    const withChild = ok(updateField(ok(addRecord(before, ISSUE)).data, ISSUE, ['title'], 'x')).data;
    const child = withChild.issues.issues[1]!;
    const withParent = { ...withChild, issues: { ...withChild.issues, issues: withChild.issues.issues.map((i) => (i.id === child.id ? { ...i, parentId: ISSUE } : i)) } };
    const gone = ok(deleteRecord(withParent, ISSUE));
    expect(gone.data.issues.issues.find((i) => i.id === child.id)!.parentId).toBeNull();
  });

  it('接続（アーキテクチャの辺）は、端点の節を消すと一緒に消える', () => {
    const edge = mono.data.architecture.edges[0];
    if (!edge) return;
    const r = ok(deleteRecord(mono.data, edge.from));
    expect(r.data.architecture.edges.some((e) => e.from === edge.from || e.to === edge.from)).toBe(false);
  });

  it('異常系: 課題を消しても、唯一の対象課題を失う解決策は別の課題へ付け替わり、参照が壊れない（FR-114）。履歴にも残る', () => {
    const r = ok(deleteRecord(mono.data, ISSUE));
    const sol = r.data.issues.solutions.find((s) => s.id === 'sol-mono-001')!;
    expect(sol.issueId).not.toBe(ISSUE);
    expect(r.data.issues.issues.some((i) => i.id === sol.issueId)).toBe(true);
    expect(r.changes.some((c) => c.entityId === 'sol-mono-001' && c.fieldLabel.includes('付け替え'))).toBe(true);
    expect(validatePack({ ...r.data, brandProfile: mono.brand }).errors).toEqual([]);
  });

  it('異常系: 付け替え先の課題が 1 つもないとき（最後の課題を、解決策があるまま削除）は、削除を拒否して理由を返す', () => {
    const koto = readPack('koto');
    expect(koto.data.issues.issues).toHaveLength(1);
    const r = deleteRecord(koto.data, koto.data.issues.issues[0]!.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/解決策.*削除できません/);
  });

  it('異常系: 複数の課題に効く解決策は、残る課題へ issueId を移し、削除した課題の参照だけを外す。製品を消すと、その適合理由も消える', () => {
    const solutions = mono.data.issues.solutions.map((s) => (s.id === 'sol-mono-001' ? { ...s, issueIds: ['issue-mono-002'] } : s));
    const multi = { ...mono.data, issues: { ...mono.data.issues, solutions } };
    const r = ok(deleteRecord(multi, ISSUE));
    const sol = r.data.issues.solutions.find((s) => s.id === 'sol-mono-001')!;
    expect(sol.issueId).toBe('issue-mono-002');
    expect(sol.issueIds).toEqual(['issue-mono-002']);
    const withFit = mono.data.issues.solutions.find((s) => (s.productFits ?? []).length > 0);
    if (withFit) {
      const pid = withFit.productFits![0]!.productId;
      const gone = ok(deleteRecord(mono.data, pid));
      expect(JSON.stringify(gone.data)).not.toContain(`"${pid}"`);
      expect(validatePack({ ...gone.data, brandProfile: mono.brand }).errors).toEqual([]);
    }
  });

  it('異常系: どの項目を削除しても（拒否される場合を除き）、削除後のデータは検証を通り、JSON のエクスポート→再インポートで内容も警告も変わらない', () => {
    let deleted = 0;
    for (const kind of ['mono', 'koto'] as const) {
      const p = readPack(kind);
      for (const id of allIds(p.data)) {
        const r = deleteRecord(p.data, id);
        if (!r.ok) continue;
        deleted++;
        expect(validatePack({ ...r.data, brandProfile: p.brand }).errors, `${kind} ${id} の削除後`).toEqual([]);
        const back = importJson(exportJson(r.data), p.brand);
        expect(back.ok, `${kind} ${id}`).toBe(true);
        if (back.ok) {
          expect(back.warnings, `${kind} ${id} の再インポート`).toEqual([]);
          expect(back.data, `${kind} ${id} の往復`).toEqual(r.data);
        }
      }
    }
    expect(deleted).toBeGreaterThan(20);
  });
});

describe('FR-047 AC-059 編集モード', () => {
  beforeEach(loadStore);

  it('既定は OFF。OFF のときは、編集・追加・複製・削除・取り込み・サンプルに戻すのどれもデータを変えない', () => {
    expect(edit().editMode).toBe(false);
    const results = [
      edit().update(ISSUE, ['title'], 'x'), edit().rename(ISSUE, 'x'), edit().add(ISSUE), edit().duplicate(ISSUE), edit().remove(ISSUE),
      edit().importCsv(exportCsv(data())), edit().importJson(exportJson(data())), edit().resetToSample(),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(data()).toBe(mono.data);
    expect(edit().log).toHaveLength(0);
    expect(edit().undo()).toBe(false);
  });

  it('ON にすると変更できる。もう一度 OFF にすると変更できない', () => {
    edit().setEditMode(true);
    expect(edit().rename(ISSUE, '編集後').ok).toBe(true);
    expect(titleOf(ISSUE)).toBe('編集後');
    edit().setEditMode(false);
    expect(edit().rename(ISSUE, '別の名前').ok).toBe(false);
    expect(titleOf(ISSUE)).toBe('編集後');
  });
});

describe('FR-045 AC-056 編集の全ビューへの即時反映', () => {
  beforeEach(() => { loadStore(); edit().setEditMode(true); });

  it('編集は共通のパックのストアに載り、エンティティ関係グラフ（全ビューの情報源）の名前が変わる。再読込は要らない', () => {
    const g0 = getEntityGraph()!;
    expect(g0.node(ISSUE)!.label).toBe('設備の計画外停止が多い');
    let notified = 0;
    const unsubscribe = usePackStore.subscribe(() => { notified++; });
    const seen: string[] = [];
    const off = subscribeEdits((es) => es.forEach((e) => seen.push(e.fieldLabel)));
    ok(edit().rename(ISSUE, '改名ST-056'));
    unsubscribe(); off();
    expect(notified).toBeGreaterThan(0);
    expect(seen).toEqual(['名前（タイトル）']);
    const g1 = getEntityGraph()!;
    expect(g1).not.toBe(g0);
    expect(g1.node(ISSUE)!.label).toBe('改名ST-056');
    expect(titleOf(ISSUE)).toBe('改名ST-056');
    // 課題・解決策・ガント・サマリーなどは、このストアの data から読むので、同じ値になる
    expect(buildEntityGraph(data()).node(ISSUE)!.label).toBe('改名ST-056');
  });

  it('追加・複製した項目を選び、削除した項目の選択は外れる', () => {
    ok(edit().duplicate(ISSUE));
    const copyId = data().issues.issues[1]!.id;
    expect(useSelectionStore.getState().selectedIds).toEqual([ISSUE, copyId]);
    ok(edit().remove(copyId));
    expect(useSelectionStore.getState().selectedIds).toEqual([ISSUE]);
    expect(getEntityGraph()!.has(copyId)).toBe(false);
  });
});

describe('FR-046 AC-057 元に戻す・やり直し・変更履歴', () => {
  beforeEach(() => { loadStore(); edit().setEditMode(true); });

  it('元に戻す・やり直しができ、変更履歴に作成者の種別・日時・項目・変更前後の値が残る。保存されなかった入力は残らない', () => {
    expect(edit().update(ISSUE, ['evaluation', 'cost', 'value'], 'abc').ok).toBe(false);
    ok(edit().rename(ISSUE, 'Z'));
    expect(titleOf(ISSUE)).toBe('Z');
    expect(edit().undo()).toBe(true);
    expect(titleOf(ISSUE)).toBe('設備の計画外停止が多い');
    expect(edit().redo()).toBe(true);
    expect(titleOf(ISSUE)).toBe('Z');
    const [change, undone, redone] = edit().log;
    expect(change).toMatchObject({ actor: 'human', op: 'update', entityId: ISSUE, fieldLabel: '名前（タイトル）', before: '設備の計画外停止が多い', after: 'Z' });
    expect(Number.isNaN(Date.parse(change!.at))).toBe(false);
    expect(undone).toMatchObject({ op: 'undo', before: 'Z', after: '設備の計画外停止が多い' });
    expect(redone).toMatchObject({ op: 'redo', before: '設備の計画外停止が多い', after: 'Z' });
    expect(edit().log.some((e) => e.before === 'abc' || e.after === 'abc')).toBe(false);
  });

  it('新しい編集をするとやり直しの履歴は消える。履歴がなければ元に戻せない', () => {
    expect(edit().undo()).toBe(false);
    expect(edit().redo()).toBe(false);
    ok(edit().rename(ISSUE, 'A'));
    edit().undo();
    ok(edit().rename(ISSUE, 'B'));
    expect(edit().redo()).toBe(false);
  });

  it('元に戻す履歴の上限は 100 回（PARAM-024）', () => {
    expect(UNDO_LIMIT).toBe(100);
    for (let i = 0; i < UNDO_LIMIT + 5; i++) ok(edit().rename(ISSUE, `名前 ${i}`));
    expect(edit().past).toHaveLength(UNDO_LIMIT);
    let n = 0;
    while (edit().undo()) n++;
    expect(n).toBe(UNDO_LIMIT);
    expect(titleOf(ISSUE)).toBe('名前 4');
  });

  it('Ctrl+Z / Ctrl+Y（⌘・Ctrl+Shift+Z）で元に戻す・やり直す。入力欄の中・修飾キーなし・処理済みのキーは使わない', () => {
    const base = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, editable: false };
    expect(editKeyAction({ ...base, key: 'z' })).toBe('undo');
    expect(editKeyAction({ ...base, key: 'Z', shiftKey: true })).toBe('redo');
    expect(editKeyAction({ ...base, key: 'y' })).toBe('redo');
    expect(editKeyAction({ ...base, ctrlKey: false, metaKey: true, key: 'z' })).toBe('undo');
    expect(editKeyAction({ ...base, key: 'z', editable: true })).toBeNull();
    expect(editKeyAction({ ...base, key: 'z', defaultPrevented: true })).toBeNull();
    expect(editKeyAction({ ...base, key: 'z', ctrlKey: false })).toBeNull();
    expect(editKeyAction({ ...base, key: 'a' })).toBeNull();
  });
});

describe('FR-046 AC-058 インポート/エクスポート・サンプルに戻す', () => {
  beforeEach(() => { loadStore(); edit().setEditMode(true); });

  it('JSON: エクスポートして編集後にインポートすると、内容が置き換わる（元に戻すで取り消せる）', () => {
    const json = exportJson(data());
    ok(edit().rename(ISSUE, '一時'));
    expect(titleOf(ISSUE)).toBe('一時');
    ok(edit().importJson(json));
    expect(titleOf(ISSUE)).toBe('設備の計画外停止が多い');
    expect(edit().undo()).toBe(true);
    expect(titleOf(ISSUE)).toBe('一時');
  });

  it('JSON: 壊れた JSON・オブジェクトでない JSON・ファイルの欠けは取り込まず、理由を返す。問題のある項目だけは無効にして取り込む', () => {
    for (const bad of ['{', '[]', '{"issues": 1}']) {
      const r = edit().importJson(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.details!.length).toBeGreaterThan(0);
    }
    const parsed = JSON.parse(exportJson(data())) as PackData;
    const broken = { ...parsed, issues: { ...parsed.issues, solutions: [...parsed.issues.solutions, { id: 'sol-bad', createdBy: 'sample', issueId: 'no-such-issue', title: '壊れた解決策' }] } };
    const r = ok(edit().importJson(JSON.stringify(broken)));
    expect(r.warnings!.some((w) => w.includes('no-such-issue'))).toBe(true);
    expect(data().issues.solutions.some((s) => s.id === 'sol-bad')).toBe(false);
  });

  it('CSV: ID・種別・タイプ・名称の表をエクスポートし、編集後にインポートすると名称が戻る。引用符・カンマ・改行を含む名称も往復できる', () => {
    const csv = exportCsv(data());
    expect(csv.startsWith('\uFEFFID,種別,タイプ,名称')).toBe(true);
    expect(csv).toContain('設備の計画外停止が多い');
    ok(edit().rename(ISSUE, '一時'));
    ok(edit().importCsv(csv));
    expect(titleOf(ISSUE)).toBe('設備の計画外停止が多い');
    ok(edit().rename(ISSUE, 'a, "b"\nc'));
    const tricky = exportCsv(data());
    expect(parseCsv(tricky).records.find((r) => r.cells[0] === ISSUE)!.cells[3]).toBe('a, "b"\nc');
    ok(edit().rename(ISSUE, '別'));
    ok(edit().importCsv(tricky));
    expect(titleOf(ISSUE)).toBe('a, "b"\nc');
  });

  it('CSV: 不正な行（列の数が合わない・存在しない ID・種別違い・名称が空）を 1 つでも含むと、何も取り込まず、行番号と理由を返す', () => {
    const lines = exportCsv(data()).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const cols = lines[0]!.split(',').length;
    const changed = [...lines];
    changed[1] = changed[1]!.replace('第 1 組立ライン', '第 1 組立ライン-不正CSV');
    changed[2] = Array(cols + 3).fill('壊れた値').join(',');
    const before = data();
    const r = edit().importCsv(changed.join('\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.details!.join('\n')).toMatch(/3\s*行目/);
      expect(r.details!.join('\n')).toMatch(/列|形式|不正/);
    }
    expect(data()).toBe(before);
    const many = ['ID,種別,タイプ,名称', 'nope,課題,,x', `${ISSUE},解決策,,x`, `${ISSUE},課題,,`].join('\n');
    const r2 = edit().importCsv(many);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.details).toHaveLength(3);
    expect(edit().importCsv('名前,値\n1,2').ok).toBe(false);
    expect(edit().importCsv('ID,種別,タイプ,名称\n"x').ok).toBe(false);
    expect(data()).toBe(before);
  });

  it('サンプルに戻す: 顧客パックの初期値に戻り、元に戻すで取り消せる', () => {
    ok(edit().rename(ISSUE, '戻す前'));
    ok(edit().add(ISSUE));
    ok(edit().resetToSample());
    expect(data()).toBe(mono.data);
    expect(edit().log.at(-1)!.op).toBe('reset');
    expect(edit().undo()).toBe(true);
    expect(data().issues.issues).toHaveLength(mono.data.issues.issues.length + 1);
  });
});

describe('FR-043 AC-054 ミニ・モックアプリのデータ', () => {
  it('お手本パックのモックは、存在する解決策に結び付き、1〜3 画面（PARAM-022）で、画面の題名が重ならない', () => {
    for (const kind of ['mono', 'koto'] as const) {
      const p = readPack(kind);
      expect(p.data.mocks.mocks.length).toBeGreaterThan(0);
      for (const m of p.data.mocks.mocks) {
        expect(p.data.issues.solutions.some((s) => s.id === m.solutionId), `${kind} ${m.id}`).toBe(true);
        const n = m.screens?.length ?? 0;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(MOCK_SCREENS_MAX);
        const titles = (m.screens ?? []).map((s) => s.title);
        expect(new Set(titles).size).toBe(titles.length);
      }
      expect(validatePack({ ...p.data, brandProfile: p.brand }).errors).toEqual([]);
    }
  });

  it('4 画面のモックはスキーマ違反になる。モックと解決策は、エンティティ関係グラフで結ばれる', () => {
    const m = mono.data.mocks.mocks[0]!;
    const screens = [...m.screens!, { title: '4 画面目' }];
    expect(DATA_SCHEMAS.mocks.safeParse({ mocks: [{ ...m, screens }] }).success).toBe(false);
    expect(DATA_SCHEMAS.mocks.safeParse({ mocks: [{ ...m, screens: [] }] }).success).toBe(false);
    const g = buildEntityGraph(mono.data);
    expect(g.neighbors(m.id).has(m.solutionId!)).toBe(true);
  });
});
