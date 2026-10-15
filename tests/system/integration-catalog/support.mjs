// 外部連携カタログ（FR-188〜FR-199・NFR-OPS-001）の検査テスト用の共通部品。
// 期待値は要求定義書の受入基準だけから決める。検査の実装（scripts/）には依存せず、
// 「既存の指摘（ベースライン）に対して、カタログの変更で増えた指摘」を見て判定する。
// 実行はサンドボックス（scripts/・docs/ の複製）の中だけで行い、リポジトリ本体は変更しない。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PY = process.env.PYTHON || 'python';

// 列の見出し（docs/integration-catalog.md の表。FR-188 の列の構成）
export const COL = {
  name: '連携名', dest: '連携先', dir: '方向', kind: '種別', state: '状態', reqs: '関連する要求 ID',
  truth: '正本・識別子', auth: '認証・認可', cred: '資格情報の管理', data: '送受信するデータ・個人情報・機密区分',
  cond: '送信の条件', freq: '頻度・量・SLA', timeout: 'タイムアウト', fail: '失敗時・再試行・冪等性',
  ver: 'バージョン・互換・変更の通知', audit: '監視・監査ログ', terms: '規約・ライセンス・コスト',
  stub: 'テスト用スタブ・実接続の確認', date: '最終確認日',
};

const SPLIT = /(?<!\\)\|/;
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(SPLIT).map((x) => x.trim());
const join = (c) => `| ${c.join(' | ')} |`;

let template = null;
function makeTemplate() {
  if (template) return template;
  template = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-tpl-'));
  // 管理データが参照するファイルを含めて複製する（CHK-08 などの無関係な指摘を、ベースラインから除くため）。重い・無関係なものは除く。
  const skip = new Set(['node_modules', 'dist', '.git', 'work', 'test-results', 'EABK-Studio', 'EABK-docs', 'users-guide', 'playwright-report']);
  fs.cpSync(repoRoot, template, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !/\.png$/i.test(src) });
  return template;
}

export function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-sbx-'));
  const tpl = makeTemplate();
  // 速さのため、変更しうるもの（docs/・scripts/・tests/system/ledger.json・ルートのファイル）だけを複製し、ほかは junction で共有する。
  const REAL = new Set(['docs', 'scripts']);
  for (const e of fs.readdirSync(tpl, { withFileTypes: true })) {
    const s = path.join(tpl, e.name); const d = path.join(root, e.name);
    if (!e.isDirectory() || REAL.has(e.name)) fs.cpSync(s, d, { recursive: true });
    else if (e.name === 'tests') {
      fs.mkdirSync(path.join(d, 'system'), { recursive: true });
      for (const t of fs.readdirSync(s)) if (t !== 'system') { const ts = path.join(s, t); if (fs.statSync(ts).isDirectory()) fs.symlinkSync(ts, path.join(d, t), 'junction'); else fs.copyFileSync(ts, path.join(d, t)); }
      for (const t of fs.readdirSync(path.join(s, 'system'))) {
        const ss = path.join(s, 'system', t); const dd = path.join(d, 'system', t);
        if (t === 'ledger.json' || !fs.statSync(ss).isDirectory()) fs.copyFileSync(ss, dd); else fs.symlinkSync(ss, dd, 'junction');
      }
    } else fs.symlinkSync(s, d, 'junction');
  }
  return { root, cat: path.join(root, 'docs', 'integration-catalog.md') };
}
export function cleanup(sb) {
  try {
    // junction は先に外す（共有元を消さないため）
    const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isSymbolicLink()) fs.unlinkSync(f); } };
    walk(sb.root); const t = path.join(sb.root, 'tests'); if (fs.existsSync(t)) { walk(t); const s = path.join(t, 'system'); if (fs.existsSync(s)) walk(s); }
    fs.rmSync(sb.root, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function run(sb, script, args) {
  const r = spawnSync(PY, [`scripts/${script}`, '--root', sb.root, ...args], { cwd: sb.root, encoding: 'utf8', timeout: 240_000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
}

export function parseFindings(output) {
  const out = [];
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*(ERROR|WARN)\s+(CHK-\d+)\s+(\S+)\s+(.*)$/);
    if (m) out.push({ level: m[1], chk: m[2], loc: m[3], msg: m[4], raw: line.trim(), key: `${m[1]} ${m[2]} ${m[3].replace(/:\d+$/, '')} ${m[4]}` });
  }
  return out;
}
// --root はサブコマンドの前に置く（rdcheck.py の仕様）。verify.py は後ろでもよい。
export function runCheck(sb) { const r = run(sb, 'rdcheck.py', ['check']); return { ...r, findings: parseFindings(r.output) }; }
export function runVerify(sb) { const r = run(sb, 'verify.py', ['--docs-only', '--no-cache']); return { ...r, findings: parseFindings(r.output) }; }
export function runTrace(sb, name) { return run(sb, 'rdcheck.py', ['trace', name]); }
export function runRdfix(sb) { return run(sb, 'rdfix.py', ['--apply']); }

export function newFindings(before, after, level) {
  const seen = new Map();
  for (const f of before.findings) seen.set(f.key, (seen.get(f.key) || 0) + 1);
  const res = [];
  for (const f of after.findings) {
    const n = seen.get(f.key) || 0;
    if (n > 0) { seen.set(f.key, n - 1); continue; }
    if (!level || f.level === level) res.push(f);
  }
  return res;
}

// ---- カタログの読み書き ----
export function readCatalog(sb) {
  const lines = fs.readFileSync(sb.cat, 'utf8').split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith('|') && l.includes(COL.name));
  const header = cells(lines[hi]);
  const rows = [];
  let i = hi + 2;
  for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cells(lines[i]));
  return { lines, hi, header, rows, end: i };
}
export function col(cat, key) { const i = cat.header.indexOf(COL[key]); if (i < 0) throw new Error(`列がない: ${COL[key]}`); return i; }
export function writeCatalog(sb, cat) {
  const out = [...cat.lines.slice(0, cat.hi + 2), ...cat.rows.map(join), ...cat.lines.slice(cat.end)];
  fs.writeFileSync(sb.cat, out.join('\n'));
}
export function rowLine(sb, name) { // 1 始まりの行番号
  const ls = fs.readFileSync(sb.cat, 'utf8').split(/\r?\n/);
  return ls.findIndex((l) => l.startsWith('|') && cells(l)[0] === name) + 1;
}
export function edit(sb, fn) { const cat = readCatalog(sb); fn(cat); writeCatalog(sb, cat); return cat; }
export function setCells(sb, rowIdx, map) { return edit(sb, (c) => { for (const [k, v] of Object.entries(map)) c.rows[rowIdx][col(c, k)] = v; }); }
export function setCell(sb, rowIdx, key, value) { return setCells(sb, rowIdx, { [key]: value }); }
export function rowName(sb, rowIdx) { return readCatalog(sb).rows[rowIdx][0]; }
export function cellOf(sb, rowIdx, key) { const c = readCatalog(sb); return c.rows[rowIdx][col(c, key)]; }
// 全行の最終確認日を今日にする（鮮度の警告を、検査したい行だけに絞るため）
export function freshenAll(sb) { edit(sb, (c) => { const i = col(c, 'date'); for (const r of c.rows) r[i] = today(); }); }

