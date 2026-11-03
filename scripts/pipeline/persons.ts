// パイプラインの種別「人」の確認（FR-219 AC-512）。`--live` で外部（LLM・WorkIQ・Web）へ送るとき、
// 作業フォルダーの顧客パックに種別「人」のエンティティがあれば、件数を示して続行するか尋ねる（既定は中止）。
import fs from 'node:fs';
import path from 'node:path';

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

/** 確認の質問文。件数だけを示し、種別「人」の値（個人名・連絡先）は出さない */
export function personConfirmQuestion(count: number, customer: string, projectName: string): string {
  return `種別「人」のエンティティ: ${count} 件を含む顧客パックです（案件: ${customer} / ${projectName}）。種別「人」の値は匿名化の対象ではありません。外部へ送信して続行しますか？ [y/N]`;
}
