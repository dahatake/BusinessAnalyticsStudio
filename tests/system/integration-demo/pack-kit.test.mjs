// FR-268 AC-684（変更分）/ AC-828 / AC-829 / AC-830（顧客パックの schema 入手・Prompt の一致・完全な手順）。
// 期待値は受入基準だけから決める（実装コードは、起動方法の把握にだけ使う）。
// 実行: node --test tests/system/integration-demo/pack-kit.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
const exists = (...p) => fs.existsSync(path.join(root, ...p));
const pkg = JSON.parse(read('package.json'));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const M365_MD = 'docs/prompts/m365-copilot-customer-pack.md';
const GHCP_MD = 'docs/prompts/github-copilot-workiq-customer-pack.md';
const KIT_REL = 'work/envisioning/_attach/customer-pack-kit.md';
const MONO_FILES = [
  ...['architecture', 'customer', 'entities', 'issues', 'mocks', 'plan', 'products', 'show', 'sources'].map((n) => `examples/mono/public/data/${n}.json`),
  'examples/mono/public/brand/brand-profile.json',
  'examples/mono/data/customer-research.md',
  'examples/mono/brand/BRAND-RESEARCH.md',
];

function schemaFiles() {
  return fs.readdirSync(path.join(root, 'schema')).filter((f) => f.endsWith('.json')).map((f) => `schema/${f}`);
}

