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
