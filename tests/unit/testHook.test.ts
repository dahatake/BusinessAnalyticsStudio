// テスト用フックの登録口（src/testing/hook.ts。FR-012 のキャンバスと FR-065 の 3D が共通で使う）
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(search: string) {
  vi.resetModules();
  const win: { location: { search: string }; __edbTest?: Record<string, unknown> } = { location: { search } };
  vi.stubGlobal('window', win);
  const { registerTestHook } = await import('../../src/testing/hook');
  return { registerTestHook, win };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('テスト用フックの登録口', () => {
  // FR-012
  it('FR-012 `?e2e=1` のときだけ window.__edbTest に名前空間ごとに登録でき、解除できる', async () => {
    const { registerTestHook, win } = await load('?e2e=1');
    const canvas = { viewport: () => 1 };
    const scene = { info: () => 2 };
    const off = registerTestHook('canvas', canvas);
    registerTestHook('scene', scene);
    expect(win.__edbTest).toEqual({ canvas, scene });
    off();
    expect(win.__edbTest).toEqual({ scene });
  });

  // FR-012
  it('FR-012 `?e2e=1` でないとき（通常の利用）は何も登録しない', async () => {
    const { registerTestHook, win } = await load('');
    registerTestHook('canvas', { a: () => 1 })();
    expect(win.__edbTest).toBeUndefined();
  });

  // FR-012
  it('FR-012 同じ名前空間を登録し直した後、古い登録の解除は新しい登録を消さない', async () => {
    const { registerTestHook, win } = await load('?e2e=1');
    const first = { a: () => 1 };
    const second = { a: () => 2 };
    const offFirst = registerTestHook('canvas', first);
    registerTestHook('canvas', second);
    offFirst();
    expect(win.__edbTest).toEqual({ canvas: second });
  });
});
