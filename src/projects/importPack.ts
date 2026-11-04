// 顧客パックの取り込み処理（FR-302 AC-839〜842）。検証（FR-303）と人の確認（FR-304）を通ったパックだけを渡す。
// 全か無か: 新規は企業・Project を追加してから保存し、保存に失敗したら企業・Project を元に戻す。置き換えは保存だけ。
// ブランドは全体で 1 つなので、アップロードした brand-profile.json は検証だけで保存しない。通信はしない（C-01）。
import { tr } from '../i18n';
import type { PackData } from '../schema';
import { usePackStore } from '../store/pack';
import { saveProjectPackStrict } from '../store/projectPacks';
import { useProjects } from '../store/projects';

export type ImportRequest =
  | { mode: 'new'; data: PackData; company: string; project: string }
  | { mode: 'replace'; data: PackData; projectId: string };

export type ImportResult = { ok: true; projectId: string } | { ok: false; reason: string; remedy: string };

const fail = (reason: string, remedy: string): ImportResult => ({ ok: false, reason, remedy });

const SAVE_REMEDY = () => tr('端末の保存容量とブラウザーの保存の設定（プライベートモードなど）を確かめ、不要な Project の顧客パックを減らしてから、もう一度取り込んでください。現在の顧客パックと Project は変わっていません。');

/** 保存に成功したあと、開いている Project の画面に反映する */
function reflect(projectId: string, data: PackData): void {
  if (useProjects.getState().openId !== projectId) return;
  const cur = usePackStore.getState();
  if (cur.state.status !== 'ready') return;
  usePackStore.setState({ state: { ...cur.state, pack: { ...cur.state.pack, data } } });
}

export function importPack(req: ImportRequest): ImportResult {
  if (req.mode === 'replace') {
    if (!useProjects.getState().projects.some((p) => p.id === req.projectId)) {
      return fail(tr('置き換える Project が見つかりません。'), tr('置き換える Project を選び直してください。'));
    }
    const saved = saveProjectPackStrict(req.projectId, req.data);
    if (!saved.ok) return fail(tr('顧客パックを端末内に保存できませんでした（{reason}）。', { reason: saved.reason }), SAVE_REMEDY());
    reflect(req.projectId, req.data);
    return { ok: true, projectId: req.projectId };
  }

  const st = useProjects.getState();
  const before = { companies: st.companies, projects: st.projects, seq: st.seq, openId: st.openId, lastOpenedId: st.lastOpenedId };
  const rollback = () => useProjects.setState(before);
  const name = req.company.trim();
  const existing = st.companies.find((c) => c.name === name);
  let companyId = existing?.id;
  if (!companyId) {
    const c = st.addCompany(name);
    if (!c.ok) return fail(c.reason, tr('企業名を入力し直してください。'));
    companyId = c.id;
  }
  const p = useProjects.getState().addProject(companyId, req.project);
  if (!p.ok) { rollback(); return fail(p.reason, tr('Project 名を入力し直してください。')); }
  const saved = saveProjectPackStrict(p.id, req.data);
  if (!saved.ok) { rollback(); return fail(tr('顧客パックを端末内に保存できませんでした（{reason}）。', { reason: saved.reason }), SAVE_REMEDY()); }
  return { ok: true, projectId: p.id };
}
