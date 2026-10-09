// テスト用フック（tests/system/CONTRACT.md §6）。`?e2e=1` のときだけ `window.__edbTest` が有効になる。
// 各画面は `registerTestHooks('canvas', {...})` で名前空間ごとに足す。画面に見える状態を読むためだけに使う。
export function isE2E(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('e2e') === '1';
}

export function registerTestHooks(namespace: string, hooks: Record<string, (...args: any[]) => unknown>): () => void {
  if (!isE2E()) return () => {};
  const w = window as unknown as { __edbTest?: Record<string, unknown> };
  w.__edbTest = w.__edbTest ?? {};
  w.__edbTest[namespace] = hooks;
  return () => {
    if (w.__edbTest && w.__edbTest[namespace] === hooks) delete w.__edbTest[namespace];
  };
}
