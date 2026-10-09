// ⑥ verify（顧客パックの受け入れ判定。FR-127）の結合テスト。
// 実際のブラウザー（Playwright の Chromium。`tests/system` の `npm install` と `npx playwright install chromium` が前提）で、
// 契約（tests/system/CONTRACT.md §4）どおりの画面を持つ小さな代用のアプリ（スタブ）と、実際のアプリ（dist/）を検査する。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import { PARAMS } from '../../scripts/pipeline/common';
import { VERIFY_ITEMS, formatVerifyReport, main as verifyMain, mockSmoke, verifyPack, type SmokeRunner } from '../../scripts/pipeline/verify';
import { buildBrandTheme } from '../../src/theme/brandTheme';
import { contrastRatio } from '../../src/theme/brand';

vi.setConfig({ testTimeout: 90_000 }); // 実際のブラウザーを起動する試験がある（verify の上限は 1 分）

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-verify-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const MAIN = ['canvas', 'issue-solution', 'priority', 'knowledge-graph', 'architecture', 'discussion-tree', 'gantt', 'whiteboard', 'settings'];

/** 契約どおりの画面を持つ、小さな代用のアプリ（P・M・Esc、9 つの主要画面とチャット、保存と読み込み、Primary 色の反映） */
function stubApp(primary: string, opts: { screens?: string[]; mute?: boolean } = {}): string {
  const screens = opts.screens ?? MAIN;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>stub</title></head><body>
<div class="fui-FluentProvider" id="provider" style="--colorBrandBackground:${primary}">
<div data-testid="opening" role="dialog" id="opening"></div>
<header><button data-testid="animation-state" id="anim">アニメーション: 再生中</button>
${opts.mute === false ? '' : '<div data-testid="show-control-bar"><button aria-label="ミュート" aria-pressed="true" id="mute">ミュート</button></div>'}
<button id="save">保存</button><input type="file" data-testid="memo-file-input" id="file" hidden>
<div id="notice"></div></header>
<nav>${[...screens, 'chat'].map((k) => `<button data-testid="nav-${k}" data-k="${k}">${k}</button>`).join('')}</nav>
<main data-testid="workspace" id="ws" style="min-height:60px"></main><div id="dialog"></div></div>
<script>
(async () => {
  const c = await (await fetch('/data/customer.json')).json();
  document.title = c.name + ' ' + c.projectName;
  document.getElementById('opening').innerHTML = '<h1>' + c.name + '</h1><p>' + c.projectName + '</p>';
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('opening')?.remove();
    if (e.key === 'p') { const a = document.getElementById('anim'); a.textContent = a.textContent.includes('再生中') ? 'アニメーション: 停止中' : 'アニメーション: 再生中'; }
    if (e.key === 'm') { const m = document.getElementById('mute'); if (m) m.setAttribute('aria-pressed', m.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); }
  });
  for (const b of document.querySelectorAll('nav button')) b.addEventListener('click', () => {
    const k = b.dataset.k;
    const ws = document.getElementById('ws');
    if (k === 'chat') {
      ws.innerHTML = '<section data-testid="component-chat"><label>質問<input type="text" aria-label="質問"></label><button id="send">送信</button><div id="answers"></div></section>';
      document.getElementById('send').onclick = () => { const d = document.createElement('div'); d.setAttribute('data-testid', 'chat-answer'); d.textContent = 'AI 生成（モック）: 回答'; document.getElementById('answers').append(d); };
    } else ws.innerHTML = '<section data-testid="component-' + k + '"><h2>' + k + '</h2><span>サンプル</span></section>';
  });
  document.getElementById('save').onclick = () => {
    document.getElementById('dialog').innerHTML = '<div role="dialog" aria-label="議論データを保存"><button id="do-save">保存</button></div>';
    document.getElementById('do-save').onclick = () => {
      const blob = new Blob(['---\\nname: memo\\n---\\n\\n\`\`\`json\\n{"a":1}\\n\`\`\`\\n'], { type: 'text/markdown' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'memo.md'; document.body.append(a); a.click(); a.remove();
      document.getElementById('dialog').innerHTML = '';
    };
  };
  document.getElementById('file').addEventListener('change', async (e) => {
    const t = await e.target.files[0].text();
    const n = document.createElement('div'); n.setAttribute('data-testid', 'file-notice');
    const ok = t.includes('\`\`\`json');
    n.setAttribute('role', ok ? 'status' : 'alert'); n.textContent = ok ? '復元しました' : '読み込めませんでした';
    document.getElementById('notice').replaceChildren(n);
  });
})();
</script></body></html>`;
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

/** お手本パック（examples/mono）の複製と、その上に置く `dist/index.html`（appHtml） */
function makeWorkDir(appHtml: string): string {
  const wd = path.join(tmp, 'work');
  copyDir(path.join(REPO_ROOT, 'examples', 'mono'), wd);
  fs.mkdirSync(path.join(wd, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(wd, 'dist', 'index.html'), appHtml);
  return wd;
}

const readJson = (f: string): any => JSON.parse(fs.readFileSync(f, 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any
const writeJson = (f: string, v: unknown): void => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8');
const primaryOf = (wd: string): string => readJson(path.join(wd, 'public', 'brand', 'brand-profile.json')).colors.primary as string;
const effectiveOf = (primary: string): string => buildBrandTheme('light', primary).effectivePrimary;
const byId = (r: Awaited<ReturnType<typeof verifyPack>>) => Object.fromEntries(r.items.map((i) => [i.id, i]));

describe('FR-127 verify（顧客パックの受け入れ判定）', () => {
  // FR-127 AC-154
  it('FR-127 AC-154 お手本パックで verify を実行すると、9 項目の判定がすべて合格し、PARAM-020 以内に終わる', async () => {
    expect(PARAMS.verifyLimitSec).toBe(60); // PARAM-020: 1 分
    const wd = makeWorkDir('');
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp(effectiveOf(primaryOf(wd))));
    const r = await verifyPack({ workDir: wd });
    expect(r.items.map((i) => i.id)).toEqual(VERIFY_ITEMS.map((i) => i.id));
    expect(r.items).toHaveLength(9);
    expect(r.items.filter((i) => !i.ok).map((i) => `${i.name}: ${i.detail}`)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.elapsedMs).toBeLessThanOrEqual(PARAMS.verifyLimitSec * 1000);
    expect(r.warnings).toEqual([]); // お手本の Primary 色は AA を満たす
    expect(formatVerifyReport(r)[0]).toContain('合格');
  });

  // FR-127 AC-155
  it('FR-127 AC-155 Primary 色のコントラストが不足し、sourceIds のない数値が 1 件あるパックでは、出典の項目が不合格で原因と対処が出て、0 以外の終了コードになる。コントラストは補正後の実効色で合格し、元の値の警告が出る', async () => {
    const wd = makeWorkDir('');
    const LOW = '#FFEB3B'; // 白い文字との比が AA（4.5）に足りない黄色
    const brandFile = path.join(wd, 'public', 'brand', 'brand-profile.json');
    const brand = readJson(brandFile);
    brand.colors.primary = LOW;
    writeJson(brandFile, brand);
    const issuesFile = path.join(wd, 'public', 'data', 'issues.json');
    const issues = readJson(issuesFile);
    delete issues.issues[0].evaluation.cost.sourceIds; // 数値項目から出典を外す
    writeJson(issuesFile, issues);
    const effective = effectiveOf(LOW);
    expect(effective.toUpperCase()).not.toBe(LOW);
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp(effective));

    const r = await verifyPack({ workDir: wd });
    const it = byId(r);
    expect(r.ok).toBe(false);
    // 出典の項目: 不合格で、原因（どの項目か）と対処がある
    expect(it['sources']!.ok).toBe(false);
    expect(it['sources']!.detail).toContain('issues.json');
    expect(it['sources']!.detail).toContain('issues[0].evaluation.cost');
    expect(it['sources']!.remedy).toContain('sourceIds');
    // コントラストの項目: 補正後の実効色で判定して合格
    expect(it['primary']!.ok, it['primary']!.detail).toBe(true);
    expect(it['schema']!.ok).toBe(true); // 出典の欠落は、出典の項目で数える
    // 元の値の不足は、元の値・補正後の値・比を添えた警告
    const before = contrastRatio(LOW, '#FFFFFF');
    const warn = r.warnings.join('\n');
    expect(warn).toContain(LOW);
    expect(warn).toContain(effective);
    expect(warn).toContain(before.toFixed(2));
    expect(warn).toContain(contrastRatio(effective, '#FFFFFF').toFixed(2));
    const report = formatVerifyReport(r).join('\n');
    expect(report).toMatch(/原因: .*issues\.json/);
    expect(report).toContain('対処:');
    expect(report).toContain('警告:');
    // コマンド（npm run verify:pack）の終了コード: 不合格は 1
    const out: string[] = [];
    expect(await verifyMain([wd], (l) => out.push(l))).toBe(1);
    expect(out.join('\n')).toContain('不合格');
  });

  it('FR-127 AC-155 補正が要らない（AA を満たす）Primary 色では警告が出ず、画面に補正後でない色が反映される', async () => {
    const wd = makeWorkDir('');
    expect(effectiveOf(primaryOf(wd)).toUpperCase()).toBe(primaryOf(wd).toUpperCase());
    // 画面に別の色が出ているアプリは、Primary 色の項目が不合格
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp('#FF00FF'));
    const r = await verifyPack({ workDir: wd });
    expect(r.warnings).toEqual([]);
    expect(byId(r)['primary']!.ok).toBe(false);
    expect(byId(r)['primary']!.detail).toContain('#FF00FF');
  });

  // FR-127 AC-154（失敗した場合は原因と対処を出力する）
  it('FR-127 AC-154 P・M・主要画面・顧客名のどれかが壊れていると、該当の項目だけが不合格になり、原因と対処が出る', async () => {
    const wd = makeWorkDir('');
    // M（ミュートのボタン）がなく、主要画面が 2 つ足りないアプリ
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp(effectiveOf(primaryOf(wd)), { mute: false, screens: MAIN.filter((k) => k !== 'gantt' && k !== 'priority') }));
    const r = await verifyPack({ workDir: wd });
    const it = byId(r);
    expect(it['keys']!.ok).toBe(false);
    expect(it['keys']!.detail).toContain('M で');
    expect(it['labels']!.ok).toBe(false);
    expect(it['labels']!.detail).toContain('ガントチャート');
    expect(it['labels']!.detail).toContain('優先順位分析');
    for (const id of ['schema', 'page-errors', 'primary', 'names', 'sources', 'markdown', 'time']) expect(it[id]!.ok, `${id}: ${it[id]!.detail}`).toBe(true);
    const report = formatVerifyReport(r).join('\n');
    expect(report).toMatch(/✗ 6\./);
    expect(report).toMatch(/✗ 7\./);
    expect(report).toContain('対処:');
  });

  it('FR-127 AC-154 起動時にページエラーを出すアプリは、ページエラーの項目が不合格になる', async () => {
    const wd = makeWorkDir('');
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp(effectiveOf(primaryOf(wd))).replace('<script>', '<script>setTimeout(() => { throw new Error("テスト用の例外"); }, 0);'));
    const r = await verifyPack({ workDir: wd });
    expect(byId(r)['page-errors']!.ok).toBe(false);
    expect(byId(r)['page-errors']!.detail).toContain('テスト用の例外');
  });

  it('FR-127 AC-154 顧客名・Project 名が入力と違うパックは、名前の項目が不合格になる', async () => {
    const wd = makeWorkDir('');
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), stubApp(effectiveOf(primaryOf(wd))));
    const r = await verifyPack({ workDir: wd, customer: '別の会社', projectName: '別の PJ' });
    expect(byId(r)['names']!.ok).toBe(false);
    expect(byId(r)['names']!.remedy).toContain('customer.json');
  });

  it('FR-127 AC-154 所要時間が PARAM-020 を超えたら、時間の項目が不合格になる', async () => {
    const wd = makeWorkDir('<title>x</title>');
    let t = 0;
    const r = await verifyPack({ workDir: wd, smoke: mockSmoke, clock: () => (t += 40_000) }); // 呼ぶたびに 40 秒進む時計
    expect(byId(r)['time']!.ok).toBe(false);
    expect(byId(r)['time']!.detail).toContain('上限 60 秒');
    expect(r.ok).toBe(false);
  });

  it('FR-127 AC-154 ブラウザーの検査を実行できないとき（例外）は、例外にせず、該当の 6 項目を不合格にして対処を出す', async () => {
    const wd = makeWorkDir('<title>x</title>');
    const broken: SmokeRunner = { run: async () => { throw new Error('Chromium が見つかりません'); } };
    const r = await verifyPack({ workDir: wd, smoke: broken });
    const failed = r.items.filter((i) => !i.ok).map((i) => i.id);
    expect(failed.sort()).toEqual(['keys', 'labels', 'markdown', 'names', 'page-errors', 'primary']);
    expect(byId(r)['keys']!.detail).toContain('Chromium が見つかりません');
    expect(byId(r)['keys']!.remedy).toContain('playwright install');
    // 顧客パックのファイルだけで判定できる 3 項目（スキーマ・出典・時間）は、ブラウザーなしでも判定される
    expect(byId(r)['schema']!.ok && byId(r)['sources']!.ok && byId(r)['time']!.ok).toBe(true);
  });

  it('FR-127 AC-154 dist がないときは、ブラウザーの項目が不合格になり、雛形のビルドを案内する', async () => {
    const wd = makeWorkDir('<title>x</title>');
    fs.rmSync(path.join(wd, 'dist'), { recursive: true });
    const r = await verifyPack({ workDir: wd, smoke: mockSmoke });
    expect(byId(r)['keys']!.ok).toBe(false);
    expect(byId(r)['keys']!.detail).toContain('dist/index.html');
    expect(byId(r)['keys']!.remedy).toContain('npm run build');
  });

  // FR-127 AC-154（実際のアプリ）
  it('FR-127 AC-154 実際のアプリ（dist/）でも、お手本パックの顧客名・Primary 色・出典・Markdown の保存と復元・ページエラーの項目が合格し、時間が上限以内', async () => {
    // dist は npm run build（verify の build コマンド）で作られる。ない環境では、この確認は失敗して知らせる
    expect(fs.existsSync(path.join(REPO_ROOT, 'dist', 'index.html')), 'dist/ がありません。先に npm run build を実行してください').toBe(true);
    const wd = path.join(tmp, 'real');
    copyDir(path.join(REPO_ROOT, 'examples', 'mono'), wd);
    copyDir(path.join(REPO_ROOT, 'dist'), path.join(wd, 'dist'));
    const r = await verifyPack({ workDir: wd });
    const it = byId(r);
    // 主要画面（FR-008 の全画面）と M（FR-074）は、後続の項目が揃うまで合格しないので、ここでは確かめない
    for (const id of ['schema', 'page-errors', 'primary', 'names', 'sources', 'markdown', 'time']) {
      expect(it[id]!.ok, `${it[id]!.name}: ${it[id]!.detail}`).toBe(true);
    }
    expect(r.elapsedMs).toBeLessThanOrEqual(PARAMS.verifyLimitSec * 1000);
  }, 90_000);
});
