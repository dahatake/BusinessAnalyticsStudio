// 企業・Project・ステッパーの位置・分析の入力値を、この端末の localStorage だけに保存・復元する（FR-137 AC-207）。
// サーバー・ほかの端末へは送らない（NFR-SEC-004 AC-218。利用者が書き出す操作は別）。共有・権限の仕組みはない（Q-009 A）。
import { create } from 'zustand';
import { useAnalyses, type Analysis } from './analyses';
import { useOkr, type OkrSet } from './okr';
import { useProjects, type Company, type Project } from './projects';
import { useStepper } from './stepper';
import { useUseCases, type UseCaseSet } from './usecases';
import { useDataCatalog } from './datacatalog';
import type { ExplicitLink } from '../datacatalog/model';

export const STORAGE_KEY = 'eabk.projects.v1';

interface Snapshot {
  v: 1;
  companies: Company[];
  projects: Project[];
  openId: string | null;
  seq: number;
  analyses: Record<string, Analysis>;
  steps: Record<string, number>;
  /** 作業先ごとの KPI と OKR（FR-153）。古い保存内容にはない */
  okr?: Record<string, OkrSet>;
  /** Project ごとのユースケースとアニメーション（FR-158・FR-155）。古い保存内容にはない */
  usecases?: Record<string, UseCaseSet>;
  /** Project ごとのデータカタログの明示の紐づけ（FR-160）。古い保存内容にはない */
  dataLinks?: Record<string, ExplicitLink[]>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function snapshot(): Snapshot {
  const p = useProjects.getState();
  return {
    v: 1,
    companies: p.companies,
    projects: p.projects,
    openId: p.openId,
    seq: p.seq,
    analyses: useAnalyses.getState().byProject,
    steps: useStepper.getState().byProject,
    okr: useOkr.getState().byTarget,
    usecases: useUseCases.getState().byProject,
    dataLinks: useDataCatalog.getState().linksByProject,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 保存した内容を各 store へ戻す。壊れている・なければ何もしない（空の状態で始まる）。 */
export function restore(storage: Store): boolean {
  let data: unknown;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isObj(data) || data.v !== 1 || !Array.isArray(data.companies) || !Array.isArray(data.projects)) return false;
  const companies = (data.companies as Company[]).filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string');
  const projects = (data.projects as Project[]).filter((p) => isObj(p) && typeof p.id === 'string' && typeof p.companyId === 'string' && typeof p.name === 'string');
  const openId = typeof data.openId === 'string' && projects.some((p) => p.id === data.openId && !p.archived) ? data.openId : null;
  const steps = isObj(data.steps) ? (data.steps as Record<string, number>) : {};
  const analyses = isObj(data.analyses) ? (data.analyses as Record<string, Analysis>) : {};
  useProjects.setState({ companies, projects, openId, seq: typeof data.seq === 'number' ? data.seq : companies.length + projects.length });
  useAnalyses.setState({ byProject: analyses });
  useStepper.setState({ byProject: steps });
  const okr = isObj(data.okr) ? (data.okr as Record<string, OkrSet>) : {};
  useOkr.setState({ byTarget: Object.fromEntries(Object.entries(okr).filter(([, v]) => isObj(v) && Array.isArray(v.objectives))) });
  const ucs = isObj(data.usecases) ? (data.usecases as Record<string, UseCaseSet>) : {};
  // 導出元の参照（source。FR-158 AC-290）は古い保存内容にはない。形が正しくないものは捨てて、ユースケース自体は読む
  const cleanItems = (items: UseCaseSet['items']) => items.map((u) => {
    const src = (u as { source?: unknown }).source;
    const ok = isObj(src) && typeof src.solutionId === 'string' && typeof src.issueId === 'string';
    if (ok) return u;
    const { source: _drop, ...rest } = u;
    return rest;
  });
  useUseCases.setState({ byProject: Object.fromEntries(Object.entries(ucs).filter(([, v]) => isObj(v) && Array.isArray(v.items)).map(([k, v]) => [k, { items: cleanItems(v.items), animations: isObj(v.animations) ? v.animations : {}, seq: typeof v.seq === 'number' ? v.seq : v.items.length }])) });
  const dl = isObj(data.dataLinks) ? data.dataLinks : {};
  useDataCatalog.setState({
    linksByProject: Object.fromEntries(Object.entries(dl).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [
      k, (v as unknown[]).filter((l): l is ExplicitLink => isObj(l) && typeof l.entityKey === 'string' && typeof l.useCaseId === 'string'),
    ])),
    selectedKey: null,
  });
  useStepper.getState().switchTo(openId);
  return true;
}

/** 変更のたびに保存する。保存できなくても（容量・無効化）操作は続ける。戻り値は購読の解除。 */
export function startPersistence(storage: Store): () => void {
  const save = () => {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch { /* 保存できなくても使い続けられる */ }
  };
  const offs = [useProjects.subscribe(save), useAnalyses.subscribe(save), useStepper.subscribe(save), useOkr.subscribe(save), useUseCases.subscribe(save), useDataCatalog.subscribe(save)];
  return () => offs.forEach((off) => off());
}

/** 保存内容の読込が終わったか（FR-144 AC-229: 起動時の作業先の選択は、読込の後に評価する）。復元できなかった場合も true になる */
export const useRestoreStatus = create<{ done: boolean }>(() => ({ done: false }));

/** アプリの起動時に 1 回: 復元してから保存を始める */
export function initProjectPersistence(): void {
  try {
    restore(window.localStorage);
    startPersistence(window.localStorage);
  } catch { /* localStorage が使えない環境では保存しない */ }
  useRestoreStatus.setState({ done: true });
}
