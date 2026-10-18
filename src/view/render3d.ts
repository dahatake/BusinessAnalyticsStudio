// 3D を描画できる環境か（WebGPU・WebGL2 のどちらかが使える。FR-065）。表示モードの可否（FR-217 AC-500）にだけ使う。
// 結果は 1 回だけ求めて保つ。テストは setCan3DForTest で差し替える。
import { is3DAvailable } from '../datacatalog/viewer';

let cached: boolean | undefined;

export function detect3D(): boolean {
  if (cached !== undefined) return cached;
  let hasWebGPU = false;
  let hasWebGL2 = false;
  try { hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as unknown as { gpu?: unknown }).gpu; } catch { hasWebGPU = false; }
  try { hasWebGL2 = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2'); } catch { hasWebGL2 = false; }
  cached = is3DAvailable({ hasWebGPU, hasWebGL2 });
  return cached;
}

/** テスト用: 判定の結果を差し替える（undefined で判定し直す） */
export function setCan3DForTest(v: boolean | undefined): void {
  cached = v;
}
