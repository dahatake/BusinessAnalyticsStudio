// 雛形への改善要望の記録（FR-131）。顧客パックとしてサポートしない要望（新しい画面種別など）は、顧客パックの生成では実装せず、
// 「雛形への改善要望」の記録ファイルに追記する。雛形のコードも顧客パックも書き換えない。
//
// 追加資料（商談メモなど）から、次の書き方の行を拾う（行頭の箇条書きの記号は無視する）:
//   画面種別: ○○           … ○○ が雛形の画面にないとき、「新しい画面種別」の要望として記録する（画面種別・画面タイプ・新しい画面・新規画面）
//   雛形への要望: ○○        … そのまま記録する（雛形への改善要望・改善要望も同じ）
import fs from 'node:fs';
import path from 'node:path';
import { isoLocal } from './common';
import type { Material } from './generate';

export const IMPROVEMENT_FILE = 'template-improvement-requests.md';

export interface ImprovementRequest {
  kind: 'screen-type' | 'explicit';
  text: string;
  /** 要望が書かれていた追加資料のファイル名 */
  source: string;
}

/** 要求定義書の主要画面（A-13）のうち、雛形の画面の一覧（registry.ts）にまだ出ていないもの。画面の種別として「サポートする」 */
const PLANNED_SCREENS = ['優先順位分析', 'ナレッジグラフ', 'アーキテクチャ図', '議論ツリー', '設定パネル', 'チャット', 'キャンバス', '課題-解決策分析', 'ガントチャート', 'ホワイトボード'];

const norm = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[\s\-_・「」『』()（）]/g, '').replace(/(画面|ビュー|view)$/u, '');

/** 雛形がサポートする画面の名前（`src/screens/registry.ts` の key と label と、主要画面の一覧） */
export function supportedScreens(template: string): Set<string> {
  const names = new Set<string>(PLANNED_SCREENS.map(norm));
  const reg = path.join(template, 'src', 'screens', 'registry.ts');
  if (fs.existsSync(reg)) {
    for (const m of fs.readFileSync(reg, 'utf8').matchAll(/\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/g)) {
      names.add(norm(m[1]!));
      names.add(norm(m[2]!));
    }
  }
  return names;
}

const bullet = /^\s*(?:[-*+・●○]|\d+[.)])?\s*/;
const SCREEN_LINE = /^(?:新しい画面種別|画面種別|画面タイプ|新しい画面|新規画面)\s*[:：]\s*(.+)$/;
const EXPLICIT_LINE = /^(?:雛形への改善要望|雛形への要望|改善要望)\s*[:：]\s*(.+)$/;

/** 追加資料から、雛形への改善要望を拾う。画面種別は、雛形にある画面（`supported`）なら要望にしない */
export function extractImprovementRequests(materials: readonly Material[], supported: ReadonlySet<string>): ImprovementRequest[] {
  const out: ImprovementRequest[] = [];
  const seen = new Set<string>();
  const add = (r: ImprovementRequest): void => {
    const k = `${r.kind}\u0000${r.text}`;
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  };
  for (const m of materials) {
    for (const raw of m.text.split(/\r?\n/)) {
      const line = raw.replace(bullet, '').trim();
      const ex = EXPLICIT_LINE.exec(line);
      if (ex) { add({ kind: 'explicit', text: ex[1]!.trim(), source: m.name }); continue; }
      const sc = SCREEN_LINE.exec(line);
      if (!sc) continue;
      // 「ガントチャート、ロードマップ」のように並べて書いてもよい
      for (const name of sc[1]!.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)) {
        if (!supported.has(norm(name))) add({ kind: 'screen-type', text: name, source: m.name });
      }
    }
  }
  return out;
}

const describe = (r: ImprovementRequest): string => (r.kind === 'screen-type' ? `新しい画面種別: ${r.text}` : r.text);

/**
 * 記録ファイルに追記する（なければ作る）。同じ顧客・資料・内容がすでにあれば、重ねて追記しない。
 * 追記した要望を返す。
 */
export function recordImprovementRequests(
  file: string, customer: string, requests: readonly ImprovementRequest[], now: Date = new Date(),
): ImprovementRequest[] {
  if (requests.length === 0) return [];
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : '';
  const added: ImprovementRequest[] = [];
  let body = '';
  for (const r of requests) {
    const tail = `顧客: ${customer} / 追加資料: ${r.source} / ${describe(r)}`;
    if (current.split(/\r?\n/).some((l) => l.endsWith(tail))) continue;
    body += `- [${isoLocal(now)}] ${tail}\n`;
    added.push(r);
  }
  if (added.length === 0) return [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const head = exists ? '' : '# 雛形への改善要望\n\n顧客パックとしてサポートしない要望です。顧客パックの生成では実装せず、雛形（共通のアプリ）の改善として検討します。\n\n';
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${head}${body}`, 'utf8');
  return added;
}
