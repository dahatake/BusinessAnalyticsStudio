// 値の編集（FR-116）。アプリで値を編集すると、その値の作成者の種別は `human` に変わる。
import type { CreatedBy } from './common';

export function applyEdit<T extends { createdBy: CreatedBy }>(value: T, patch: Partial<Omit<T, 'createdBy'>>): T {
  return { ...value, ...patch, createdBy: 'human' };
}
