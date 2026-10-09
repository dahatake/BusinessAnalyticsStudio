// テスト用フック（tests/system/CONTRACT.md §6）。`?e2e=1` のときだけ window.__edbTest を作る。
// 各項目は、自分の担当のフックを registerTestHook で足す。
export function registerTestHook(key: string, impl: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('e2e') !== '1') return;
  const w = window as unknown as { __edbTest?: Record<string, unknown> };
  w.__edbTest = { ...(w.__edbTest ?? {}), [key]: impl };
}
