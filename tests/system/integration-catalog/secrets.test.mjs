// NFR-SEC-006（外部連携カタログに秘密情報の実データを書かない）。期待値は受入基準 AC-430 だけから決める。
// 実行: node --test tests/system/integration-catalog/secrets.test.mjs
// 判定は「既存の指摘（ベースライン）に対して、カタログの変更で増えた指摘」で行う（support.mjs）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { cellOf, expectNew, expectNoNew, setCell } from './support.mjs';

const T = { timeout: 300_000 };
const put = (key, value) => (sb) => setCell(sb, 0, key, value);
const append = (s) => (sb) => setCell(sb, 0, 'ver', `${cellOf(sb, 0, 'ver')} ${s}`);

// 検出すべき資格情報の形式。ここの値はすべて合成した偽物（実在の資格情報ではない）。
const REAL = {
  bearer: 'Bearer q8Zk3LmN7vR2tXw9',
  apiKey: 'api_key=k7Hq2ZpL9dVx4TnB',
  token: 'token=t6Yw3MsR8cEj5UaQ',
  password: 'password=Pa55w0rdQ7mZ2xKd',
  long32: 'Ab3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY',
  pem: '-----BEGIN PRIVATE KEY----- MIIEvQIBADANBgkqhkiG9w0BAQEFAASC',
};

// NFR-SEC-006 AC-430 [形式別の検出]
for (const [k, v] of Object.entries(REAL)) {
  test(`NFR-SEC-006 AC-430 [形式:${k}] 資格情報の形式（${v.split(/[ =]/)[0]}）の値を含むカタログは検査が失敗し、該当の行を示す`, T, () => {
    expectNew(assert, { mutate: put('cred', `Key Vault。値: ${v}`), rowIdx: 0 });
  });
}

// NFR-SEC-006 AC-430 [欄を問わない]（資格情報の欄以外でも検出する）
test('NFR-SEC-006 AC-430 [欄を問わない] 認証・認可の欄に Bearer の値があっても検査は失敗する', T, () => {
  expectNew(assert, { mutate: put('auth', `API キー（${REAL.bearer}）`), rowIdx: 0 });
});

// NFR-SEC-006 AC-430 [ハッシュ除外]（異常系の裏: 誤検出の除外）
test('NFR-SEC-006 AC-430 [ハッシュ除外] git の commit ハッシュ（40 桁の 16 進）と SHA のハッシュ値は検出しない', T, () => {
  const sha1 = '9fceb02d0ae598e95dc970b74767f19372d61af8';
  const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  expectNoNew(assert, { mutate: append(`確認した版: commit ${sha1}`), rowIdx: 0 });
  expectNoNew(assert, { mutate: append(`配布物の SHA-256: ${sha256}`), rowIdx: 0 });
});

// NFR-SEC-006 AC-430 [「例」行]（「例」と書いてあっても検出の対象外にしない）
test('NFR-SEC-006 AC-430 [「例」行] 「例」と書いてある行でも本物らしい値は検出し、検査は失敗する', T, () => {
  expectNew(assert, { mutate: put('cred', `例: api_key=${'k7Hq2ZpL9dVx4TnB'}`), rowIdx: 0 });
  expectNew(assert, { mutate: put('auth', `（例）Bearer ${'q8Zk3LmN7vR2tXw9'}`), rowIdx: 0 });
});

// NFR-SEC-006 AC-430 [ダミー値]（固定のダミー表記だけは失敗にしない）
test('NFR-SEC-006 AC-430 [ダミー値] 検出した値が固定のダミー表記（<ここに値>・xxxx・REDACTED・アスタリスクだけ）なら失敗にしない', T, () => {
  for (const v of ['api_key=<ここに値>', 'token=xxxx', 'Bearer REDACTED', 'password=********', 'api_key=REDACTED']) {
    expectNoNew(assert, { mutate: put('cred', `例: ${v}`), rowIdx: 0 });
  }
});

// NFR-SEC-006 AC-430 [ダミー値の抜け道なし]（ダミー表記に似せた本物は通さない）
test('NFR-SEC-006 AC-430 [ダミー値の抜け道なし] 「例」と書き、ダミー表記を前後に添えても、本物の値が混じれば失敗する', T, () => {
  expectNew(assert, { mutate: put('cred', '例: token=xxxx / token=t6Yw3MsR8cEj5UaQ'), rowIdx: 0 });
});

// NFR-SEC-006 AC-430 [語だけの説明文]（異常系の裏: 値を伴わない語は失敗にしない）
test('NFR-SEC-006 AC-430 [語だけの説明文] 「API キー」「トークン」「パスワード」「Bearer 認証」などの語だけの説明文は失敗にしない', T, () => {
  expectNoNew(assert, { mutate: put('auth', 'API キーによる認証。トークンは短命で、パスワードは使わない。Bearer 認証は採用しない'), rowIdx: 0 });
  expectNoNew(assert, { mutate: put('cred', 'API キーは Key Vault に保管し、手順は運用手順書の鍵の更新の節。証明書は別途管理'), rowIdx: 0 });
});
