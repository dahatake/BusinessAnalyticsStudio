// FR-303 ブラウザー内の顧客パックの検証 / FR-304 取り込み前に人が確かめること（src/packImport）
// AC-845・847・848・850 と AC-851〜853 は integration（お手本パックを validatePackDir と突き合わせる）。AC-846・849・854 の判定部分もここで押さえる。
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, validatePackDir } from '../../scripts/lib/pack-fs';
import { countInternal } from '../../src/schema';
import {
  MAX_FILE_BYTES, classifyFiles, findJsonErrorOffset, reviewItems, reviewUpload, syntaxPosition, validateUpload,
  type UploadError, type UploadFile,
} from '../../src/packImport';

const MONO = path.join(REPO_ROOT, 'examples', 'mono');

function listFiles(root: string, dir = ''): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(root, rel) : [rel];
  });
}
const readUpload = (root: string): UploadFile[] =>
  listFiles(root).filter((n) => /\.(json|md)$/.test(n)).map((n) => ({ name: n, text: fs.readFileSync(path.join(root, n), 'utf8') }));

/** examples/mono を一時フォルダーに複製し、files の変更を当てる（変更は {相対パス: 新しい本文 | null=削除}） */
function packDir(edit: Record<string, string | null>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-import-'));
  fs.cpSync(MONO, dir, { recursive: true });
  for (const [rel, text] of Object.entries(edit)) {
    if (text === null) fs.rmSync(path.join(dir, rel));
    else fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const jsonOf = (rel: string): any => JSON.parse(fs.readFileSync(path.join(MONO, rel), 'utf8'));
const key = (e: { code: string; file: string; path: string; id?: string }): string => `${e.code}|${e.file}|${e.path}|${e.id ?? ''}`;

/** ブラウザー内の検証と validatePackDir が、同じ入力で同じ結果（エラーの集合・出典なしの件数・可否）になること */
function expectSameAsCli(dir: string) {
  const cli = validatePackDir(dir);
  const up = validateUpload(classifyFiles(readUpload(dir)));
  expect(up.errors.map(key).sort()).toEqual(cli.errors.map(key).sort());
  expect(up.unsourcedNumbers).toBe(cli.unsourcedNumbers);
  expect(up.errors.length === 0).toBe(cli.errors.length === 0);
  return { cli, up };
}

describe('FR-303 ブラウザー内の検証', () => {
  // FR-303 AC-845
  it('FR-303 AC-845 お手本パック（モノ・コト）は validatePackDir と同じ結果で、取り込める', () => {
    const { up } = expectSameAsCli(MONO);
    expect(up.errors).toEqual([]);
    expect(up.ok).toBe(true);
    expect(up.data).toBeDefined();
  });

  it('FR-303 AC-845 1 件だけ不正にしたパックは、エラーの集合・出典なしの件数・可否が validatePackDir と一致する', () => {
    const issues = jsonOf('public/data/issues.json');
    const first = Object.values(issues).find(Array.isArray) as any[];
    first[0].productIds = ['prod-unknown-xyz'];
    first[0].parentId = 'no-such-id';
    const sources = jsonOf('public/data/plan.json');
    const dir = packDir({ 'public/data/issues.json': JSON.stringify(issues) });
    const { cli, up } = expectSameAsCli(dir);
    expect(cli.errors.length).toBeGreaterThan(0);
    expect(up.ok).toBe(false);
    void sources;
  });

  it('FR-303 AC-845 出典のない数値を足したパックは、件数・位置が validatePackDir と一致し、確認事項は出ない', () => {
    const plan = jsonOf('public/data/plan.json');
    const withValue = (o: any): boolean => {
      if (Array.isArray(o)) return o.some(withValue);
      if (o && typeof o === 'object') {
        if (typeof o.value === 'number' && Array.isArray(o.sourceIds)) { delete o.sourceIds; return true; }
        return Object.values(o).some(withValue);
      }
      return false;
    };
    const arch = [plan, jsonOf('public/data/products.json'), jsonOf('public/data/issues.json')];
    const target = ['plan', 'products', 'issues'][arch.findIndex(withValue)];
    if (!target) return; // お手本に数値項目がなければ、ここでは検査できない
    const dir = packDir({ [`public/data/${target}.json`]: JSON.stringify(arch[['plan', 'products', 'issues'].indexOf(target)]) });
    const { cli, up } = expectSameAsCli(dir);
    expect(cli.unsourcedNumbers).toBeGreaterThan(0);
    expect(up.checks.find((c) => c.id === 'sources')?.ok).toBe(false);
    expect(reviewUpload(up)).toBeUndefined();
  });

  // FR-303 AC-847
  it('FR-303 AC-847 必須の JSON を欠くと、欠けたファイル名がすべて示され、validatePackDir と一致する', () => {
    const dir = packDir({ 'public/data/issues.json': null, 'public/data/mocks.json': null, 'public/brand/brand-profile.json': null });
    const { up } = expectSameAsCli(dir);
    const missing = up.errors.filter((e) => e.code === 'missing-file').map((e) => e.file).sort();
    expect(missing).toEqual(['public/brand/brand-profile.json', 'public/data/issues.json', 'public/data/mocks.json']);
    expect(up.ok).toBe(false);
    for (const e of up.errors) { expect(e.message).toMatch(/[぀-ヿ一-龯]/); expect(e.remedy).not.toBe(''); }
  });

  it('FR-303 AC-847 classifyFiles は、欠けた必須ファイルを missing に挙げる', () => {
    const files = readUpload(MONO).filter((f) => !f.name.endsWith('issues.json') && !f.name.endsWith('brand-profile.json'));
    expect(classifyFiles(files).missing.sort()).toEqual(['brandProfile', 'issues']);
  });

  it('FR-303 AC-847 任意の .md と assets/ がなくてもエラーにならない（取り込める）', () => {
    const files = readUpload(MONO).filter((f) => f.name.endsWith('.json'));
    const up = validateUpload(classifyFiles(files));
    expect(up.errors).toEqual([]);
    expect(up.ok).toBe(true);
  });

  // FR-303 AC-846（判定部分）
  it('FR-303 AC-846 構文の検査器は JSON.parse と合否が一致し、誤りの行・桁を返す', () => {
    const samples = ['{}', '[1,2,{"a":"\\u00e9"}]', '{"a":1,}', '[1 2]', '{"a" 1}', '"\\x"', '01', '-', '{"a":tru}', '', ' ', 'nul', '{"a":"\n"}', '[1]x'];
    for (const s of samples) {
      let valid = true;
      try { JSON.parse(s); } catch { valid = false; }
      expect(findJsonErrorOffset(s) === undefined).toBe(valid);
    }
    expect(syntaxPosition('{\n  "a": 1,\n  "b": ,\n}', new Error('x'))).toEqual({ line: 3, column: 8 });
    expect(syntaxPosition('{ "x": [', new Error('Unexpected end of JSON input'))).toEqual({ line: 1, column: 9 });
  });
  it('FR-303 AC-846 壊れた JSON は、ファイル名と行・桁が示され、ほかのファイルの検証は続く', () => {
    const files = readUpload(MONO).map((f) => (f.name.endsWith('mocks.json') ? { ...f, text: '{\n  "a": 1,\n  "b": ,\n}' } : f.name.endsWith('issues.json') ? { ...f, text: '{ "x": [' } : f));
    const up = validateUpload(classifyFiles(files));
    const syn = up.errors.filter((e) => e.code === 'json-syntax');
    expect(syn.map((e) => e.file).sort()).toEqual(['public/data/issues.json', 'public/data/mocks.json']);
    const mocks = syn.find((e) => e.file.endsWith('mocks.json'))!;
    expect(mocks.line).toBe(3);
    expect(mocks.message).toContain('mocks.json');
    expect(up.ok).toBe(false);
    // 壊れたファイルは「欠け」ではない。ほかのファイルは検証され続け、存在しない ID の誤判定は出さない
    expect(up.errors.some((e) => e.code === 'missing-file')).toBe(false);
    expect(up.errors.some((e) => e.code === 'dangling-reference')).toBe(false);
  });

  // FR-303 AC-848
  it('FR-303 AC-848 未知の ID への参照と ID の重複は、参照元のファイル・位置・参照先の ID つきで示され、直すと取り込める', () => {
    const issues = jsonOf('public/data/issues.json');
    const list = Object.values(issues).find(Array.isArray) as any[];
    const victim = list.find((i) => Array.isArray(i.productIds) && i.productIds.length > 0) ?? list[0];
    const orig = JSON.parse(JSON.stringify(victim.productIds ?? null));
    victim.productIds = ['prod-zzz-unknown'];
    const dir = packDir({ 'public/data/issues.json': JSON.stringify(issues) });
    const { up } = expectSameAsCli(dir);
    const dangling = up.errors.find((e) => e.code === 'dangling-reference') as UploadError;
    expect(dangling.file).toBe('public/data/issues.json');
    expect(dangling.path).toContain('productIds');
    expect(dangling.id).toBe(victim.id);
    expect(dangling.message).toContain('prod-zzz-unknown');
    expect(up.ok).toBe(false);

    // 重複
    const dup = jsonOf('public/data/issues.json');
    const dl = Object.values(dup).find(Array.isArray) as any[];
    dl[1].id = dl[0].id;
    const { up: upDup } = expectSameAsCli(packDir({ 'public/data/issues.json': JSON.stringify(dup) }));
    expect(upDup.errors.some((e) => e.code === 'duplicate-id' && e.id === dl[0].id)).toBe(true);

    // 直したファイルを選び直す → エラーが消えて取り込める
    victim.productIds = orig ?? undefined;
    const fixedDir = packDir({ 'public/data/issues.json': JSON.stringify(jsonOf('public/data/issues.json')) });
    const files = readUpload(fixedDir);
    const again = validateUpload(classifyFiles(files));
    expect(again.errors).toEqual([]);
    expect(again.ok).toBe(true);
  });

  // FR-303 AC-850（選び直しで古い結果が残らない。純関数なので、同じ入力から毎回新しい結果が返る）
  it('FR-303 AC-850 選び直すたびに最新の入力だけで検証され、古い結果は残らない', () => {
    const good = readUpload(MONO);
    const bad = good.filter((f) => !f.name.endsWith('issues.json'));
    const a = validateUpload(classifyFiles(bad));
    const b = validateUpload(classifyFiles(good));
    const c = validateUpload(classifyFiles(bad));
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
    expect(b.errors).toEqual([]);
    expect(c.errors.map(key)).toEqual(a.errors.map(key));
  });

  it('FR-303 サイズ超過（5MB 超）は拒否され、中身は読まれない', () => {
    const files = readUpload(MONO).map((f) => (f.name.endsWith('issues.json') ? { ...f, size: MAX_FILE_BYTES + 1 } : f));
    const c = classifyFiles(files);
    expect(c.oversize.map((o) => o.name)).toEqual(['public/data/issues.json']);
    const up = validateUpload(c);
    expect(up.errors.map((e) => e.code)).toEqual(['file-too-large']);
    expect(up.errors[0]!.file).toBe('public/data/issues.json');
    expect(up.ok).toBe(false);
    // ちょうど上限は通る
    expect(classifyFiles(readUpload(MONO).map((f) => ({ ...f, size: MAX_FILE_BYTES }))).oversize).toEqual([]);
  });

  it('FR-303 判別不能・重複したファイルを分けて返す（重複は取り込めない、判別不能は警告）', () => {
    const files = [...readUpload(MONO), { name: 'メモ.txt', text: 'x' }, { name: 'other/issues.json', text: '{}' }];
    const c = classifyFiles(files);
    expect(c.unknown).toEqual(['メモ.txt']);
    expect(c.duplicates.map((d) => d.slot)).toEqual(['issues']);
    const up = validateUpload(c);
    expect(up.errors.some((e) => e.code === 'duplicate-file' && e.file === 'public/data/issues.json')).toBe(true);
    expect(up.errors.some((e) => e.code === 'missing-file')).toBe(false);
    expect(up.warnings.some((w) => w.includes('メモ.txt'))).toBe(true);
  });

  // FR-303 AC-849（判定部分）
  it('FR-303 AC-849 4 項目の合否・無効にする項目・起動して判定する項目の注意を返す', () => {
    const up = validateUpload(classifyFiles(readUpload(MONO)));
    expect(up.checks.map((c) => c.id)).toEqual(['schema', 'primary', 'names', 'sources']);
    expect(up.checks.every((c) => c.ok)).toBe(true);
    expect(up.notJudged).toContain('起動');
    const issues = jsonOf('public/data/issues.json');
    const list = Object.values(issues).find(Array.isArray) as any[];
    list[0].parentId = 'no-such-id';
    const bad = validateUpload(classifyFiles(readUpload(MONO).map((f) => (f.name.endsWith('issues.json') ? { ...f, text: JSON.stringify(issues) } : f))));
    expect(bad.disabledIds).toContain(list[0].id);
  });
});

describe('FR-304 取り込み前に人が確かめること', () => {
  const ok = () => validateUpload(classifyFiles(readUpload(MONO)));

  // FR-304 AC-851
  it('FR-304 AC-851 検証エラーがあるときは確認事項を出さない。ないときは確認事項を返す（出典のない数値は確認欄の対象ではない）', () => {
    const bad = validateUpload(classifyFiles(readUpload(MONO).filter((f) => !f.name.endsWith('issues.json'))));
    expect(reviewUpload(bad)).toBeUndefined();
    const r = reviewUpload(ok())!;
    expect(Object.keys(r).sort()).toEqual(['classification', 'logo', 'people']);
  });

  it('FR-304 AC-851 出典のない数値があれば検証エラーで取り込めず、確認事項には出さない（位置は検証の結果に出る）', () => {
    const v = ok();
    const data = JSON.parse(JSON.stringify(v.data));
    const strip = (o: any): boolean => {
      if (Array.isArray(o)) return o.some(strip);
      if (o && typeof o === 'object') {
        if (typeof o.value === 'number' && Array.isArray(o.sourceIds)) { delete o.sourceIds; return true; }
        return Object.values(o).some(strip);
      }
      return false;
    };
    if (!strip(data)) return;
    expect(Object.keys(reviewItems(data, v.brand!))).not.toContain('unsourced');
    const files = readUpload(MONO).map((f) => (/public\/data\/(\w+)\.json$/.test(f.name) ? { ...f, text: JSON.stringify(data[f.name.replace(/^.*\/(\w+)\.json$/, '$1')]) } : f));
    const up = validateUpload(classifyFiles(files));
    expect(up.ok).toBe(false);
    expect(reviewUpload(up)).toBeUndefined();
    expect(up.errors.some((e) => e.code === 'missing-source')).toBe(true);
  });

  // FR-304 AC-852
  it('FR-304 AC-852 internal・shareable の件数は countInternal と一致し、internal があるときだけ匿名化の注意がつく', () => {
    const v = ok();
    const r = reviewItems(v.data!, v.brand!);
    expect(r.classification.internal).toBe(countInternal(v.data));
    expect(r.classification.note === undefined).toBe(r.classification.internal === 0);
    const data = JSON.parse(JSON.stringify(v.data));
    data.sources.sources.push({ id: 'src-t1', createdBy: 'ai', kind: 'workiq', title: 't', retrievedAt: '2026-01-01', confidence: 'high', classification: 'internal' });
    data.sources.sources.push({ id: 'src-t2', createdBy: 'ai', kind: 'workiq', title: 't', retrievedAt: '2026-01-01', confidence: 'high', classification: 'shareable' });
    const r2 = reviewItems(data, v.brand!);
    expect(r2.classification.internal).toBe(r.classification.internal + 1);
    expect(r2.classification.shareable).toBe(r.classification.shareable + 1);
    expect(r2.classification.note).toContain('エクスポート');
    expect(r2.classification.note).toContain('自動');
  });

  // FR-304 AC-853
  it('FR-304 AC-853 ロゴの利用条件が unknown のときは件数と取り込み後に確かめる旨、confirmed のときは確認済み', () => {
    const v = ok();
    const known = reviewItems(v.data!, { ...v.brand!, logo: { ...v.brand!.logo, status: 'confirmed' } });
    expect(known.logo.unknownCount).toBe(0);
    expect(known.logo.note).toContain('確認済み');
    const unk = reviewItems(v.data!, { ...v.brand!, logo: { ...v.brand!.logo, status: 'unknown' } });
    expect(unk.logo.unknownCount).toBe(1);
    expect(unk.logo.note).toContain('取り込み後');
    expect(unk.logo.note).toContain('LOGO（要許諾確認）');
  });

  // FR-304 AC-854（件数・注意の判定部分）
  it('FR-304 AC-854 種別「人」は件数と注意だけで、個人名・連絡先の値は含まない。含まないパックでは注意が出ない', () => {
    const v = ok();
    const data = JSON.parse(JSON.stringify(v.data));
    const none = reviewItems(data, v.brand!);
    const base = none.people.count;
    data.entities.entities.push({ id: 'ent-person-t', createdBy: 'ai', world: 'real', kind: 'person', name: '山田太郎秘密', note: 'taro@example.com' });
    const r = reviewItems(data, v.brand!);
    expect(r.people.count).toBe(base + 1);
    expect(r.people.note).toContain('顧客の了承');
    expect(JSON.stringify(r)).not.toContain('山田太郎秘密');
    expect(JSON.stringify(r)).not.toContain('taro@example.com');
    if (base === 0) expect(none.people.note).toBeUndefined();
  });
});

describe('FR-302 判別できないファイル・保存する原本', () => {
  // FR-302 AC-838
  it('FR-302 AC-838 判別できないファイルは対象から外して名前を示し、残りが検証を通れば取り込める', () => {
    const files = [...readUpload(MONO), { name: 'logo.png', text: 'binary' }, { name: 'memo.json', text: '{"unrelated":true}' }];
    const c = classifyFiles(files);
    expect([...c.unknown, ...c.assets].sort()).toEqual(['logo.png', 'memo.json']);
    const up = validateUpload(c);
    expect(up.ok).toBe(true);
    expect(up.warnings.some((w) => w.includes('memo.json'))).toBe(true);
  });

  // FR-302 AC-841・843
  it('FR-302 AC-841 AC-843 保存する原本は、お手本パックの JSON と一致する（無効化の前・互換データも削らない）', () => {
    const up = validateUpload(classifyFiles(readUpload(MONO)));
    expect(up.ok).toBe(true);
    for (const n of ['customer', 'entities', 'issues', 'products', 'plan', 'architecture', 'mocks', 'show', 'sources']) {
      expect((up.data as any)[n], n).toEqual(jsonOf(`public/data/${n}.json`));
    }
    expect(up.brand).toEqual(jsonOf('public/brand/brand-profile.json'));
  });
});