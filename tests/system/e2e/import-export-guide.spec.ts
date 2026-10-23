// System Test: 外部ファイルの取り込み・書き出しの対応形式のガイド（FR-288 AC-754〜756）。
// 期待値は要求定義書の受入基準だけから決める。文書の場所は決まっていないため、users-guide/README.md の表から索引された文書を探す（CONTRACT.md §26）。
// 画面は使わない（ファイルの検査）。AC-754・755 は要求定義書の検証レベルが manual のため、機械で確かめられる範囲（表・語・コードの位置）だけを見る。
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { REPO_ROOT } from '../support/paths';

const GUIDE_DIR = path.join(REPO_ROOT, 'users-guide');
const README = path.join(GUIDE_DIR, 'README.md');

/** README の表の行のうち、対応形式（取り込み・書き出し）を説明する行のリンク先 */
function findIndexRow(): { row: string; link: string } | null {
  const text = fs.readFileSync(README, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (!/取り込み/.test(line) || !/書き出し/.test(line)) continue;
    const m = line.match(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/);
    if (m) return { row: line, link: m[1] };
  }
  return null;
}

function guideText(): string {
  const idx = findIndexRow();
  expect(idx, 'users-guide/README.md の表に、取り込み・書き出しの対応形式の文書へのリンクがない').not.toBeNull();
  const file = path.resolve(GUIDE_DIR, idx!.link);
  expect(fs.existsSync(file), `リンク先が存在しない: ${idx!.link}`).toBe(true);
  return fs.readFileSync(file, 'utf8');
}

function sectionOf(text: string, heading: RegExp): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && heading.test(l));
  if (start < 0) return '';
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function tableRowCount(s: string): number {
  return s.split(/\r?\n/).filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).length - 1; // 見出し行を除く
}

test.describe('FR-288 外部ファイルの取り込み・書き出しの対応形式のガイド', () => {
  // FR-288 AC-756
  test('FR-288 AC-756 users-guide/README.md の利用者向けの表に、対応形式の文書へのリンクと内容の一行があり、リンク先のファイルが存在する', () => {
    const idx = findIndexRow();
    expect(idx, '取り込み・書き出しに触れる表の行（リンクつき）がない').not.toBeNull();
    // 表の 2 列目（内容の一行）が空でない
    const cells = idx!.row.split('|').map((c) => c.trim()).filter((c) => c !== '');
    expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(cells[1].length).toBeGreaterThan(5);
    expect(fs.existsSync(path.resolve(GUIDE_DIR, idx!.link)), `リンク先が存在しない: ${idx!.link}`).toBe(true);
    expect(idx!.link.startsWith('http')).toBe(false);
  });

  // FR-288 AC-756（異常系: 既存の表の行とリンクを壊していない）
  test('FR-288 AC-756 既存の利用者向けの文書（01〜03）へのリンクが残っており、すべてリンク先が存在する', () => {
    const text = fs.readFileSync(README, 'utf8');
    for (const f of ['01-quick-start.md', '02-meeting-playbook.md', '03-glossary-and-data-handling.md']) {
      expect(text).toContain(`(${f})`);
    }
    const links = [...text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)].map((m) => m[1]).filter((l) => !l.startsWith('http'));
    for (const l of links) expect(fs.existsSync(path.resolve(GUIDE_DIR, l)), `リンク切れ: ${l}`).toBe(true);
  });

  // FR-288 AC-754
  test('FR-288 AC-754 対応形式の文書があり、取り込みと書き出しのそれぞれについて、画面・操作、形式（拡張子）、条件を表で示している', () => {
    const t = guideText();
    const imp = sectionOf(t, /取り込み/);
    const exp = sectionOf(t, /書き出し/);
    expect(imp, '「取り込み」の節がない').not.toBe('');
    expect(exp, '「書き出し」の節がない').not.toBe('');
    for (const [name, s] of [['取り込み', imp], ['書き出し', exp]] as const) {
      expect(s, `${name}の表がない`).toMatch(/^\s*\|[\s:|-]+\|\s*$/m);
      expect(s, `${name}の表に「画面」または「操作」の列がない`).toMatch(/画面|操作/);
      expect(s, `${name}の表に「形式」の列がない`).toMatch(/形式/);
      expect(s, `${name}の表に「条件」の列がない`).toMatch(/条件/);
      expect(s, `${name}に拡張子（例 .json）がない`).toMatch(/\.(json|csv|md|zip|pdf|png|svg|webm)/i);
    }
  });

  // FR-288 AC-755（取り込み 5 種）
  test('FR-288 AC-755 取り込み 5 種（顧客パック JSON・議論メモ .md・データ .json/.csv・データカタログ .json/.csv（5 MB 超は読まない）・画像の貼り付け）が載っている', () => {
    const imp = sectionOf(guideText(), /取り込み/);
    expect(imp).toMatch(/顧客パック/);
    expect(imp).toMatch(/議論メモ/);
    expect(imp).toMatch(/データカタログ/);
    expect(imp).toMatch(/5\s*MB/);
    expect(imp).toMatch(/貼り付け/);
    expect(imp).toMatch(/\.csv/i);
    expect(tableRowCount(imp), '取り込みの表の行が 5 未満').toBeGreaterThanOrEqual(5);
  });

  // FR-288 AC-755（書き出し 8 種以上）
  test('FR-288 AC-755 書き出し 8 種以上（データの JSON/CSV・議論メモ .md・エクスポートの .md/.zip・サマリーの ZIP（PDF）・ボードの Markdown ZIP と PDF・SVG/PNG/テキスト・WebM）が載っている', () => {
    const exp = sectionOf(guideText(), /書き出し/);
    for (const w of [/JSON/, /CSV/, /議論メモ/, /\.zip|ZIP/, /PDF/, /SVG/, /PNG/, /WebM/i, /Markdown|\.md/]) expect(exp, `書き出しに ${w} がない`).toMatch(w);
    expect(tableRowCount(exp), '書き出しの表の行が 8 未満').toBeGreaterThanOrEqual(8);
  });

  // FR-288 AC-755（異常系: 実装にない形式を「対応」とせず、未対応を明記し AI 取り込みを案内する）
  test('FR-288 AC-755 PDF・画像ファイル・Office 文書・非定型テキストを「未対応」と明記し、AI 取り込み（FR-289）を案内している', () => {
    const t = guideText();
    const un = sectionOf(t, /未対応/) || t;
    expect(t).toMatch(/未対応/);
    const near = t.split(/\r?\n/).filter((l) => /未対応/.test(l)).join('\n') + '\n' + sectionOf(t, /未対応/);
    for (const w of [/PDF/, /画像/, /Office/, /非定型/]) expect(near, `未対応の記述に ${w} がない`).toMatch(w);
    expect(un).toMatch(/AI 取り込み|AI取り込み/);
  });

  // FR-288 AC-755（コードの位置が実在する）
  test('FR-288 AC-755 文書に載せたコードの位置（src/ 配下のパス）が実在する', () => {
    const t = guideText();
    const paths = [...new Set([...t.matchAll(/`?(src\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|json))`?/g)].map((m) => m[1]))];
    expect(paths.length, 'コードの位置（src/...）が載っていない').toBeGreaterThanOrEqual(5);
    for (const p of paths) expect(fs.existsSync(path.join(REPO_ROOT, p)), `存在しないコードの位置: ${p}`).toBe(true);
  });
});
