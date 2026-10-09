// 横断的な UX（NFR-UX-002〜005）と雛形の回帰テスト（NFR-MAINT-002）の単体・結合テスト。
// ブラウザーでの確認は System Test（tests/system/e2e の AC-186〜189）が受け持つ。ここでは判定の部品を直接確かめる。
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMPACT_MAX_PX, isCompactWidth, stackedLeaves } from '../../src/workspace/compact';
import { defaultLayout, keysOf, split, leaf, type Layout } from '../../src/workspace/layoutModel';
import { useTreeStore } from '../../src/store/tree';
import { deliver } from '../../src/export/deliver';
import { runSteps, defaultSteps, prepareVerifyDir, type RegressionStep } from '../../scripts/regression';
import type { PackData } from '../../src/schema';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';

describe('NFR-UX-002 狭い画面と高い拡大率での縮退', () => {
  // NFR-UX-002 AC-186
  it('NFR-UX-002 AC-186 縮退の確認の幅（PARAM-029: 320px）と、拡大率 200%（1600px → 800px）は縦積みの対象になる', () => {
    expect(isCompactWidth(320)).toBe(true);
    expect(isCompactWidth(800)).toBe(true);
    expect(isCompactWidth(COMPACT_MAX_PX - 1)).toBe(true);
  });

  // NFR-UX-002 AC-186
  it('NFR-UX-002 AC-186 広い画面（1280px 以上のワークスペース）と、測れていない幅（0・NaN）では縦積みにしない', () => {
    expect(isCompactWidth(COMPACT_MAX_PX)).toBe(false);
    expect(isCompactWidth(1380)).toBe(false);
    expect(isCompactWidth(0)).toBe(false);
    expect(isCompactWidth(Number.NaN)).toBe(false);
  });

  // NFR-UX-002 AC-186
  it('NFR-UX-002 AC-186 縦積みにしても、すべてのペルソナの既定のレイアウトのコンポーネントが欠けず、順序は上から下・左から右になる', () => {
    for (const p of ['経営層', '事業部門', 'IT', '現場'] as const) {
      const layout = defaultLayout(p);
      const stacked = stackedLeaves(layout).flatMap((l) => l.tabs);
      expect(stacked, p).toEqual(keysOf(layout));
    }
  });

  // NFR-UX-002 AC-186
  it('NFR-UX-002 AC-186 タブのまとまりは 1 つの単位のまま残り、空のレイアウトは何も積まない', () => {
    const layout: Layout = split('row', [{ kind: 'tabs', tabs: ['a', 'b'], active: 'b' }, split('col', [leaf('c'), leaf('d')])]);
    const leaves = stackedLeaves(layout);
    expect(leaves.map((l) => l.tabs)).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(leaves[0]!.active).toBe('b');
    expect(stackedLeaves(null)).toEqual([]);
  });
});

describe('NFR-UX-003 時間のかかる処理の進行表示', () => {
  const theme = { id: 'T1', title: '段階導入', decisions: '', options: '' } as never;
  const data = {} as PackData;

  // NFR-UX-003 AC-187
  it('NFR-UX-003 AC-187 生成中はジョブが立ち（進行表示の元）、取り消すとジョブが消えて、あとから返った結果は採用しない', async () => {
    let release: (v: { answer: string; mode: 'mock' | 'connected' }) => void = () => undefined;
    const ask = () => new Promise<{ answer: string; mode: 'mock' | 'connected' }>((res) => { release = res; });
    const p = useTreeStore.getState().generate('k-ux003', theme, data, ask);
    expect(useTreeStore.getState().job?.themeTitle).toBe('段階導入');
    // 生成中も、ほかの状態（別のキーの編集など）は読める
    expect(useTreeStore.getState().docs['k-ux003']).toBeUndefined();
    useTreeStore.getState().cancel();
    expect(useTreeStore.getState().job).toBeNull();
    release({ answer: '', mode: 'mock' });
    await p;
    expect(useTreeStore.getState().docs['k-ux003']).toBeUndefined();
    expect(useTreeStore.getState().error).toBeNull();
  });
});