/** 先頭の最長フェンス（バッククォート 4 個以上）のコードブロックの本文を取り出す。 */
function fencedBlocks(md) {
  const out = [];
  const re = /^(`{3,})[a-z]*\n([\s\S]*?)\n\1\s*$/gm;
  let m;
  while ((m = re.exec(md))) out.push(m[2]);
  return out;
}
const norm = (s) => s.replace(/\r\n/g, '\n').trim();

/** `npm run <name>` と `npm start` が package.json の scripts にあるか。 */
function npmScriptsUsed(text) {
  const names = new Set([...text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]));
  if (/npm start\b/.test(text)) names.add('start');
  if (/npm test\b/.test(text)) names.add('test');
  return [...names];
}

// ---------------------------------------------------------------- AC-828
test('FR-268 AC-828 npm run pack:kit は kit を 1 つ作り、schema 全 10 ファイル・mono の JSON・調査記録 2 本を省略せず含む', () => {
  assert.ok(pkg.scripts['pack:kit'], 'package.json の scripts に pack:kit がない');
  const kitPath = path.join(root, KIT_REL);
  fs.rmSync(path.dirname(kitPath), { recursive: true, force: true });
  const r = spawnSync(NPM, ['run', 'pack:kit'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(r.status, 0, `pack:kit が失敗: ${r.stdout}${r.stderr}`);
  assert.ok(fs.existsSync(kitPath), `${KIT_REL} が作られていない`);
  const kitFiles = fs.readdirSync(path.dirname(kitPath));
  assert.deepEqual(kitFiles, ['customer-pack-kit.md'], '_attach の下は kit 1 ファイルだけ（M365 には 1 ファイルだけ添付する）');
  const kit = fs.readFileSync(kitPath, 'utf8').replace(/\r\n/g, '\n');
  const schemas = schemaFiles();
  assert.equal(schemas.length, 10, `schema/*.json は 10 ファイルのはず: ${schemas.length}`);
  for (const rel of [...schemas, ...MONO_FILES]) {
    assert.ok(exists(rel), `実在しない: ${rel}`);
    const body = norm(read(rel));
    const lines = kit.split('\n');
    const h = lines.findIndex((l) => /^#+\s/.test(l) && l.includes(rel));
    assert.ok(h >= 0, `kit に「${rel}」のパスの見出しがない`);
    const after = lines.slice(h + 1).join('\n');
    assert.match(after.slice(0, 40), /`{3,}/, `${rel} の見出しの直後にコードブロックがない`);
    assert.ok(after.includes(body), `kit の ${rel} が元ファイルと一致しない（省略・改変）`);
  }
});

test('FR-268 AC-828 異常系: schema が古い（gen:schema --check 相当の差分）とき、pack:kit は終了コード 0 以外で gen:schema を案内し、kit を更新しない', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'packkit-'));
  try {
    for (const p of ['scripts', 'src', 'schema', 'package.json', 'tsconfig.json']) {
      if (exists(p)) fs.cpSync(path.join(root, p), path.join(tmp, p), { recursive: true });
    }
    fs.cpSync(path.join(root, 'examples', 'mono'), path.join(tmp, 'examples', 'mono'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');
    // schema を 1 ファイルだけ古い（生成物と違う）状態にする
    const target = path.join(tmp, 'schema', schemaFiles()[0].split('/')[1]);
    const j = JSON.parse(fs.readFileSync(target, 'utf8'));
    j.description = '古い schema（テスト用の差分）';
    fs.writeFileSync(target, JSON.stringify(j, null, 2) + '\n');
    const kit = path.join(tmp, KIT_REL);
    fs.mkdirSync(path.dirname(kit), { recursive: true });
    fs.writeFileSync(kit, 'SENTINEL-OLD-KIT');
    const r = spawnSync(NPM, ['run', 'pack:kit'], { cwd: tmp, encoding: 'utf8', shell: process.platform === 'win32' });
    assert.notEqual(r.status, 0, '古い schema なのに pack:kit が成功した');
    const out = `${r.stdout}${r.stderr}`;
    assert.match(out, /npm run gen:schema/, '直し方（npm run gen:schema）が表示されない');
    assert.match(out, /schema/, '原因（schema が古い）が表示されない');
    assert.equal(fs.readFileSync(kit, 'utf8'), 'SENTINEL-OLD-KIT', 'kit が更新されてしまった');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- AC-829
function guideConstants() {
  const code = `import('./src/guide/guideContent.ts').then((m)=>{process.stdout.write(JSON.stringify({m365:m.PACK_PROMPT_M365,ghcp:m.PACK_PROMPT_GHCP}))})`;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', code], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `guideContent.ts を読み込めない: ${r.stderr}`);
  const v = JSON.parse(r.stdout);
  const s = (x) => (Array.isArray(x) ? x.join('\n') : String(x));
  return { m365: s(v.m365), ghcp: s(v.ghcp) };
}

function quickStartPrompts() {
  const md = read('users-guide', '01-quick-start.md');
  const start = md.indexOf('### 13.1');
  assert.ok(start >= 0, '01-quick-start.md に 13.1 がない');
  const end = md.indexOf('\n## ', start);
  const sec = md.slice(start, end < 0 ? undefined : end);
  const iM = sec.indexOf('Microsoft 365 Copilot 用');
  const iG = sec.indexOf('GitHub Copilot（WorkIQ');
  assert.ok(iM >= 0 && iG > iM, '13.1 に M365 用・GitHub Copilot 用の小見出しがない');
  return { m365: fencedBlocks(sec.slice(iM, iG)).sort((a, b) => b.length - a.length)[0], ghcp: fencedBlocks(sec.slice(iG)).sort((a, b) => b.length - a.length)[0] };
}

test('FR-268 AC-829 Prompt 本文は 4 か所（docs/prompts・guideContent.ts・01-quick-start.md §13.1）で同じ文面で、M365 用は kit の schema に従い、添付がなければ作らず添付を求める', () => {
  const longest = (md) => fencedBlocks(md).sort((a, b) => b.length - a.length)[0];
  const m365Md = longest(read(...M365_MD.split('/')));
  const ghcpMd = longest(read(...GHCP_MD.split('/')));
  const g = guideConstants();
  const q = quickStartPrompts();
  assert.ok(m365Md && ghcpMd && q.m365 && q.ghcp, 'Prompt のコードブロックが見つからない');
  assert.equal(norm(g.m365), norm(m365Md), 'guideContent.ts の PACK_PROMPT_M365 が docs/prompts の M365 用と違う');
  assert.equal(norm(q.m365), norm(m365Md), '01-quick-start.md §13.1 の M365 用が docs/prompts と違う');
  assert.equal(norm(g.ghcp), norm(ghcpMd), 'guideContent.ts の PACK_PROMPT_GHCP が docs/prompts の GitHub Copilot 用と違う');
  assert.equal(norm(q.ghcp), norm(ghcpMd), '01-quick-start.md §13.1 の GitHub Copilot 用が docs/prompts と違う');
  // M365 用: kit に従う・添付がないときは作らず添付を求める
  assert.ok(m365Md.includes('customer-pack-kit.md'), 'M365 用 Prompt に customer-pack-kit.md の記述がない');
  assert.match(m365Md, /customer-pack-kit\.md[^\n]*schema|schema[^\n]*customer-pack-kit\.md/, '「添付の customer-pack-kit.md の schema に従う」旨がない');
  assert.match(m365Md, /(見当たら|ない|なければ|ないとき)[\s\S]{0,80}(作らず|作成せず|作りません|作らない)[\s\S]{0,80}添付を(求め|お願い|依頼)|添付を(求め|お願い|依頼)[\s\S]{0,80}(作らず|作成せず|作りません)/, '添付が見当たらないときは作らず添付を求める旨がない');
});

test('FR-268 AC-829 異常系: 入手できない添付（添付の schema/*.json・examples/mono/ を添付）の記述が、Prompt・手順書・画面の文面のどこにも残らない', () => {
  const texts = {
    [M365_MD]: read(...M365_MD.split('/')),
    [GHCP_MD]: read(...GHCP_MD.split('/')),
    'src/guide/guideContent.ts': read('src', 'guide', 'guideContent.ts'),
    'users-guide/01-quick-start.md': read('users-guide', '01-quick-start.md'),
  };
  for (const [name, t] of Object.entries(texts)) {
    assert.doesNotMatch(t, /添付の\s*`?schema\/\*\.json/, `${name} に「添付の schema/*.json」が残っている`);
    assert.doesNotMatch(t, /`?examples\/mono\/?`?\s*(の[^\n]{0,12})?を添付/, `${name} に「examples/mono/ を添付」が残っている`);
    assert.doesNotMatch(t, /(schema\/\*\.json|examples\/mono\/?)(`)?\s*(と|や|、)?[^\n]{0,20}を(Copilot の)?チャットに添付/, `${name} に入手できない添付の依頼が残っている`);
  }
});

// ---------------------------------------------------------------- AC-684（変更分）
test('FR-268 AC-684 説明カード・手順書に書かれた npm スクリプト・パス・URL が package.json と実在のファイルに一致する（pack:kit・make-pack-kit を含む）', () => {
  for (const s of ['pipeline', 'check:pack', 'verify:pack', 'pack:kit', 'build', 'start', 'gen:schema']) {
    assert.ok(pkg.scripts[s], `package.json の scripts に ${s} がない`);
  }
  assert.ok(exists('scripts', 'make-pack-kit.ts'), 'scripts/make-pack-kit.ts がない');
  assert.match(pkg.scripts['pack:kit'], /make-pack-kit/, 'pack:kit が scripts/make-pack-kit.ts を呼んでいない');
  for (const p of ['examples/mono', M365_MD, GHCP_MD, 'README.md', 'users-guide/01-quick-start.md', 'users-guide/engineering/02-customer-pack.md']) {
    assert.ok(exists(...p.split('/')), `実在しない: ${p}`);
  }
  const sources = ['README.md', 'users-guide/01-quick-start.md', 'users-guide/engineering/02-customer-pack.md', M365_MD, GHCP_MD, 'src/guide/guideContent.ts'];
  for (const f of sources) {
    const t = read(...f.split('/'));
    for (const n of npmScriptsUsed(t)) assert.ok(pkg.scripts[n], `${f} の「npm run ${n}」が package.json の scripts にない`);
  }
  const quick = read('users-guide', '01-quick-start.md');
  for (const t of ['npm run pack:kit', 'npm run check:pack', 'npm run verify:pack', 'npm run pipeline', 'examples/mono', M365_MD, 'http://127.0.0.1:4173']) {
    assert.ok(quick.includes(t), `01-quick-start.md に「${t}」がない`);
  }
  const guide = read('src', 'guide', 'guideContent.ts');
  for (const t of ['npm run pack:kit', 'npm run check:pack', 'npm run verify:pack', 'npm run pipeline', 'examples/mono', 'http://127.0.0.1:4173']) {
    assert.ok(guide.includes(t) || read('src', 'guide', 'GuideParts.tsx').includes(t), `画面の文面（guideContent.ts / GuideParts.tsx）に「${t}」がない`);
  }
});

// ---------------------------------------------------------------- AC-830（文書側。画面側は e2e/getting-started.spec.ts）
test('FR-268 AC-830 users-guide（01-quick-start.md・engineering/02-customer-pack.md）と guideContent.ts に、①〜⑥の完全な手順がコピーできるコマンドと kit の場所つきで載り、コマンド・パスが実在に一致する', () => {
  const docs = {
    'users-guide/01-quick-start.md': read('users-guide', '01-quick-start.md'),
    'users-guide/engineering/02-customer-pack.md': read('users-guide', 'engineering', '02-customer-pack.md'),
  };
  const must = [
    ['準備', /準備/], ['方法 A', /方法\s*A/], ['方法 B', /方法\s*B/], ['方法 C', /方法\s*C/], ['検証', /検証/], ['画面への反映', /画面への反映|画面に反映|アプリへ反映/],
    ['npm install', /npm install/], ['npm run pack:kit', /npm run pack:kit/], ['kit の場所', /work\/envisioning\/_attach\/customer-pack-kit\.md/],
    ['保存先', /work\/envisioning\//], ['check:pack', /npm run check:pack/], ['verify:pack', /npm run verify:pack/],
    ['public/data', /public\/data/], ['public/brand', /public\/brand/], ['npm run build', /npm run build/], ['npm start', /npm start/],
    ['エラー時の直し方', /エラー/],
  ];
  for (const [name, t] of Object.entries(docs)) {
    for (const [label, re] of must) assert.match(t, re, `${name} に「${label}」の記述がない`);
    // コマンドはコードブロック（コピーできる形）の中にある
    const code = fencedBlocks(t).join('\n');
    for (const c of ['npm install', 'npm run pack:kit', 'npm run check:pack', 'npm run verify:pack', 'npm run build', 'npm start']) {
      assert.ok(code.includes(c), `${name} の「${c}」がコードブロック（コピーできる形）にない`);
    }
    for (const n of npmScriptsUsed(t)) assert.ok(pkg.scripts[n], `${name} の「npm run ${n}」が package.json の scripts にない`);
  }
  const guide = read('src', 'guide', 'guideContent.ts') + '\n' + read('src', 'guide', 'GuideParts.tsx');
  for (const c of ['npm install', 'npm run pack:kit', 'customer-pack-kit.md', 'public/data', 'public/brand', 'npm run build', 'npm start']) {
    assert.ok(guide.includes(c), `メイン画面の文面（guideContent.ts / GuideParts.tsx）に「${c}」がない`);
  }
});
