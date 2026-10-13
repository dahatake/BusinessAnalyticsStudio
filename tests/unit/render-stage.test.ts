// FR-147 AC-246 AC-248 3D の描画の段階（最初のフレームは軽いシーンだけ、重い要素は後から）の遷移の単体テスト。
// 画面での確認（最初のフレームまでの時間・追従・クリック）は System Test（E2E-226〜230）が行う。
import { describe, expect, it } from 'vitest';
import { nextStage } from '../../src/three/stage';

describe('FR-147 AC-246 描画の段階の進め方', () => {
  it('最初のフレームの前（first）は、設定が済むと rest に進み、コンパイルが済むと shown に進む', () => {
    expect(nextStage('first', 'settled')).toBe('rest');
    expect(nextStage('rest', 'compiled')).toBe('shown');
  });

  it('段階は戻らず、飛ばさない（first のままコンパイル完了では shown にならない）', () => {
    expect(nextStage('first', 'compiled')).toBe('first');
    expect(nextStage('rest', 'settled')).toBe('rest');
    expect(nextStage('shown', 'settled')).toBe('shown');
    expect(nextStage('shown', 'compiled')).toBe('shown');
  });
});
