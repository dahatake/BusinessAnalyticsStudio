// FR-141 AC-222: サーバーは 127.0.0.1 だけで待ち受け、LAN 側のアドレスでは接続できない。スクリプトに認証情報の値が含まれていないことを静的検査で確かめる。
// 実行: node --test tests/system/launch/fr141-ac222.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { lanAddresses, repoRoot, scriptFiles, startReal } from './support.mjs';

const read = (f) => {
  const p = path.join(repoRoot, f);
  assert.ok(fs.existsSync(p), `${f} がない`);
  return fs.readFileSync(p, 'utf8');
};

test('FR-141 AC-222 静的検査: 認証情報の値・外部への送信がスクリプトに含まれない', () => {
  const secret = [
    /\bsk-[A-Za-z0-9_-]{16,}/, /\bghp_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /Bearer\s+[A-Za-z0-9._-]{16,}/,
    /(api[_-]?key|secret|password|passwd|token|client[_-]?secret)\s*[=:]\s*["']?[A-Za-z0-9+\/_.-]{8,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  const send = [/\bInvoke-(WebRequest|RestMethod)\b/i, /\bcurl\b/i, /\bwget\b/i, /\bnc\s+-/i];
  for (const f of scriptFiles) {
    const text = read(f);
    for (const re of secret) assert.doesNotMatch(text, re, `${f}: 認証情報らしき値 ${re}`);
    for (const re of send) assert.doesNotMatch(text, re, `${f}: 外部への送信らしき記述 ${re}`);
  }
});

test('FR-141 AC-222 静的検査: LAN に公開する指定（0.0.0.0・--host のみ・::）を含まない', () => {
  for (const f of scriptFiles) {
    const text = read(f);
    assert.doesNotMatch(text, /0\.0\.0\.0/, `${f}: 0.0.0.0`);
    assert.doesNotMatch(text, /--host(\s|=)+(?!127\.0\.0\.1)\S+/, `${f}: 127.0.0.1 以外への --host`);
    assert.doesNotMatch(text, /--host\s*$/m, `${f}: 値なしの --host（全インターフェース公開）`);
    assert.doesNotMatch(text, /npm\s+start\s+--\s+--host/, `${f}: start への --host 上書き`);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.start, 'vite preview --host 127.0.0.1');
});

test('FR-141 AC-222 実機: 127.0.0.1 では接続でき、LAN 側のアドレスでは接続できない', { timeout: 300_000 }, async () => {
  const app = await startReal();
  try {
    const port = new URL(app.url).port;
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    for (const ip of lanAddresses()) {
      await assert.rejects(
        fetch(`http://${ip}:${port}/`, { signal: AbortSignal.timeout(5000) }),
        `LAN アドレス ${ip} で接続できてしまった`,
      );
    }
  } finally { app.stop(); }
});
