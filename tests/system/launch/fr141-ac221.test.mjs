// FR-141 AC-221: 未導入なら npm install、dist がなければ npm run build をしてから起動する。失敗したら原因を表示して 0 以外で止まり、起動しない。
// 実行: node --test tests/system/launch/fr141-ac221.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, makeSandbox, runScript } from './support.mjs';

function withSandbox(state, opts, fn) {
  const sb = makeSandbox(state);
  try { fn(runScript(sb, opts)); } finally { cleanup(sb); }
}

test('FR-141 AC-221 依存パッケージが未導入なら npm install をしてから起動する', () => {
  withSandbox({ nodeModules: false, dist: true }, {}, (r) => {
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['install', 'start'], JSON.stringify(r.calls));
  });
});

test('FR-141 AC-221 dist がなければ npm run build をしてから起動する', () => {
  withSandbox({ nodeModules: true, dist: false }, {}, (r) => {
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls, ['run build', 'start']);
  });
});

test('FR-141 AC-221 どちらも無ければ install → build → start の順', () => {
  withSandbox({ nodeModules: false, dist: false }, {}, (r) => {
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls.map((c) => c.split(' ').slice(0, 2).join(' ').replace(/^install.*/, 'install')), ['install', 'run build', 'start']);
  });
});

// 異常系
test('FR-141 AC-221 異常系: npm install が失敗したら原因を表示し、0 以外で止まり、build も start もしない', () => {
  withSandbox({ nodeModules: false, dist: false }, { fail: ['install'] }, (r) => {
    assert.notEqual(r.status, 0, '失敗したのに exit code 0');
    assert.match(r.output, /FAKE-CAUSE-INSTALL/, '原因（npm のエラー出力）が表示されていない');
    assert.ok(!r.calls.some((c) => c === 'start' || c.startsWith('run build')), JSON.stringify(r.calls));
  });
});

test('FR-141 AC-221 異常系: npm run build が失敗したら原因を表示し、0 以外で止まり、start しない', () => {
  withSandbox({ nodeModules: true, dist: false }, { fail: ['build'] }, (r) => {
    assert.notEqual(r.status, 0, '失敗したのに exit code 0');
    assert.match(r.output, /FAKE-CAUSE-BUILD/);
    assert.ok(!r.calls.includes('start'), JSON.stringify(r.calls));
  });
});
