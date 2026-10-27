// 連携の選択と外部送信の了承（FR-203）。連携を選択・設定しても送信は起きない（選択は保存だけで、送信の経路を呼ばない）。
// 了承を要する送信（AI・音声合成・手書き認識・パイプラインの実調査）の可否は、既存の了承ゲート（ai/useConsent・useAi・useAzure）が決める。
// ここは、その結果（granted）を Project の選択に重ねて、画面に出す状態（了承を求める表示・未確認の識別）を決める純粋な関数。
import type { ProjectIntegrations } from '../store/projectIntegrations';
import { tr } from '../i18n';

export interface IntegrationNotice {
  /** 了承を要する送信が実行できるか（了承の記録が無ければ false。選択の有無で変わらない） */
  sendAllowed: boolean;
  /** 了承を求める表示（連携を選択していて、了承が無いときだけ） */
  consentNotice?: string;
  /** 確認状況に未確認が残る選択中の連携の名前（設定が未記録のものも未確認として数える） */
  unconfirmed: string[];
}

export function integrationNotice(consentGranted: boolean, cur: ProjectIntegrations | undefined): IntegrationNotice {
  const selected = cur?.selected ?? [];
  const unconfirmed = selected.filter((id) => {
    const s = cur?.settings[id];
    return !s || s.terms.status !== '確認済み' || s.cost.status !== '確認済み' || s.sla.status !== '確認済み';
  }).map((id) => cur?.names[id] ?? id);
  const consentNotice = selected.length > 0 && !consentGranted
    ? tr('顧客の了承の記録がありません。連携を選択しても、AI・音声合成・手書き認識・実調査など了承を要する外部送信は、了承を記録するまで実行されません（設定の「顧客の了承」）。')
    : undefined;
  return { sendAllowed: consentGranted, consentNotice, unconfirmed };
}
