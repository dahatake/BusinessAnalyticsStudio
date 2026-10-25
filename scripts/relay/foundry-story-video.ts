// ストーリー動画（FR-291）の生成の依頼文と応答の読み取り。呼ぶのは中継プロセスだけ（FR-275 の共通接続）。
// 送るのは、ユースケースの名称・概要・対象ペルソナ・手順・期待する効果だけ。キーは含めない。
export interface StoryVideoUseCase { name: string; summary: string; persona: string; steps: { title: string; description: string }[]; effect: string }
export interface StoryScene { scene: string; person: string; trouble: string; change: string }

const s = (v: unknown, max = 500): string => (typeof v === 'string' ? v : '').slice(0, max);

/** 受けたユースケースを、決まった形・長さに整える（それ以外の項目は捨てる）。不正なら null */
export function parseUseCase(raw: unknown): StoryVideoUseCase | null {
  const o = raw as Partial<StoryVideoUseCase> | null;
  if (!o || typeof o !== 'object' || typeof o.name !== 'string' || !o.name.trim() || !Array.isArray(o.steps) || o.steps.length === 0 || o.steps.length > 20) return null;
  return {
    name: s(o.name, 200), summary: s(o.summary, 1000), persona: s(o.persona, 200), effect: s(o.effect, 1000),
    steps: o.steps.map((x) => ({ title: s((x as { title?: unknown })?.title, 200), description: s((x as { description?: unknown })?.description, 1000) })),
  };
}

export function buildStoryboardPrompt(uc: StoryVideoUseCase): string {
  return [
    'あなたは、専門用語を使わず一般の人にも分かる言葉で、映画のようなストーリーボードを書く脚本家です。',
    '次のユースケースについて、「実現したらどんな場面で何がどうよくなるのか」を、手順と同じ順序・同じ件数のシーンで書いてください。',
    '各シーンは 場面（scene）・登場する人（person。対象ペルソナを使う）・困りごと（trouble）・実現後の変化（change）を、短い平易な文で書きます。',
    '次の JSON だけを返してください: {"scenes":[{"scene":"…","person":"…","trouble":"…","change":"…"}]}',
    '', JSON.stringify(uc),
  ].join('\n');
}

export function buildAnimationPrompt(uc: StoryVideoUseCase): string {
  return [
    '次のユースケースを、映画のように見せる自己完結の 1 つの HTML アニメーションにしてください。',
    '条件: HTML・CSS・JavaScript・インライン SVG だけで作る。外部 URL・外部ファイル・fetch・XMLHttpRequest・eval・動画や音声や GIF のファイル・iframe・link・フォームは使わない。',
    '手順と同じ順序で場面が切り替わり、各場面で「困りごと」から「実現後の変化」へ変わる様子を SVG と CSS アニメーションで表現する。',
    '<svg data-testid="story-svg"> を 1 つ含める。HTML だけを返し、説明文やコードフェンスは付けない。',
    '', JSON.stringify(uc),
  ].join('\n');
}

export function parseStoryboard(text: string): StoryScene[] | null {
  const m = /\{[\s\S]*\}/.exec(text);
  let j: unknown = null;
  try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  const list = (j as { scenes?: unknown })?.scenes;
  if (!Array.isArray(list)) return null;
  const out = list.map((x) => ({ scene: s((x as StoryScene)?.scene, 300).trim(), person: s((x as StoryScene)?.person, 200).trim(), trouble: s((x as StoryScene)?.trouble, 500).trim(), change: s((x as StoryScene)?.change, 500).trim() })).filter((x) => x.scene);
  return out.length > 0 ? out : null;
}

/** コードフェンスを外して HTML を取り出す。HTML らしくなければ null（採用の検査は画面側で行う） */
export function parseAnimationHtml(text: string): string | null {
  const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fence ? fence[1]! : text).trim();
  return /<\s*(html|svg|div|body)\b/i.test(body) ? body : null;
}

/** 使用量（トークン数）の概算。応答に使用量がないため、文字数 ÷ 4 の切り上げで数える */
export const approxTokens = (chars: number): number => Math.ceil(chars / 4);
