// 「Copilot で分析実行」（FR-278）の Foundry 依頼の組み立てと応答の解釈。呼ぶのは中継プロセス（relay.ts の POST /foundry/review）だけ。
// 画面から届くのは、コンポーネントごとの id と、画面に出ているデータの文字。キー・エンドポイントは含まない。
// 応答は {id, proposal} の並びだけを受け取り、依頼にない id・文字でない案は捨てる（結果は、その id のコンポーネントの案としてだけ使う。AC-717）。

export interface ReviewComponent { id: string; data: string }
export interface ReviewItem { id: string; proposal: string }

/** 1 回の依頼で受け付けるコンポーネントの数と、1 つあたりのデータの文字数の上限（送信量と費用を抑える） */
export const MAX_REVIEW_COMPONENTS = 40;
export const MAX_REVIEW_DATA_CHARS = 4000;

/** 依頼の本文（body.components）を検証する。形が違うものは捨て、データは上限で切る */
export function parseReviewComponents(raw: unknown): ReviewComponent[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewComponent[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const o = c as { id?: unknown; data?: unknown };
    if (typeof o?.id !== 'string' || !o.id || seen.has(o.id) || typeof o.data !== 'string') continue;
    seen.add(o.id);
    out.push({ id: o.id, data: o.data.slice(0, MAX_REVIEW_DATA_CHARS) });
    if (out.length >= MAX_REVIEW_COMPONENTS) break;
  }
  return out;
}

export function buildReviewPrompt(components: readonly ReviewComponent[]): string {
  return [
    '次の［コンポーネント］は、業務分析アプリの各画面コンポーネントが保持しているデータです。コンポーネントごとに内容をレビューし、改善した内容の案（日本語）を作ってください。',
    '根拠にない内容は足さず、データが足りないコンポーネントは案を返さないでください。',
    '返答は JSON だけで、{"reviews":[{"id":"<コンポーネントの id>","proposal":"<案>"}]} の形にしてください。',
    '［コンポーネント］',
    ...components.map((c) => `- id: ${c.id}\n  データ: ${c.data}`),
  ].join('\n');
}

/** Foundry の返答の文章から reviews を取り出す。コードフェンスで囲まれていても読む。読めなければ null */
export function parseReviewReply(text: string, allowedIds: readonly string[]): ReviewItem[] | null {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (m?.[1] ?? text).trim();
  let j: unknown;
  try { j = JSON.parse(body); } catch { return null; }
  const list = (j as { reviews?: unknown })?.reviews;
  if (!Array.isArray(list)) return null;
  const allow = new Set(allowedIds);
  const out: ReviewItem[] = [];
  for (const r of list) {
    const o = r as { id?: unknown; proposal?: unknown };
    if (typeof o?.id === 'string' && allow.has(o.id) && typeof o.proposal === 'string' && o.proposal.trim() !== '' && !out.some((x) => x.id === o.id)) {
      out.push({ id: o.id, proposal: o.proposal });
    }
  }
  return out;
}
