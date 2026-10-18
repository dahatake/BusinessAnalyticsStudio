// パイプラインの了承のゲート（FR-181 AC-381）。案件（企業・Project の単位）に顧客の了承の記録がなければ、
// 外部（LLM・WorkIQ・Web）へ送信する実調査・生成をせず、モック／前提を置いたサンプルで進める。
// 記録は作業フォルダーの consent.json（コミットされない場所）に、案件の鍵ごとに持つ。デモの記録は実 Project の了承にならない（鍵が別）。
import fs from 'node:fs';
import path from 'node:path';
import { consentKeyOf, parseConsentRecord, type ConsentRecord } from '../../src/ai/consent';
import type { Inputs, PipelinePaths } from './common';

export const CONSENT_FILE = 'consent.json';

/** 案件の了承の記録を読む。ファイルがない・壊れている・個人名らしい値を含む記録は「記録なし」 */
export function readConsent(paths: Pick<PipelinePaths, 'workspace'>, input: Pick<Inputs, 'customer' | 'projectName'>): ConsentRecord | undefined {
  const file = path.join(paths.workspace, CONSENT_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { records?: Record<string, unknown> };
    return parseConsentRecord(j.records?.[consentKeyOf(input.customer, input.projectName)]);
  } catch {
    return undefined;
  }
}

/** 作業フォルダーの顧客パック（public/data/entities.json）にある種別「人」のエンティティの件数。パックがなければ 0（FR-219） */
export function countPersonsInWorkDir(workDir: string): number {
  const file = path.join(workDir, 'public', 'data', 'entities.json');
  if (!fs.existsSync(file)) return 0;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { entities?: Array<{ kind?: string }> };
    return (j.entities ?? []).filter((e) => e.kind === 'person').length;
  } catch {
    return 0;
  }
}

/** 実行の出力に示す 1 行（FR-219。パイプラインは対話の確認を出さない）。個人名・連絡先の値は出さない */
export function personConsentLine(count: number, record: ConsentRecord | undefined): string {
  return `種別「人」のエンティティ: ${count} 件を含む顧客パックです。顧客の了承の確認日: ${record?.confirmedOn ?? '（consent.json から確認日を読めません）'}。種別「人」の値は匿名化の対象ではありません。続行します。`;
}
