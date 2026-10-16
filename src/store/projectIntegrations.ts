// Project ごとの外部連携の選択と設定（FR-201・FR-202・NFR-SEC-008）。画面は別の項目。
// 保存は store/persist.ts（Project の保存と同じ localStorage）。全量エクスポート（FR-053）・復元（FR-056）は
// discussion/restore.ts の登録口で含める（registerProjectIntegrationsSnapshot）。
// 保管場所は「名前」だけを持ち、資格情報の形式の値は保存を拒否する。選択を解除しても設定は残す。
import { create } from 'zustand';
import { credentialShapes } from '../integrations/credentialShape';
import { registerSnapshotSource } from '../discussion/restore';

/** PARAM-068: 1 Project で同時に選択できる外部連携の件数の上限 */
export const MAX_INTEGRATIONS_PER_PROJECT = 20;

/** 外部連携カタログの状態の語 */
export type IntegrationStatus = '計画' | '稼働' | '廃止予定' | '廃止';
export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = ['計画', '稼働', '廃止予定', '廃止'];

export interface CatalogIntegration { id: string; name: string; status: IntegrationStatus }

/** 確認状況（未確認は確認済みと区別する。確認日は YYYY-MM-DD） */
export interface Confirmation { status: '確認済み' | '未確認'; date?: string }

export interface IntegrationSetting {
  integrationId: string;
  name: string;
  /** 連携先 */
  target: string;
  /** 認証の方式 */
  authMethod: string;
  /** 資格情報の保管場所を指す名前（値は持たない） */
  secretStoreName: string;
  terms: Confirmation;
  cost: Confirmation;
  sla: Confirmation;
}

export interface ProjectIntegrations {
  /** 選択中の連携 ID（選択順） */
  selected: string[];
  /** 解除した連携の設定も残す */
  settings: Record<string, IntegrationSetting>;
  /** 選択した時点の連携名（カタログから消えても識別できる） */
  names: Record<string, string>;
}

export type IntResult = { ok: true } | { ok: false; reason: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const empty = (): ProjectIntegrations => ({ selected: [], settings: {}, names: {} });
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function checkConfirmation(label: string, c: Confirmation): string | null {
  if (c.status !== '確認済み' && c.status !== '未確認') return `${label}の確認状況は「確認済み」か「未確認」で指定してください。`;
  if (c.date !== undefined && c.date !== '' && !DATE_RE.test(c.date)) return `${label}の確認日は YYYY-MM-DD で入力してください。`;
  return null;
}

/** 設定の検証。資格情報の形式の値が欄にあれば拒否する（FR-202 AC-443・NFR-SEC-008） */
export function validateSetting(s: IntegrationSetting): string[] {
  const errors: string[] = [];
  const texts: Array<[string, string]> = [
    ['連携先', s.target], ['認証の方式', s.authMethod], ['保管場所の名前', s.secretStoreName],
    ['利用規約・ライセンスの確認日', s.terms.date ?? ''], ['費用の確認日', s.cost.date ?? ''], ['SLA・量の確認日', s.sla.date ?? ''],
  ];
  for (const [label, text] of texts) {
    const kinds = credentialShapes(text);
    if (kinds.length) errors.push(`${label}に資格情報とみなす形式（${kinds.join('、')}）の値は保存できません。保管場所の名前だけを入力してください。`);
  }
  for (const [label, c] of [['利用規約・ライセンス', s.terms], ['費用', s.cost], ['SLA・量', s.sla]] as const) {
    const e = checkConfirmation(label, c);
    if (e) errors.push(e);
  }
  return errors;
}

interface IntegrationsState {
  byProject: Record<string, ProjectIntegrations>;
  select: (projectId: string, item: CatalogIntegration) => IntResult;
  /** 選択を解除する。設定は保持する */
  deselect: (projectId: string, integrationId: string) => void;
  saveSetting: (projectId: string, setting: IntegrationSetting) => IntResult;
}

export const useProjectIntegrations = create<IntegrationsState>((set, get) => ({
  byProject: {},
  select: (projectId, item) => {
    const cur = get().byProject[projectId] ?? empty();
    if (cur.selected.includes(item.id)) return { ok: true };
    if (item.status === '廃止') return { ok: false, reason: `連携「${item.name}」は状態が「廃止」のため、新たに選択できません。` };
    if (cur.selected.length >= MAX_INTEGRATIONS_PER_PROJECT) {
      return { ok: false, reason: `1 Project で選択できる連携は ${MAX_INTEGRATIONS_PER_PROJECT} 件までです。不要な連携の選択を解除してください。` };
    }
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, selected: [...cur.selected, item.id], names: { ...cur.names, [item.id]: item.name } } } }));
    return { ok: true };
  },
  deselect: (projectId, integrationId) => set((s) => {
    const cur = s.byProject[projectId];
    if (!cur) return s;
    return { byProject: { ...s.byProject, [projectId]: { ...cur, selected: cur.selected.filter((id) => id !== integrationId) } } };
  }),
  saveSetting: (projectId, setting) => {
    const cur = get().byProject[projectId] ?? empty();
    if (!cur.selected.includes(setting.integrationId)) return { ok: false, reason: '選択していない連携の設定は記録できません。' };
    const errors = validateSetting(setting);
    if (errors.length) return { ok: false, reason: errors.join(' ') };
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, settings: { ...cur.settings, [setting.integrationId]: setting } } } }));
    return { ok: true };
  },
}));

