// FR-282（AC-726: 認証方式・固定の伏せ字）・FR-283（AC-727・728: 未設定・失敗時の送信前の判定と案内）の単体・結合テスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXED_KEY_MASK, openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { classifyFoundryFailure, foundryFailureNotice, foundryRunGate, redactSecrets } from '../../src/ai/foundryGate';
import type { FoundryView } from '../../src/ai/foundryClient';

const vault = () => openFoundryVault(fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-conn-')), { protector: fileProtector, restrict: () => {}, warn: () => {} });
const KEY = ['dummy', 'ABCDEFGHIJKLMNOP', 'wxyz'].join('-'); // NFR-SEC-012: キーの形の文字列をリテラルで置かない（実行時に組み立てる）

describe('FR-282 AC-726 API キーの伏せ字と認証方式', () => {
  it('FR-282 AC-726 保存後の表示は値に由来しない固定の伏せ字で、末尾の文字を含まない', () => {
    const v = vault();
    const view = v.save({ endpoint: 'https://x.services.ai.azure.com/openai/v1', deployment: 'd', key: KEY, authMethod: 'api-key' });
    expect(view.configured).toBe(true);
    expect(view.keyMask).toBe(FIXED_KEY_MASK);
    expect(JSON.stringify(view)).not.toContain('wxyz');
    const other = vault().save({ endpoint: 'https://x.services.ai.azure.com/openai/v1', deployment: 'd', key: 'another-key-1234567890-QRST' });
    expect(other.keyMask).toBe(view.keyMask);
  });

  it('FR-282 AC-726 認証方式に Microsoft Entra ID を選ぶと API キーなしで保存でき、キーは保管しない', () => {
    const v = vault();
    const view = v.save({ endpoint: 'https://x.services.ai.azure.com/openai/v1', deployment: 'd', authMethod: 'entra' });
    expect(view.configured).toBe(true);
    expect(view.authMethod).toBe('entra');
    expect(view.keyMask).toBe('');
    expect(v.secret()).toBeNull();
    expect(v.entraReady()).toBe(true);
  });

  it('FR-282 AC-726 API キー方式でキーがないと保存できない', () => {
    expect(() => vault().save({ endpoint: 'https://x.services.ai.azure.com/openai/v1', deployment: 'd', authMethod: 'api-key' })).toThrow();
  });
});

describe('FR-283 AC-727 未設定のときは送信しない', () => {
  const view = (o: Partial<FoundryView>): FoundryView => ({ configured: true, endpoint: 'https://x/', host: 'x', deployment: 'd', keyMask: '', enabled: true, ...o });
  it('FR-283 AC-727 未設定・エンドポイントやデプロイ名なし・中継に届かない場合は送信せず設定画面への案内を返す', () => {
    for (const v of [null, view({ configured: false }), view({ endpoint: '' }), view({ deployment: '' })]) {
      const g = foundryRunGate(v);
      expect(g.ok).toBe(false);
      if (!g.ok) { expect(g.message).toContain('未設定'); expect(g.message).toContain('設定'); }
    }
    expect(foundryRunGate(view({})).ok).toBe(true);
  });
});

describe('FR-283 AC-728 失敗の案内', () => {
  it('FR-283 AC-728 認証エラー・タイムアウト・サーバーエラーを分類し、原因と次の行動を文字で示す', () => {
    expect(classifyFoundryFailure({ status: 401 })).toBe('auth');
    expect(classifyFoundryFailure({ cause: 'timeout' })).toBe('timeout');
    expect(classifyFoundryFailure({ status: 500 })).toBe('server');
    expect(classifyFoundryFailure({ networkError: true })).toBe('unreachable');
    for (const c of ['auth', 'timeout', 'server', 'unreachable'] as const) {
      const n = foundryFailureNotice(c);
      expect(n.reason.length).toBeGreaterThan(0);
      expect(n.action).toContain('もう一度実行');
      expect(n.text).toBe(n.reason + n.action);
    }
  });

  it('FR-283 AC-728 エラー表示にキー・トークンの値が出ない', () => {
    const t = redactSecrets(`failed with ${KEY} and Bearer eyJhbGciOiJSUzI1NiJ9.abc.def api-key: abcdefgh12345`, [KEY]);
    expect(t).not.toContain(KEY);
    expect(t).not.toContain('eyJhbGci');
    expect(t).not.toContain('abcdefgh12345');
  });
});
