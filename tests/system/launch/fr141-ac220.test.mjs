// FR-141 AC-220: 導入とビルドが済んだ状態で起動すると、npm install / npm run build を行わずに起動し、127.0.0.1 の URL を表示し、その URL でアプリが開く。
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

test('FR-141 AC-220 導入・ビルド済みなら install も build もせず npm start だけで起動し、127.0.0.1 の URL を表示する', () => {
  const sb = makeSandbox({ nodeModules: true, dist: true });
  try {
    const r = runScript(sb);
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls, ['start'], `npm の呼び出し: ${JSON.stringify(r.calls)}`);
    assert.match(r.output, /http:\/\/127\.0\.0\.1:\d+/);
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