export function today(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 指摘が「その行」「その欄」を示しているか
export function mentionsRow(f, sb, name) {
  const ln = rowLine(sb, name);
  return f.raw.includes(name) || (ln > 0 && new RegExp(`integration-catalog\\.md:${ln}(?!\\d)`).test(f.raw));
}
export function mentionsCol(f, key) { return f.raw.includes(COL[key]); }
export function lines(findings) { return findings.map((f) => f.raw).join('\n'); }

// ---- 期待判定の共通部品 ----
let baseCache = null; let freshCache = null;
export function baseline() { if (!baseCache) { const sb = makeSandbox(); baseCache = runCheck(sb); cleanup(sb); } return baseCache; }
export function freshBaseline() { if (!freshCache) { const sb = makeSandbox(); freshenAll(sb); freshCache = runCheck(sb); cleanup(sb); } return freshCache; }

// カタログを mutate で変え、ベースラインに無い指摘が増えて、その行（と欄）を示すことを確かめる。
export function expectNew(assert, { mutate, rowIdx = 0, keys = [], level = 'ERROR', fresh = false, pattern = null }) {
  const sb = makeSandbox();
  try {
    if (fresh) freshenAll(sb);
    const name = rowName(sb, rowIdx);
    mutate(sb, name);
    const after = runCheck(sb);
    const nf = newFindings(fresh ? freshBaseline() : baseline(), after, level);
    const hit = nf.filter((f) => mentionsRow(f, sb, name));
    assert.ok(hit.length > 0, `${level} の指摘が増えない（行 ${name}）。増えた指摘: ${lines(nf) || 'なし'}\n${after.output.slice(-1500)}`);
    for (const k of keys) assert.ok(hit.some((f) => mentionsCol(f, k)), `指摘が欄「${COL[k]}」を示さない: ${lines(hit)}`);
    if (pattern) assert.ok(hit.some((f) => pattern.test(f.raw)), `指摘が ${pattern} に合わない: ${lines(hit)}`);
    return { sb, name, hit, nf };
  } finally { cleanup(sb); }
}
// 変更しても、その行について ERROR（level=WARN なら WARN）が増えないこと
export function expectNoNew(assert, { mutate, rowIdx = 0, level = 'ERROR', fresh = false }) {
  const sb = makeSandbox();
  try {
    if (fresh) freshenAll(sb);
    const name = rowName(sb, rowIdx);
    mutate(sb, name);
    const after = runCheck(sb);
    const nf = newFindings(fresh ? freshBaseline() : baseline(), after, level).filter((f) => mentionsRow(f, sb, name));
    assert.equal(nf.length, 0, `増えてはいけない ${level}: ${lines(nf)}`);
  } finally { cleanup(sb); }
}
