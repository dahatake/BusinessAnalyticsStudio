// テスト用フック（tests/system/CONTRACT.md §6）。`?e2e=1` のときだけ window.__edbTest を作る。
// 各項目は、自分の担当のフックを registerTestHook で足す（名前空間ごとに 1 つ。画面に見える状態を読むためだけに使う）。
// 戻り値は登録の解除。画面の useEffect からそのまま返せる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestHook(key: string, impl: Record<string, (...args: any[]) => unknown>): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (new URLSearchParams(window.location.search).get('e2e') !== '1') return () => undefined;
  const w = window as unknown as { __edbTest?: Record<string, unknown> };
  w.__edbTest = { ...(w.__edbTest ?? {}), [key]: impl };
  return () => {
    if (w.__edbTest && w.__edbTest[key] === impl) {
      const { [key]: _removed, ...rest } = w.__edbTest;
      w.__edbTest = rest;
    }
  };
}
