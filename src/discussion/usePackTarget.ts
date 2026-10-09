// 起動中の顧客パックの顧客名・Project 名と、議論データの鍵。パックが読めていなければ null。
import { usePackStore } from '../store/pack';
import { packKeyOf, type Theme } from './model';

export interface PackTarget {
  customerName: string;
  projectName: string;
  key: string;
  issues: Array<{ id: string; title: string }>;
}

export function usePackTarget(): PackTarget | null {
  const state = usePackStore((s) => s.state);
  if (state.status !== 'ready') return null;
  const { customer, issues } = state.pack.data;
  return {
    customerName: customer.name,
    projectName: customer.projectName,
    key: packKeyOf(customer.name, customer.projectName),
    issues: issues.issues.map((i) => ({ id: i.id, title: i.title })),
  };
}

/** 課題に、すでにテーマがあるか */
export function hasThemeFor(themes: readonly Theme[], issueId: string): boolean {
  return themes.some((t) => t.issueId === issueId);
}
