// 用語集（FR-019）。文章の中の専門用語を見つけて、定義を添える純粋な関数。
export interface GlossaryEntry { term: string; definition: string }

export interface TextPart { text: string; entry?: GlossaryEntry }

/** 文章を、用語集の語（長い語を優先）とそれ以外に分ける。語が重なるときは先に始まるものを採る。 */
export function splitByGlossary(text: string, glossary: readonly GlossaryEntry[]): TextPart[] {
  const entries = glossary.filter((g) => g.term.length > 0);
  if (!text || entries.length === 0) return [{ text }];
  const parts: TextPart[] = [];
  let i = 0;
  let plain = '';
  while (i < text.length) {
    let hit: GlossaryEntry | undefined;
    for (const g of entries) {
      if (text.startsWith(g.term, i) && (!hit || g.term.length > hit.term.length)) hit = g;
    }
    if (hit) {
      if (plain) { parts.push({ text: plain }); plain = ''; }
      parts.push({ text: hit.term, entry: hit });
      i += hit.term.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) parts.push({ text: plain });
  return parts;
}
