// 詳細パネルの置き場（FR-044）。詳細パネルは、課題-解決策分析のように専用の置き場を持つ画面と、一覧表のように
// 選んだ項目をその場で編集する画面の両方に出る。同時に出る詳細パネルは 1 つだけにする（data-testid の重複と、出典カードの二重表示を避ける）。
// 優先度の高い置き場が見えているときは、ほかの置き場の詳細パネルは出さない。タブで隠れている置き場は数えない。
import { useEffect, useId } from 'react';
import { create } from 'zustand';

interface Host { id: string; priority: number }

const useHosts = create<{ hosts: Host[] }>(() => ({ hosts: [] }));

function register(h: Host): () => void {
  useHosts.setState((s) => ({ hosts: [...s.hosts, h] }));
  return () => useHosts.setState((s) => ({ hosts: s.hosts.filter((x) => x.id !== h.id) }));
}

/** この置き場が、いま詳細パネルを出す番か。優先度が高いものが先、同じなら先に出たものが先。`visible` が false の置き場は数えない */
export function useDetailHost(priority: number, visible = true): boolean {
  const id = useId();
  const hosts = useHosts((s) => s.hosts);
  useEffect(() => (visible ? register({ id, priority }) : undefined), [id, priority, visible]);
  if (!visible) return false;
  if (hosts.length === 0) return true;
  let best = hosts[0]!;
  for (const h of hosts) if (h.priority > best.priority) best = h;
  return best.id === id;
}
