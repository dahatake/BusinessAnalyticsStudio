// FR-052〜FR-055 エクスポート（全量・出力範囲・匿名化・ZIP・フォローアップ文書）の単体・結合テスト
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDiscussionMemo } from '../../src/discussion/memo';
import { createTheme, type Theme } from '../../src/discussion/model';
import { buildExport, countInternal, NOT_APPLICABLE, SECTIONS, type ExportOptions, type ExportInput } from '../../src/export/build';
import { diffThemes } from '../../src/export/changelog';
import { isExportShortcut } from '../../src/export/commands';
import { parsePreview } from '../../src/export/MarkdownPreview';
import { createZip, readZip } from '../../src/export/zip';
import { createBoard } from '../../src/ink/model';
import { ANONYMIZED_LABEL, type PackData } from '../../src/schema';
import { REPO_ROOT, readPackFiles } from '../../scripts/lib/pack-fs';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const mono = clone(readPackFiles(path.join(REPO_ROOT, 'examples', 'mono'))) as unknown as PackData;
const TOKEN = 'ZX417-社内限定テスト値';
const NOW = new Date('2026-10-09T10:00:00+09:00');

const theme = (init: Partial<Theme> & { title: string }): Theme => createTheme(init);
const decided = theme({ title: '導入方針', status: 'decided', decisions: '決定UT: 段階導入で進める', openIssues: '未決UT: 予算の上限', options: '選択肢UT: A/B',
  actions: [{ id: 'act-1', text: '見積もりを依頼', owner: '営業', due: '2026-11-01' }] });

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  customerName: mono.customer.name, projectName: mono.customer.projectName, data: mono, themes: [decided], boards: [], changes: [], now: NOW, ...over,
});
const opts = (over: Partial<ExportOptions> = {}): ExportOptions => ({ scope: 'all', anonymize: false, format: 'md', followUp: false, ...over });

function withInternal(): PackData {
  const d = clone(mono);
  d.issues.issues.push({
    id: 'issue-ut-internal-001', createdBy: 'human', classification: 'internal', sourceIds: [d.sources.sources[0]!.id], audience: 'internal',
    title: `社内課題 ${TOKEN}`, hypothesis: `仮説 ${TOKEN}`,
  } as PackData['issues']['issues'][number]);
  return d;
}