describe('NFR-UX-004 エラーの原因と次の行動', () => {
  // NFR-UX-004 AC-188
  it('NFR-UX-004 AC-188 保存先への書き込みが失敗すると、原因（書き込み）と確認する対象が返る', async () => {
    const win = {
      showSaveFilePicker: async () => ({
        name: 'x.md',
        createWritable: async () => ({ write: async () => { throw new Error('NotAllowedError'); }, close: async () => undefined }),
      }),
    };
    vi.stubGlobal('window', win);
    try {
      const r = await deliver('x.md', 'データ', true);
      expect(r.ok).toBe(false);
      if (!r.ok && !r.cancelled) {
        expect(r.reason).toMatch(/書き込め/);
        expect(r.reason).toMatch(/権限|空き容量/);
        expect(r.reason).toContain('NotAllowedError');
      } else throw new Error('失敗の理由が返らない');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // NFR-UX-004 AC-188
  it('NFR-UX-004 AC-188 保存先を使わない渡し方（useFileSystem=false）はダウンロードに切り替わり、書き込み先の失敗に影響されない', async () => {
    const clicked: string[] = [];
    const a = { href: '', download: '', click: () => clicked.push(a.download), remove: () => undefined };
    vi.stubGlobal('window', { showSaveFilePicker: async () => { throw new Error('使われないはず'); } });
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild: () => undefined } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    try {
      const r = await deliver('x.zip', new Uint8Array([1, 2, 3]), false);
      expect(r).toEqual({ ok: true, method: 'download', name: 'x.zip' });
      expect(clicked).toEqual(['x.zip']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('NFR-UX-005 OS と利用者の表示設定への追従', () => {
  // NFR-UX-005 AC-189（resolveThemeName による OS 設定への追従は tests/unit/theme.test.ts の AC-071 で確かめる）
  it('NFR-UX-005 AC-189 テーマの既定の選択は system（OS の prefers-color-scheme に従う）', async () => {
    const { useSettings } = await import('../../src/store/settings');
    expect(useSettings.getState().themeMode).toBe('system');
  });
});

describe('NFR-MAINT-002 雛形の回帰テスト', () => {
  const step = (id: RegressionStep['id'], code: number, calls: string[]): RegressionStep => ({ id, name: id, run: () => { calls.push(id); return code; } });

  // NFR-MAINT-002 AC-183
  it('NFR-MAINT-002 AC-183 ビルド → お手本パックでの verify → 単体・結合テストの順に実行し、すべて合格すると 0', async () => {
    const calls: string[] = [];
    const r = await runSteps([step('build', 0, calls), step('verify-pack', 0, calls), step('unit', 0, calls)], () => undefined);
    expect(calls).toEqual(['build', 'verify-pack', 'unit']);
    expect(r.code).toBe(0);
  });

  // NFR-MAINT-002 AC-183
  it.each([['build'], ['verify-pack'], ['unit']] as const)('NFR-MAINT-002 AC-183 %s が失敗すると 0 以外で終わり、後の工程は実行しない', async (bad) => {
    const calls: string[] = [];
    const ids = ['build', 'verify-pack', 'unit'] as const;
    const r = await runSteps(ids.map((id) => step(id, id === bad ? 3 : 0, calls)), () => undefined);
    expect(r.code).not.toBe(0);
    expect(calls[calls.length - 1]).toBe(bad);
    expect(r.results.filter((x) => x.skipped).map((x) => x.id)).toEqual(ids.slice(ids.indexOf(bad) + 1));
  });

  // NFR-MAINT-002 AC-183
  it('NFR-MAINT-002 AC-183 工程が例外を投げても 0 以外で終わる', async () => {
    const r = await runSteps([{ id: 'build', name: 'b', run: () => { throw new Error('x'); } }], () => undefined);
    expect(r.code).not.toBe(0);
  });

  // NFR-MAINT-002 AC-183
  it('NFR-MAINT-002 AC-183 既定の工程は build・verify-pack・unit の順で、npm script（regression）から 1 コマンドで呼べる', () => {
    expect(defaultSteps().map((s) => s.id)).toEqual(['build', 'verify-pack', 'unit']);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.regression).toBe('tsx scripts/regression.ts');
    expect(pkg.scripts['verify:pack']).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
  });

  // NFR-MAINT-002 AC-183
  it('NFR-MAINT-002 AC-183 verify の作業フォルダーは、ビルド済みの dist/ がなければ作れない（ビルドの前に verify を通さない）', () => {
    fs.mkdirSync(path.join(REPO_ROOT, 'work'), { recursive: true });
    const tmp = fs.mkdtempSync(path.join(REPO_ROOT, 'work', 'regression-test-'));
    try {
      fs.cpSync(path.join(REPO_ROOT, 'examples', 'mono'), path.join(tmp, 'examples', 'mono'), { recursive: true });
      expect(() => prepareVerifyDir(tmp)).toThrow(/dist\/index\.html/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
