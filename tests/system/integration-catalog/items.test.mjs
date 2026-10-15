// FR-190〜FR-197（認証・データ・性能・失敗時・版・監視・規約・テスト用手段）の欄ごとの検査。期待値は受入基準だけから決める。
// 実行: node --test tests/system/integration-catalog/items.test.mjs
// 判定: カタログの 1 行を変えたとき、既存の指摘（ベースライン）に無い ERROR/WARN が増え、その行（と欄）を示すこと。
import assert from 'node:assert/strict';
import test from 'node:test';
import { expectNew, expectNoNew, setCell, setCells } from './support.mjs';

const T = { timeout: 300_000 };
const blank = (keys, rowIdx = 0) => (sb) => setCells(sb, rowIdx, Object.fromEntries(keys.map((k) => [k, ''])));

// 「稼働」の連携で欄が空 → 失敗（欄ごと）
function emptyCases(fr, ac, label, keys) {
  for (const k of keys) {
    test(`${fr} ${ac} ${label}: 「稼働」の連携で欄 ${k} が空だと検査は失敗し、その欄を示す`, T, () => {
      expectNew(assert, { mutate: (sb) => { setCell(sb, 0, 'state', '稼働'); blank([k])(sb); }, rowIdx: 0, keys: [k] });
    });
  }
}

// FR-190 AC-407
emptyCases('FR-190', 'AC-407', '認証・認可・資格情報', ['auth', 'cred']);
// FR-190 AC-408（認証「なし」に理由がない）
test('FR-190 AC-408 認証が「なし」で理由がない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'auth', '認証: なし'), rowIdx: 0, keys: ['auth'] });
});
test('FR-190 AC-408 認証が「なし（理由）」なら指摘が増えない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCell(sb, 0, 'auth', '認証: なし（理由: 公開データの取得のみで認証が不要）。認可の範囲: 読み取りのみ'), rowIdx: 0 });
});

// FR-191 AC-409
emptyCases('FR-191', 'AC-409', 'データ項目・個人情報・機密区分・送信の条件', ['data', 'cond']);
// FR-191 AC-410（個人情報「あり」で目的と根拠がない）
test('FR-191 AC-410 個人情報の有無が「あり」で目的と根拠がない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'data', '送信: 氏名・メールアドレス。受信: なし（理由: 返却なし）。個人情報の有無: あり。機密区分: internal'), rowIdx: 0, keys: ['data'] });
});

// FR-192 AC-411
emptyCases('FR-192', 'AC-411', '頻度・量・SLA・タイムアウト', ['freq', 'timeout']);
// FR-192 AC-412（数値の直書きは警告）
test('FR-192 AC-412 タイムアウトに数値が PARAM を参照せず直接書かれていると、検査は警告を示す（失敗にはしない）', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'timeout', '30 秒'), rowIdx: 0, level: 'WARN', keys: ['timeout'] });
  expectNoNew(assert, { mutate: (sb) => setCell(sb, 0, 'timeout', '30 秒'), rowIdx: 0, level: 'ERROR' });
});
test('FR-192 AC-412 量に数値が直接書かれていると、検査は警告を示す', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'freq', '1 日あたり 500 件。SLA は TBD（Q-027）'), rowIdx: 0, level: 'WARN', keys: ['freq'] });
});

// FR-193 AC-413
emptyCases('FR-193', 'AC-413', '失敗時・再試行・冪等性', ['fail']);
// FR-193 AC-414
test('FR-193 AC-414 再試行が「なし」で理由がない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'fail', '利用者への見え方: エラー表示。再試行: なし。冪等性: 必要（同じ ID で再送しても 1 件）。部分失敗: 全体を失敗にする'), rowIdx: 0, keys: ['fail'] });
});
test('FR-193 AC-414 冪等性が「不要」で理由がない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'fail', '利用者への見え方: エラー表示。再試行: 利用者の操作で再実行。冪等性: 不要。部分失敗: 全体を失敗にする'), rowIdx: 0, keys: ['fail'] });
});

// FR-194 AC-415
emptyCases('FR-194', 'AC-415', '版・互換・変更の通知', ['ver']);
// FR-194 AC-416（廃止予定: 移行先または期日がない）
test('FR-194 AC-416 状態が「廃止予定」で移行先も廃止の期日もない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCells(sb, 0, { state: '廃止予定', ver: '相手側の版: v1。互換の方針: 後方互換。変更の通知: 提供元の告知を月 1 回確認' }), rowIdx: 0 });
});
test('FR-194 AC-416 状態が「廃止予定」で移行先と「TBD（Q-xxx）」の期日があれば指摘が増えない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCells(sb, 0, { state: '廃止予定', ver: '相手側の版: v1。互換の方針: 後方互換。変更の通知: 提供元の告知を月 1 回確認。移行先: 新 API v2。廃止の期日: TBD（Q-027）' }), rowIdx: 0 });
});

// FR-195 AC-417
emptyCases('FR-195', 'AC-417', '監視・監査ログ', ['audit']);
// FR-195 AC-418
test('FR-195 AC-418 監査で記録する事項に「資格情報」を含むと書かれた行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'audit', '状態確認: 接続テスト。失敗の通知: 画面表示。監査で記録する事項: 呼び出しの時刻・資格情報。記録に含めないもの: なし。保持期間: 90 日'), rowIdx: 0, keys: ['audit'] });
});
test('FR-195 AC-418 監査で記録する事項に「個人情報の本文」を含むと書かれた行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'audit', '状態確認: 接続テスト。失敗の通知: 画面表示。監査で記録する事項: 呼び出しの時刻・個人情報の本文。記録に含めないもの: なし。保持期間: 90 日'), rowIdx: 0, keys: ['audit'] });
});

// FR-196 AC-419（空は失敗。TBD は警告で失敗にしない）
emptyCases('FR-196', 'AC-419', '規約・ライセンス・コスト', ['terms']);
test('FR-196 AC-419 規約・ライセンス・費用が「TBD（Q-xxx）」なら失敗にはしない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCell(sb, 0, 'terms', '利用規約・ライセンスの確認結果: TBD（Q-027）。確認日: TBD（Q-027）。費用: TBD（Q-027）'), rowIdx: 0 });
});
// FR-196 AC-420
test('FR-196 AC-420 費用が「発生する」で見込みの上限も費用の表示の要否もない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'terms', '利用規約・ライセンスの確認結果: 商用利用可。確認日: 2026-10-01。費用: 発生する（従量課金）'), rowIdx: 0, keys: ['terms'] });
});

// FR-197 AC-421
emptyCases('FR-197', 'AC-421', 'テスト用の手段・実接続の確認', ['stub']);
// FR-197 AC-422
test('FR-197 AC-422 テスト用の手段が「なし」で理由がない行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'stub', 'テスト用の手段: なし。本番との差: なし。実接続の確認の条件: 担当者が開発環境で実施'), rowIdx: 0, keys: ['stub'] });
});