describe('FR-053 エクスポートの出力内容', () => {
  // FR-053 AC-065
  it('FR-053 AC-065 お手本パックの全量 Markdown に 15 種類の節の見出しがすべてあり、各節が空でない', () => {
    const md = buildExport(input({ boards: [], changes: [] }), opts()).markdown;
    expect(SECTIONS).toHaveLength(15);
    const parts = md.split(/^## /m);
    for (const s of SECTIONS) {
      const part = parts.find((p) => p.startsWith(`${s.title}\n`));
      expect(part, `節「${s.title}」の見出しがない`).toBeTruthy();
      const body = part!.slice(s.title.length).replace(/^\s+/, '');
      expect(body.trim().length, `節「${s.title}」が空`).toBeGreaterThan(0);
    }
  });

  // FR-053 AC-065
  it('FR-053 AC-065 データが 0 件の節は「該当なし」と書かれる', () => {
    const empty = clone(mono);
    empty.issues = { issues: [], solutions: [] } as PackData['issues'];
    empty.plan = { features: [], tasks: [] } as PackData['plan'];
    empty.architecture = { nodes: [], edges: [] } as PackData['architecture'];
    empty.products = { products: [] } as PackData['products'];
    empty.sources = { sources: [] } as PackData['sources'];
    const md = buildExport(input({ data: empty, themes: [] }), opts()).markdown;
    for (const title of ['調査データと出典', '課題-解決策マトリクスと優先順位', '参考文献', 'テーマ別の議論', 'アーキテクチャ', 'Microsoft 製品', 'ガント表', 'ホワイトボード', '変更履歴']) {
      const part = md.split(/^## /m).find((p) => p.startsWith(`${title}\n`));
      expect(part, title).toBeTruthy();
      expect(part).toContain(NOT_APPLICABLE);
    }
  });

  // FR-053 AC-065
  it('FR-053 AC-065 議論テーマ・ホワイトボード・変更履歴が各節に入る', () => {
    const board = createBoard('論点整理');
    board.items.push({ id: 'item-1', type: 'sticky', x: 0, y: 0, w: 100, h: 60, text: '付箋UT: 現場の声' });
    const changes = diffThemes([], [decided], '2026-10-09T01:00:00.000Z');
    const md = buildExport(input({ boards: [board], changes }), opts({ format: 'zip' })).markdown;
    expect(md).toContain('決定UT: 段階導入で進める');
    expect(md).toContain('付箋UT: 現場の声');
    expect(md).toContain('議論テーマを追加');
    expect(md).toContain('```mermaid');
  });

  // FR-053 FR-056 AC-065
  it('FR-053 AC-065 全体の Markdown は front matter と JSON ブロックを持ち、議論メモとして読み込める', () => {
    const md = buildExport(input(), opts()).markdown;
    expect(md.startsWith('---')).toBe(true);
    const r = parseDiscussionMemo(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.discussion.themes[0]?.decisions).toContain('決定UT');
  });
});

describe('FR-054 出力範囲・プレビュー・機密確認・形式', () => {
  // FR-054 AC-066
  it('FR-054 AC-066 範囲を「決定事項のみ」にするとプレビューは決定事項の節だけになる', () => {
    const r = buildExport(input(), opts({ scope: 'decisions' }));
    const headings = parsePreview(r.preview).filter((b) => b.t === 'h').map((b) => (b as { text: string }).text);
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) expect(h).toMatch(/決定事項|テーマ/);
    expect(r.preview).toContain('決定UT: 段階導入で進める');
    expect(r.preview).not.toContain('未決UT');
    expect(r.preview).not.toContain('選択肢UT');
  });

  // FR-054 AC-066
  it('FR-054 AC-066 画面別・テーマ別の範囲は、その範囲の節だけを出す', () => {
    const g = buildExport(input(), opts({ scope: 'screen', screenKey: 'gantt' })).preview;
    expect(g).toContain('## ガント表');
    expect(g).not.toContain('## 参考文献');
    const other = theme({ title: '別のテーマ', decisions: '別の決定' });
    const t = buildExport(input({ themes: [decided, other] }), opts({ scope: 'theme', themeId: other.id })).preview;
    expect(t).toContain('別の決定');
    expect(t).not.toContain('決定UT');
  });

  // FR-054 AC-066
  it('FR-054 AC-066 internal を含むデータで匿名化を ON にすると、出力物に internal の値が含まれず置き換えた旨の表記がある', () => {
    const data = withInternal();
    expect(countInternal(data)).toBe(1);
    // 課題から作ったテーマ（利用者の入力も元の機密を引き継ぐ）
    const t = theme({ title: `社内課題 ${TOKEN}`, issueId: 'issue-ut-internal-001', decisions: `決定 ${TOKEN}` });
    const r = buildExport(input({ data, themes: [t], changes: diffThemes([], [t]) }), opts({ anonymize: true, format: 'zip', followUp: true }));
    for (const f of r.files) expect(f.content, `${f.path} に internal の値がある`).not.toContain(TOKEN);
    expect(r.markdown).not.toContain(TOKEN);
    expect(r.preview).not.toContain(TOKEN);
    expect(r.markdown).toContain(ANONYMIZED_LABEL);
    expect(r.preview).toContain(`${ANONYMIZED_LABEL}」に置き換えています`);
    expect(r.anonymized).toBe(true);
  });

  // FR-054 AC-066
  it('FR-054 AC-066 匿名化を OFF にすると internal の値を含む（対照）', () => {
    const r = buildExport(input({ data: withInternal() }), opts({ anonymize: false }));
    expect(r.preview).toContain(TOKEN);
    expect(r.internalCount).toBe(1);
  });

  // FR-054 AC-067
  it('FR-054 AC-067 .zip は .md と assets/ の画像を含み、.md の画像リンクが ZIP 内の相対パスを指す', () => {
    const r = buildExport(input({ boards: [(() => { const b = createBoard('図'); b.items.push({ id: 'i', type: 'text', x: 0, y: 0, w: 50, h: 20, text: '文字' }); return b; })()] }), opts({ format: 'zip' }));
    expect(r.fileName).toMatch(/\.zip$/);
    const zip = readZip(createZip(r.files, NOW));
    const names = zip.map((e) => e.path);
    const mds = names.filter((n) => n.endsWith('.md'));
    const imgs = names.filter((n) => /^assets\/.+\.svg$/.test(n));
    expect(mds.length).toBeGreaterThan(0);
    expect(imgs.length).toBeGreaterThan(0);
    let links = 0;
    for (const m of mds) {
      const text = new TextDecoder().decode(zip.find((e) => e.path === m)!.content as Uint8Array);
      for (const [, href] of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
        links++;
        expect(href).not.toMatch(/^(\/|[a-z]+:)/i);
        expect(names).toContain(path.posix.normalize(path.posix.join(path.posix.dirname(m), href!)));
      }
    }
    expect(links).toBeGreaterThan(0);
    const svg = new TextDecoder().decode(zip.find((e) => e.path === 'assets/architecture.svg')!.content as Uint8Array);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  // FR-054 AC-067
  it('FR-054 AC-067 .md は 1 ファイルで、画像のリンクを含まない', () => {
    const r = buildExport(input(), opts({ format: 'md' }));
    expect(r.fileName).toMatch(/\.md$/);
    expect(r.markdown).not.toMatch(/!\[[^\]]*\]\(/);
    expect(r.markdown).toContain('```mermaid');
  });

  // FR-052 AC-064
  it('FR-052 AC-064 ZIP は PK で始まり、日本語のファイル名・内容を壊さずに読める', () => {
    const bytes = createZip([{ path: 'followup/次回アジェンダ.md', content: '# 次回アジェンダ\n日本語' }, { path: 'assets/a.svg', content: '<svg/>' }], NOW);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
    const back = readZip(bytes);
    expect(back.map((e) => e.path)).toEqual(['followup/次回アジェンダ.md', 'assets/a.svg']);
    expect(new TextDecoder().decode(back[0]!.content as Uint8Array)).toBe('# 次回アジェンダ\n日本語');
  });

  // FR-052 AC-064
  it('FR-052 AC-064 Ctrl+S と Ctrl+Shift+E がエクスポートのショートカットで、修飾キーなしや別のキーは違う', () => {
    const k = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
    expect(isExportShortcut(k('s', { ctrlKey: true }))).toBe(true);
    expect(isExportShortcut(k('E', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isExportShortcut(k('e', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(isExportShortcut(k('e', { ctrlKey: true }))).toBe(false);
    expect(isExportShortcut(k('s'))).toBe(false);
    expect(isExportShortcut(k('s', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('FR-055 フォローアップ文書', () => {
  // FR-055 AC-068
  it('FR-055 AC-068 フォローアップ文書の生成を選ぶと 3 種類の文書が出力に含まれ、未決事項と決定事項がそれぞれに載る', () => {
    const r = buildExport(input(), opts({ format: 'zip', followUp: true }));
    const f = (re: RegExp) => r.files.find((x) => re.test(x.path));
    const agenda = f(/次回アジェンダ/), requests = f(/確認依頼事項/), summary = f(/合意事項サマリー/);
    expect(agenda && requests && summary).toBeTruthy();
    expect(requests!.content).toContain('未決UT: 予算の上限');
    expect(requests!.content).not.toContain('決定UT');
    expect(summary!.content).toContain('決定UT: 段階導入で進める');
    expect(summary!.content).not.toContain('未決UT');
    expect(agenda!.content).toContain('未決UT');
    expect(agenda!.content).toContain('見積もりを依頼');
  });

  // FR-055 AC-068
  it('FR-055 AC-068 .md のときは 3 種類の文書を末尾に続ける。選ばなければ含まない', () => {
    const on = buildExport(input(), opts({ followUp: true })).markdown;
    for (const t of ['次回アジェンダ', '顧客への確認依頼事項', '合意事項サマリー']) expect(on).toContain(`# ${t}`);
    const off = buildExport(input(), opts({ followUp: false }));
    expect(off.markdown).not.toContain('# 次回アジェンダ');
    expect(off.files.some((x) => x.path.startsWith('followup/'))).toBe(false);
  });

  // FR-055 AC-068
  it('FR-055 AC-068 未決事項・決定事項がないときは「該当なし」と書く', () => {
    const r = buildExport(input({ themes: [] }), opts({ format: 'zip', followUp: true }));
    expect(r.files.find((x) => /確認依頼事項/.test(x.path))!.content).toContain(NOT_APPLICABLE);
    expect(r.files.find((x) => /合意事項サマリー/.test(x.path))!.content).toContain(NOT_APPLICABLE);
  });
});

describe('FR-053 変更履歴', () => {
  // FR-053 AC-065
  it('FR-053 AC-065 テーマの追加・変更・削除を差から記録する', () => {
    const changed: Theme = { ...decided, status: 'on-hold', title: '導入方針（改）' };
    const d = diffThemes([decided], [changed]);
    expect(d).toHaveLength(1);
    expect(d[0]!.kind).toBe('changed');
    expect(d[0]!.detail).toContain('決定ステータス');
    expect(diffThemes([decided], []).map((e) => e.kind)).toEqual(['removed']);
    expect(diffThemes([], [decided]).map((e) => e.kind)).toEqual(['added']);
  });
});
