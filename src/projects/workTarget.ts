// 作業先（デモ／実際の Project）の選択に使う、画面に依存しない規則（FR-144）。
import type { Company, Project } from '../store/projects';

/** 起動時に選択画面を出す、進行中の実 Project の件数の下限（AC-229: 2 件以上。AC-207 の開き直しを妨げない） */
export const STARTUP_PICKER_MIN_PROJECTS = 2;

export const DEMO_VALUE = 'demo';
export const REGISTER_VALUE = 'register';
const PROJECT_PREFIX = 'project:';

export interface TargetOption { value: string; label: string; kind: 'demo' | 'project' | 'register' }

/** 進行中（アーカイブされていない）の実 Project だけが選べる */
export function activeProjects(projects: readonly Project[]): Project[] {
  return projects.filter((p) => !p.archived);
}

/** 起動時に作業先の選択画面を出すか（実 Project が STARTUP_PICKER_MIN_PROJECTS 件以上のとき。0 件はデモで開く: AC-230） */
export function shouldShowStartupPicker(projects: readonly Project[]): boolean {
  return activeProjects(projects).length >= STARTUP_PICKER_MIN_PROJECTS;
}

/** 現在の作業先の表示: 「デモ」または「企業名 / Project 名」 */
export function workTargetLabel(openId: string | null, projects: readonly Project[], companies: readonly Company[]): string {
  const project = openId ? projects.find((p) => p.id === openId) : undefined;
  const company = project ? companies.find((c) => c.id === project.companyId) : undefined;
  return project && company ? `${company.name} / ${project.name}` : 'デモ';
}

/** 選択画面の候補: デモ、各 Project（企業名 / Project 名）、実際の Project を登録 */
export function targetOptions(projects: readonly Project[], companies: readonly Company[]): TargetOption[] {
  const real: TargetOption[] = [];
  for (const c of companies) {
    for (const p of activeProjects(projects)) {
      if (p.companyId === c.id) real.push({ value: PROJECT_PREFIX + p.id, label: `${c.name} / ${p.name}`, kind: 'project' });
    }
  }
  return [
    { value: DEMO_VALUE, label: 'デモ（架空企業のお手本パック）', kind: 'demo' },
    ...real,
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
