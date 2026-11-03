// 連携の選択と外部送信の条件（FR-203）。連携を選択・設定しても送信は起きない（選択は保存だけで、送信の経路を呼ばない）。
// 送信を伴う操作（AI・音声合成・手書き認識・パイプラインの実調査）の可否は、それぞれの実接続の有効化・確認（useAi・useAzure ほか）が決める。
// 顧客の了承は人が行う事項で、アプリは了承の記録を持たず、送信の条件にしない。
// ここは、選択済みの連携のうち確認状況が未確認のものを識別する純粋な関数。
import type { ProjectIntegrations } from '../store/projectIntegrations';

export interface IntegrationNotice {
  /** 確認状況に未確認が残る選択中の連携の名前（設定が未記録のものも未確認として数える） */
  unconfirmed: string[];
}

export function integrationNotice(cur: ProjectIntegrations | undefined): IntegrationNotice {
  const selected = cur?.selected ?? [];
  const unconfirmed = selected.filter((id) => {
    const s = cur?.settings[id];
    return !s || s.terms.status !== '確認済み' || s.cost.status !== '確認済み' || s.sla.status !== '確認済み';
  }).map((id) => cur?.names[id] ?? id);
  return { unconfirmed };
}