/** 選択中の連携を、カタログの現在の状態つきで返す（廃止予定・廃止になっても残り、状態が分かる）。カタログにない連携は status が undefined */
export function selectionView(projectId: string, lookup: (id: string) => IntegrationStatus | undefined) {
  const cur = useProjectIntegrations.getState().byProject[projectId] ?? empty();
  return cur.selected.map((id) => ({ id, name: cur.names[id] ?? id, status: lookup(id), setting: cur.settings[id] }));
}

export function resetProjectIntegrations(): void { useProjectIntegrations.setState({ byProject: {} }); }

function cleanConfirmation(c: unknown): Confirmation {
  if (!isObj(c) || (c.status !== '確認済み' && c.status !== '未確認')) return { status: '未確認' };
  return typeof c.date === 'string' && DATE_RE.test(c.date) ? { status: c.status, date: c.date } : { status: c.status };
}

const str = (x: unknown) => (typeof x === 'string' ? x : '');

/** 保存・書き出しの内容を読む。形が正しくないものは捨て、資格情報の形式の値を含む設定は読まない（NFR-SEC-008）。問題の一覧も返す */
export function sanitizeIntegrations(data: unknown): { value: Record<string, ProjectIntegrations>; problems: string[] } {
  const value: Record<string, ProjectIntegrations> = {};
  const problems: string[] = [];
  if (!isObj(data)) return { value, problems: data === undefined ? [] : ['連携の選択と設定がオブジェクトではありません。'] };
  for (const [pid, v] of Object.entries(data)) {
    if (!isObj(v)) { problems.push(`Project ${pid}: 形が正しくありません。`); continue; }
    const names: Record<string, string> = {};
    if (isObj(v.names)) for (const [k, n] of Object.entries(v.names)) if (typeof n === 'string') names[k] = n;
    const selected = Array.isArray(v.selected) ? [...new Set(v.selected.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_INTEGRATIONS_PER_PROJECT) : [];
    const settings: Record<string, IntegrationSetting> = {};
    if (isObj(v.settings)) {
      for (const [id, raw] of Object.entries(v.settings)) {
        if (!isObj(raw)) continue;
        const s: IntegrationSetting = {
          integrationId: id, name: str(raw.name), target: str(raw.target), authMethod: str(raw.authMethod),
          secretStoreName: str(raw.secretStoreName), terms: cleanConfirmation(raw.terms), cost: cleanConfirmation(raw.cost), sla: cleanConfirmation(raw.sla),
        };
        const errs = validateSetting(s);
        if (errs.length) { problems.push(`Project ${pid} の連携 ${id}: ${errs[0]}`); continue; }
        settings[id] = s;
      }
    }
    value[pid] = { selected, settings, names };
  }
  return { value, problems };
}

/** 全量エクスポート（FR-053）と復元（FR-056）に選択と設定を含める。解除する関数を返す */
export function registerProjectIntegrationsSnapshot(): () => void {
  return registerSnapshotSource({
    key: 'projectIntegrations',
    capture: () => useProjectIntegrations.getState().byProject,
    validate: (value) => sanitizeIntegrations(value).problems,
    apply: (value) => useProjectIntegrations.setState({ byProject: sanitizeIntegrations(value).value }),
  });
}
