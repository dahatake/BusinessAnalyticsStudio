// 作業先（デモ／実際の Project）の選択に使う、画面に依存しない規則（FR-144）。
import type { Company, Project } from '../store/projects';

export const DEMO_VALUE = 'demo';
export const REGISTER_VALUE = 'register';
const PROJECT_PREFIX = 'project:';

export interface TargetOption { value: string; label: string; kind: 'demo' | 'project' | 'register' }

/** 進行中（アーカイブされていない）の実 Project だけが選べる */
export function activeProjects(projects: readonly Project[]): Project[] {
  return projects.filter((p) => !p.archived);
}

/** 起動時に作業先の選択画面を出すか。件数によらず（0 件でも）起動のたびに必ず出す（FR-144 AC-237・AC-238・AC-239） */
export function shouldShowStartupPicker(_projects?: readonly Project[]): boolean {
  return true;
}

/** 現在の作業先の表示: 「デモ」または「企業名 / Project 名」 */
export function workTargetLabel(openId: string | null, projects: readonly Project[], companies: readonly Company[]): string {
  const project = openId ? projects.find((p) => p.id === openId) : undefined;
  const company = project ? companies.find((c) => c.id === project.companyId) : undefined;
  return project && company ? `${company.name} / ${project.name}` : 'デモ';
}

/** 選択画面の候補: デモ、各 Project（企業名 / Project 名）、実際の Project を登録 */
export function targetOptions(
  projects: readonly Project[],
  companies: readonly Company[],
  opts: { showDemo?: boolean; currentId?: string | null } = {},
): TargetOption[] {
  const real: TargetOption[] = [];
  for (const c of companies) {
    for (const p of activeProjects(projects)) {
      if (p.companyId === c.id) real.push({ value: PROJECT_PREFIX + p.id, label: `${c.name} / ${p.name}`, kind: 'project' });
    }
  }
  // 前回の作業先（AC-207 の復元先）。なければ、Project が 1 件ならその Project を最初の候補にする（AC-238）
  const lastId = opts.currentId ?? (real.length === 1 ? real[0]?.value.slice(PROJECT_PREFIX.length) : undefined);
  const first = real.filter((o) => o.value === PROJECT_PREFIX + (lastId ?? ''));
  const rest = real.filter((o) => !first.includes(o));
  const demo: TargetOption[] = opts.showDemo === false ? [] : [{ value: DEMO_VALUE, label: 'デモ（架空企業のお手本パック）', kind: 'demo' }];
  return [
    ...first,
    ...demo,
    ...rest,
    { value: REGISTER_VALUE, label: '実際の Project を登録', kind: 'register' },
  ];
}

export type TargetChoice = { kind: 'demo' } | { kind: 'register' } | { kind: 'project'; id: string };

export function parseChoice(value: string): TargetChoice | null {
  if (value === DEMO_VALUE) return { kind: 'demo' };
  if (value === REGISTER_VALUE) return { kind: 'register' };
  if (value.startsWith(PROJECT_PREFIX)) return { kind: 'project', id: value.slice(PROJECT_PREFIX.length) };
  return null;
}
