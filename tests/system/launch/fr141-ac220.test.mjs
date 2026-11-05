// FR-141 AC-220: 導入済み・既存 dist ありでも、npm install は行わず、毎回現在のソースから npm run build を実行し、成功した後にだけ npm start で起動して、127.0.0.1 の URL を表示し、その URL でアプリが開く。
// 実行: node --test tests/system/launch/fr141-ac220.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, makeSandbox, runScript, scriptFiles, startReal } from './support.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './support.mjs';

test('FR-141 AC-220 起動スクリプトがルートにある（start.cmd・start.ps1・start.sh）', () => {
  for (const f of scriptFiles) assert.ok(fs.existsSync(path.join(repoRoot, f)), `${f} がリポジトリのルートにない`);
});

test('FR-141 AC-220 導入済み・既存 dist ありでも install は行わず、毎回 npm run build をしてから npm start で起動し、127.0.0.1 の URL を表示する', () => {
  const sb = makeSandbox({ nodeModules: true, dist: true });
  try {
    const r = runScript(sb);
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls, ['run build', 'start'], `npm の呼び出し: ${JSON.stringify(r.calls)}`);
    assert.match(r.output, /http:\/\/127\.0\.0\.1:\d+/);
    // 再実行（ソース変更後の再起動を想定）でも、毎回 build が先（呼び出しの記録は累積）
    const r2 = runScript(sb);
    assert.equal(r2.status, 0, r2.output);
    assert.deepEqual(r2.calls.slice(-2), ['run build', 'start'], JSON.stringify(r2.calls));
    assert.ok(!r2.calls.some((c) => c.startsWith('install')), JSON.stringify(r2.calls));
    assert.match(r2.output, /http:\/\/127\.0\.0\.1:\d+/);
  } finally { cleanup(sb); }
});

test('FR-141 AC-220 実機: 表示された 127.0.0.1 の URL でアプリが開く', { timeout: 300_000 }, async () => {
  const app = await startReal();
  try {
    assert.match(app.url, /^http:\/\/127\.0\.0\.1:\d+/);
    const res = await fetch(app.url);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<div id="root"|<div id="app"|<script/i, 'アプリの HTML ではない');
  } finally { app.stop(); }
});
