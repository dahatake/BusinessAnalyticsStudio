// サンプルデータの判定（FR-008）。顧客パックに作成者の種別が `sample` の項目があれば、サンプルを表示している。
// 純粋な関数だけで書く。
import type { PackData } from '../schema';

const hasSample = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(hasSample);
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.createdBy === 'sample') return true;
  return Object.values(o).some(hasSample);
};

/** 顧客パックのデータに、サンプルの項目（createdBy が sample）が 1 つでも含まれるか */
export function hasSampleData(data: Pick<PackData, 'issues' | 'products' | 'plan' | 'entities' | 'architecture' | 'mocks' | 'show' | 'sources' | 'customer'>): boolean {
  return [data.customer, data.entities, data.issues, data.products, data.plan, data.architecture, data.mocks, data.show, data.sources].some(hasSample);
}
