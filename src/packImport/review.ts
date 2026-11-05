// 取り込み前に人が確かめること（FR-304）。検証を通ったパックの、機密区分・ロゴの利用条件・種別「人」を数える（出典のない数値は検証エラーで取り込めず、確認欄の対象ではない: AC-851）。
// 個人名・連絡先の値は返さない。確かめた旨は保存しない（FR-219）。純粋な関数だけで書く（Node 専用の API は使わない）。
import { tr } from '../i18n';
import { countInternal, type BrandProfile, type PackData } from '../schema';
import type { UploadValidation } from './validate';

export interface ReviewItems {
  /** 機密区分の件数（`countInternal` と一致）。internal が 1 件以上のとき note に注意が入る */
  classification: { internal: number; shareable: number; note?: string };
  /** ロゴの利用条件（FR-061）。unknown のときだけ件数 1 と案内。confirmed は「確認済み」 */
  logo: { status: 'unknown' | 'confirmed'; unknownCount: number; note: string };
  /** 種別「人」のエンティティ（FR-213）。0 件のとき note は出さない。名前・連絡先は含めない */
  people: { count: number; note?: string };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 機密区分 `shareable` の項目の件数（`countInternal` と同じ数え方） */
export function countShareable(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countShareable(v), 0);
  if (!isObj(value)) return 0;
  let n = value.classification === 'shareable' ? 1 : 0;
  for (const v of Object.values(value)) n += countShareable(v);
  return n;
}

/** 取り込み前の確認事項を作る。検証を通ったパック（`validateUpload` の data・brand）を渡す */
export function reviewItems(data: PackData, brand: BrandProfile): ReviewItems {
  const internal = countInternal(data);
  const people = (data.entities?.entities ?? []).filter((e) => (e as { kind?: unknown }).kind === 'person').length;
  const unknownLogo = brand.logo.status === 'unknown';
  return {
    classification: {
      internal, shareable: countShareable(data),
      ...(internal > 0 ? { note: tr('機密区分 internal の項目は、エクスポートの際にだけ匿名化できます。外部 AI への送信時には自動では匿名化しません。') } : {}),
    },
    logo: {
      status: unknownLogo ? 'unknown' : 'confirmed', unknownCount: unknownLogo ? 1 : 0,
      note: unknownLogo
        ? tr('ロゴの利用条件が不明です。ロゴは取り込み後に確かめてください（利用条件の確認と差し替えはロゴの設定から。それまでは「LOGO（要許諾確認）」が表示されます）。')
        : tr('ロゴの利用条件は確認済みです。'),
    },
    people: {
      count: people,
      ...(people > 0 ? { note: tr('種別「人」のエンティティが含まれています。外部 AI への送信・エクスポートの前に、個人情報の確認が出ます。顧客の了承は、人が行ってください。') } : {}),
    },
  };
}

/** 検証の結果から確認事項を作る。検証エラーが 1 件でもあるとき（取り込めないとき）は出さない（AC-851） */
export function reviewUpload(v: UploadValidation): ReviewItems | undefined {
  return v.ok && v.data && v.brand ? reviewItems(v.data, v.brand) : undefined;
}
